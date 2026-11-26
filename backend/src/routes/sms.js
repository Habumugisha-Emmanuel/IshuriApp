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

function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function weekStart(year, month, day) {
  const midnight = zonedMidnight(year, month, day);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(midnight);
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] || 0;
  return new Date(midnight.getTime() - back * 86400000);
}

function tighten(window, period, fromText, toText) {
  let { start, end, year } = window;
  if (year && (period === "all" || period === "day" || period === "week")) {
    const yearStart = zonedMidnight(year, 1, 1);
    const yearEnd = zonedMidnight(year + 1, 1, 1);
    start = start ? new Date(Math.max(start.getTime(), yearStart.getTime())) : yearStart;
    end = end ? new Date(Math.min(end.getTime(), yearEnd.getTime())) : yearEnd;
  }
  const fromDay = parseDay(fromText);
  const toDay = parseDay(toText);
  if (fromDay) {
    const fromStart = zonedMidnight(fromDay.year, fromDay.month, fromDay.day);
    start = start ? new Date(Math.max(start.getTime(), fromStart.getTime())) : fromStart;
  }
  if (toDay) {
    const toEnd = new Date(zonedMidnight(toDay.year, toDay.month, toDay.day).getTime() + 86400000);
    end = end ? new Date(Math.min(end.getTime(), toEnd.getTime())) : toEnd;
  }
  if (start && end && end.getTime() < start.getTime()) end = new Date(start.getTime());
  return { ...window, start, end };
}

function bounds(period, year, month, on, term) {
  const now = kigaliStamp(new Date());
  const y = year >= 2020 && year <= now.year + 1 ? year : now.year;
  const m = month >= 1 && month <= 12 ? month : now.month;
  const picked = parseDay(on) || now;
  if (period === "all") return { start: null, end: null, year: y, month: m };
  if (period === "day") {
    const start = zonedMidnight(picked.year, picked.month, picked.day);
    return { start, end: new Date(start.getTime() + 86400000), year: picked.year, month: picked.month };
  }
  if (period === "week") {
    const start = weekStart(picked.year, picked.month, picked.day);
    return { start, end: new Date(start.getTime() + 7 * 86400000), year: picked.year, month: picked.month };
  }
  if (period === "year" && term === "1") return { start: zonedMidnight(y, 1, 1), end: zonedMidnight(y, 5, 1), year: y, month: m };
  if (period === "year" && term === "2") return { start: zonedMidnight(y, 5, 1), end: zonedMidnight(y, 9, 1), year: y, month: m };
  if (period === "year" && term === "3") return { start: zonedMidnight(y, 9, 1), end: zonedMidnight(y + 1, 1, 1), year: y, month: m };
  if (period === "year") return { start: zonedMidnight(y, 1, 1), end: zonedMidnight(y + 1, 1, 1), year: y, month: m };
  const start = zonedMidnight(y, m, 1);
  const end = m === 12 ? zonedMidnight(y + 1, 1, 1) : zonedMidnight(y, m + 1, 1);
  return { start, end, year: y, month: m };
}

function seriesKeys(period, start, end, term) {
  if (period === "all" || !start || !end) return [];
  if (period === "day") return Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
  if (period === "year") {
    const { year } = kigaliStamp(start);
    const months = term === "1" ? [1, 2, 3, 4] : term === "2" ? [5, 6, 7, 8] : term === "3" ? [9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    return months.map((item) => `${year}-${String(item).padStart(2, "0")}`);
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
  if (period === "day") return `${bucket}:00`;
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
  requireRoles("school_admin", "teacher", "discipline", "accountant"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const period = ["all", "day", "week", "month", "year"].includes(req.query.period) ? req.query.period : "month";
    const asked = String(req.query.delivery || req.query.billing || "all");
    const delivery = asked === "sent" || asked === "paid" ? "sent" : asked === "unsent" || asked === "unpaid" ? "unsent" : "all";
    const type = ["all", "marks", "results", "discipline", "notice", "status", "reminder", "special"].includes(req.query.type) ? req.query.type : "all";
    const term = ["1", "2", "3"].includes(String(req.query.term || "")) ? String(req.query.term) : "";
    const q = String(req.query.q || "").trim().slice(0, 80);
    const { start, end, year, month } = tighten(
      bounds(period, Number(req.query.year), Number(req.query.month), req.query.on, term),
      period,
      req.query.from,
      req.query.to,
    );
    const mine = req.user.role !== "school_admin";
    const match = { type: "send_debit", school: req.user.school };
    if (start && end) match.createdAt = { $gte: start, $lt: end };
    if (q) match.messagePreview = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
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
          resolvedKind: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: { $ifNull: ["$messagePreview", ""] }, regex: "please pay|Ishyura|Lipa |Veuillez payer", options: "i" } }, then: "reminder" },
                { case: { $regexMatch: { input: { $ifNull: ["$messagePreview", ""] }, regex: "Fees due|School fees|Amafaranga y'ishuri|Ada ya shule|Frais \\d", options: "i" } }, then: "status" },
              ],
              default: "special",
            },
          },
        },
      },
      {
        $group: {
          _id: {
            bucket: {
              $dateToString: {
                format: period === "day" ? "%H" : period === "year" || period === "all" ? "%Y-%m" : "%Y-%m-%d",
                date: "$createdAt",
                timezone: TIMEZONE,
              },
            },
            billing: "$resolvedBilling",
            category: "$resolvedCategory",
            kind: "$resolvedKind",
            person: "$createdBy",
          },
          messages: { $sum: { $ifNull: ["$recipients", 1] } },
        },
      },
    ]);

    const categories = {
      marks: { sent: 0, unsent: 0 },
      results: { sent: 0, unsent: 0 },
      discipline: { sent: 0, unsent: 0 },
      notice: { sent: 0, unsent: 0 },
    };
    const kinds = {
      status: { sent: 0, unsent: 0 },
      reminder: { sent: 0, unsent: 0 },
      special: { sent: 0, unsent: 0 },
    };
    const sent = { messages: 0 };
    const unsent = { messages: 0 };
    const byBucket = new Map();
    const byPerson = new Map();
    rows.forEach((row) => {
      const state = row._id.billing === "unpaid" ? "unsent" : "sent";
      const count = row.messages;
      if (delivery !== "all" && delivery !== state) return;
      const category = categories[row._id.category] ? row._id.category : "notice";
      categories[category][state] += count;
      const messageKind = kinds[row._id.kind] ? row._id.kind : "special";
      kinds[messageKind][state] += count;
      const typeOk = type === "all"
        || (["status", "reminder", "special"].includes(type) && messageKind === type)
        || (["marks", "results", "discipline", "notice"].includes(type) && category === type);
      if (!typeOk) return;
      if (state === "unsent") unsent.messages += count;
      else sent.messages += count;
      const bucket = byBucket.get(row._id.bucket) || { sent: 0, unsent: 0 };
      bucket[state] += count;
      byBucket.set(row._id.bucket, bucket);
      const person = String(row._id.person || "");
      const current = byPerson.get(person) || { messages: 0, sent: 0, unsent: 0 };
      current.messages += count;
      current[state] += count;
      byPerson.set(person, current);
    });

    let keys = seriesKeys(period, start, end, term);
    if (period === "all") {
      const found = [...byBucket.keys()].filter(Boolean).sort();
      if (found.length) {
        const [fromYear, fromMonth] = found[0].split("-").map(Number);
        const [toYear, toMonth] = found[found.length - 1].split("-").map(Number);
        let cursorYear = fromYear;
        let cursorMonth = fromMonth;
        keys = [];
        while ((cursorYear < toYear || (cursorYear === toYear && cursorMonth <= toMonth)) && keys.length < 36) {
          keys.push(`${cursorYear}-${String(cursorMonth).padStart(2, "0")}`);
          cursorMonth += 1;
          if (cursorMonth > 12) {
            cursorMonth = 1;
            cursorYear += 1;
          }
        }
        if (keys.length > 24) keys = keys.slice(-24);
      }
    }
    const series = keys.map((bucket) => {
      const counts = byBucket.get(bucket) || { sent: 0, unsent: 0 };
      return {
        bucket,
        label: seriesLabel(period === "all" ? "year" : period, bucket),
        sent: counts.sent,
        unsent: counts.unsent,
        messages: counts.sent + counts.unsent,
      };
    });
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

    const recentDocs = await SmsLedger.find(match).sort({ createdAt: -1 }).limit(80).select("messagePreview recipients billing category createdAt");
    const recent = recentDocs
      .filter((item) => {
        const state = (item.billing || "paid") === "unpaid" ? "unsent" : "sent";
        if (delivery !== "all" && delivery !== state) return false;
        const preview = String(item.messagePreview || "");
        const messageKind = /please pay|Ishyura|Lipa |Veuillez payer/i.test(preview)
          ? "reminder"
          : /Fees due|School fees|Amafaranga y'ishuri|Ada ya shule|Frais \d/i.test(preview)
            ? "status"
            : "special";
        if (["status", "reminder", "special"].includes(type) && messageKind !== type) return false;
        if (["marks", "results", "discipline", "notice"].includes(type) && (item.category || "notice") !== type) return false;
        return true;
      })
      .slice(0, 40)
      .map((item) => ({
        id: item._id,
        message: item.messagePreview || "",
        recipients: item.recipients || 0,
        state: (item.billing || "paid") === "unpaid" ? "unsent" : "sent",
        createdAt: item.createdAt,
      }));

    res.json({
      success: true,
      period,
      year,
      month,
      term,
      delivery,
      type,
      timezone: TIMEZONE,
      from: start,
      to: new Date(),
      scope: mine ? "mine" : "school",
      totals: {
        messages: sent.messages + unsent.messages,
        sent: sent.messages,
        unsent: unsent.messages,
        shown: sent.messages + unsent.messages,
      },
      categories,
      kinds,
      series,
      people,
      recent,
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
  requireRoles("school_admin", "teacher", "discipline", "accountant"),
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
    const message = String(req.body.message || "").trim();
    if (!message) throw new ApiError(400, "Write the message first.");
    if (message.length > 160) throw new ApiError(400, "Keep the message under 160 characters.");
    const sent = await smsWallet.sendFromSchool({
      school,
      phones: req.body.phones,
      message,
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
