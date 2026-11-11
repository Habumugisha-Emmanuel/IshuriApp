const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { School, SmsLedger, User } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const smsWallet = require("../services/smsWallet");

const TIMEZONE = "Africa/Kigali";

function zonedMidnight(year, month, day) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(guess)
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

function kigaliStamp(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) % 24 };
}

function bounds(period, year, month) {
  const now = kigaliStamp(new Date());
  const y = year >= 2020 && year <= now.year ? year : now.year;
  const m = month >= 1 && month <= 12 ? month : now.month;
  if (period === "day") {
    const start = zonedMidnight(now.year, now.month, now.day);
    return { start, end: new Date(start.getTime() + 86400000), year: now.year, month: now.month };
  }
  if (period === "week") {
    const midnight = zonedMidnight(now.year, now.month, now.day);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(midnight);
    const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] || 0;
    const start = new Date(midnight.getTime() - back * 86400000);
    return { start, end: new Date(start.getTime() + 7 * 86400000), year: now.year, month: now.month };
  }
  if (period === "year") {
    return { start: zonedMidnight(y, 1, 1), end: zonedMidnight(y + 1, 1, 1), year: y, month: m };
  }
  const start = zonedMidnight(y, m, 1);
  const end = m === 12 ? zonedMidnight(y + 1, 1, 1) : zonedMidnight(y, m + 1, 1);
  return { start, end, year: y, month: m };
}

function seriesKeys(period, start, end) {
  if (period === "day") return Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
  if (period === "year") {
    const { year } = kigaliStamp(start);
    return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  }
  const keys = [];
  let cursor = start.getTime();
  const last = end.getTime() - 1;
  while (cursor <= last && keys.length < 400) {
    const stamp = kigaliStamp(new Date(cursor));
    keys.push(`${stamp.year}-${String(stamp.month).padStart(2, "0")}-${String(stamp.day).padStart(2, "0")}`);
    cursor += 86400000;
  }
  return [...new Set(keys)];
}

function seriesLabel(period, bucket) {
  if (period === "day") return bucket;
  if (period === "year") {
    const [year, month] = bucket.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  const [year, month, day] = bucket.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(Date.UTC(year, month - 1, day)));
}

const router = express.Router();
router.use(authRequired);

router.get(
  "/analytics",
  requireRoles("school_admin", "teacher", "discipline"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const period = ["day", "week", "month", "year"].includes(req.query.period) ? req.query.period : "month";
    const billing = ["all", "paid", "unpaid"].includes(req.query.billing) ? req.query.billing : "all";
    const { start, end, year, month } = bounds(period, Number(req.query.year), Number(req.query.month));
    const mine = req.user.role !== "school_admin";
    const match = { type: "send_debit", school: req.user.school, createdAt: { $gte: start, $lt: end } };
    if (mine) match.createdBy = req.user._id;
    const rows = await SmsLedger.aggregate([
      { $match: match },
      {
        $addFields: {
          resolvedBilling: { $ifNull: ["$billing", "paid"] },
          resolvedCategory: {
            $cond: [
              { $in: [{ $ifNull: ["$category", ""] }, ["marks", "results", "discipline", "notice"]] },
              "$category",
              {
                $switch: {
                  branches: [
                    { case: { $regexMatch: { input: { $ifNull: ["$messagePreview", ""] }, regex: "Discipline notice", options: "i" } }, then: "discipline" },
                    { case: { $regexMatch: { input: { $ifNull: ["$messagePreview", ""] }, regex: "results for", options: "i" } }, then: "results" },
                    { case: { $regexMatch: { input: { $ifNull: ["$messagePreview", ""] }, regex: " scored ", options: "i" } }, then: "marks" },
                  ],
                  default: "notice",
                },
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            bucket: {
              $dateToString: {
                format: period === "day" ? "%H" : period === "year" ? "%Y-%m" : "%Y-%m-%d",
                date: "$createdAt",
                timezone: TIMEZONE,
              },
            },
            billing: "$resolvedBilling",
            category: "$resolvedCategory",
            person: "$createdBy",
          },
          messages: { $sum: { $ifNull: ["$recipients", 1] } },
        },
      },
    ]);

    const categories = { marks: 0, results: 0, discipline: 0, notice: 0 };
    const paid = { messages: 0 };
    const unpaid = { messages: 0 };
    const byBucket = new Map();
    const byPerson = new Map();
    rows.forEach((row) => {
      const kind = row._id.billing === "unpaid" ? "unpaid" : "paid";
      const count = row.messages;
      if (kind === "unpaid") unpaid.messages += count;
      else paid.messages += count;
      const visible = billing === "all" || billing === kind;
      if (!visible) return;
      const category = categories[row._id.category] === undefined ? "notice" : row._id.category;
      categories[category] += count;
      byBucket.set(row._id.bucket, (byBucket.get(row._id.bucket) || 0) + count);
      const person = String(row._id.person || "");
      const current = byPerson.get(person) || { messages: 0, paid: 0, unpaid: 0 };
      current.messages += count;
      current[kind] += count;
      byPerson.set(person, current);
    });

    const series = seriesKeys(period, start, end).map((bucket) => ({
      bucket,
      label: seriesLabel(period, bucket),
      messages: byBucket.get(bucket) || 0,
    }));
    let people = [];
    if (!mine) {
      const ids = [...byPerson.keys()].filter((id) => id && id !== "undefined");
      const users = await User.find({ _id: { $in: ids } }).select("fullName role");
      const names = new Map(users.map((user) => [String(user._id), user]));
      people = [...byPerson.entries()]
        .map(([id, counts]) => ({
          id,
          name: names.get(id)?.fullName || "Earlier sends",
          role: names.get(id)?.role || "",
          ...counts,
        }))
        .sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name));
    }

    res.json({
      success: true,
      period,
      year,
      month,
      billing,
      timezone: TIMEZONE,
      from: start,
      to: new Date(),
      scope: mine ? "mine" : "school",
      totals: {
        messages: paid.messages + unpaid.messages,
        paid: paid.messages,
        unpaid: unpaid.messages,
        shown: billing === "paid" ? paid.messages : billing === "unpaid" ? unpaid.messages : paid.messages + unpaid.messages,
      },
      categories,
      series,
      people,
    });
  })
);

router.get(
  "/ledger",
  requireRoles("super_admin", "school_admin"),
  asyncHandler(async (req, res) => {
    const filter = req.user.role === "super_admin" ? {} : { school: req.user.school };
    if (req.query.schoolId && req.user.role === "super_admin") filter.school = req.query.schoolId;
    const items = await SmsLedger.find(filter).sort({ createdAt: -1 }).limit(100).populate("school", "name");
    res.json({ success: true, items });
  })
);

router.get(
  "/wallet",
  requireRoles("school_admin", "teacher", "discipline"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school).select("name messagesRemaining messagesGranted");
    if (!school) throw new ApiError(404, "School not found");
    const granted = school.messagesGranted || 0;
    const remaining = school.messagesRemaining || 0;
    const active = granted > 0;
    res.json({
      success: true,
      wallet: {
        active,
        remaining,
        granted,
        needsTopUp: active && remaining <= 0,
        message: !active
          ? "No message limit is set yet. Sending stays open until IshuriApp records a payment."
          : remaining > 0
            ? `Message Wallet: ${remaining} message${remaining === 1 ? "" : "s"} left.`
            : "Your Message Wallet is empty. Top up the Message Wallet before sending more messages.",
      },
    });
  })
);

router.get(
  "/school-wallet",
  requireRoles("school_admin"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school).select("name smsBalance status");
    res.json({ success: true, school });
  })
);

router.post(
  "/send",
  requireRoles("school_admin"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    if (school.status !== "approved") throw new ApiError(400, "School must be approved first");
    const sent = await smsWallet.sendFromSchool({
      school,
      phones: req.body.phones,
      message: req.body.message,
      createdBy: req.user._id,
      category: "notice",
    });
    res.json({
      success: true,
      ...sent,
      message: sent.result?.simulated
        ? "The message was not sent. SMS is turned off on the server."
        : `Sent to ${(sent.result?.recipients || []).join(", ") || sent.delivered}.${sent.walletMessage ? ` ${sent.walletMessage}` : ""}`,
    });
  })
);

module.exports = router;
