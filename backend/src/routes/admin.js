const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { User, School, PlatformAd, SmsLedger, Follow, Student, Staff, MessagePayment, OperatingCost } = require("../models");
const smsWallet = require("../services/smsWallet");
const { authRequired, requireRoles } = require("../middleware/auth");
const { optionalMsisdn } = require("../utils/phone");

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

function periodStart(period) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  if (period === "year") return zonedMidnight(year, 1, 1);
  if (period === "week") {
    const midnight = zonedMidnight(year, month, day);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(midnight);
    const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] || 0;
    return new Date(midnight.getTime() - back * 86400000);
  }
  return zonedMidnight(year, month, 1);
}

const STAFF_ROLES = ["school_admin", "teacher", "discipline", "accountant"];
const ONLINE_MS = 90 * 1000;

function kigaliMonth(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit" }).format(date).slice(0, 7);
}

function shiftMonth(key, amount) {
  const [year, month] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function registerTrend(schoolDates, staffDates) {
  const schoolMonths = schoolDates.filter(Boolean).map((date) => kigaliMonth(date));
  const staffMonths = staffDates.filter(Boolean).map((date) => kigaliMonth(date));
  const marks = [...schoolMonths, ...staffMonths].sort();
  if (!marks.length) return [];
  const end = kigaliMonth(new Date());
  const months = [];
  for (let cursor = marks[0]; cursor <= end && months.length < 36; cursor = shiftMonth(cursor, 1)) months.push(cursor);
  let schoolCarry = 0;
  let staffCarry = 0;
  if (months.length > 12) {
    const cutoff = months[months.length - 12];
    schoolCarry = schoolMonths.filter((month) => month < cutoff).length;
    staffCarry = staffMonths.filter((month) => month < cutoff).length;
    months.splice(0, months.length - 12);
  }
  let schools = schoolCarry;
  let staff = staffCarry;
  return months.map((key) => {
    schools += schoolMonths.filter((month) => month === key).length;
    staff += staffMonths.filter((month) => month === key).length;
    return { label: monthLabel(key), schools, staff };
  });
}

const router = express.Router();
router.use(authRequired, requireRoles("super_admin"));

router.get(
  "/presence",
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - ONLINE_MS);
    const [schools, staffUsers] = await Promise.all([
      School.find().select("name status type createdAt").sort({ name: 1 }),
      User.find({ role: { $in: STAFF_ROLES }, isActive: true }).select("fullName role school lastSeenAt createdAt"),
    ]);
    const byRole = {};
    const staffBySchool = new Map();
    staffUsers.forEach((user) => {
      byRole[user.role] = (byRole[user.role] || 0) + 1;
      if (!user.school) return;
      const key = String(user.school);
      const row = staffBySchool.get(key) || { school_admin: 0, teacher: 0, discipline: 0, accountant: 0 };
      row[user.role] = (row[user.role] || 0) + 1;
      staffBySchool.set(key, row);
    });
    const staff = STAFF_ROLES.reduce((total, role) => total + (byRole[role] || 0), 0);
    const onlineBySchool = new Map();
    const onlineUsers = staffUsers.filter((user) => user.school && user.lastSeenAt && user.lastSeenAt >= since);
    onlineUsers.forEach((user) => {
      const key = String(user.school);
      const list = onlineBySchool.get(key) || [];
      list.push({ fullName: user.fullName, role: user.role });
      onlineBySchool.set(key, list);
    });
    const items = schools.map((school) => {
      const people = onlineBySchool.get(String(school._id)) || [];
      const roles = staffBySchool.get(String(school._id)) || { school_admin: 0, teacher: 0, discipline: 0, accountant: 0 };
      return {
        id: school._id,
        name: school.name,
        status: school.status,
        type: school.type,
        staff: roles.school_admin + roles.teacher + roles.discipline + roles.accountant,
        directors: roles.school_admin,
        teachers: roles.teacher,
        discipline: roles.discipline,
        accountants: roles.accountant,
        online: people.length,
        people,
      };
    }).sort((a, b) => b.online - a.online || b.staff - a.staff || a.name.localeCompare(b.name));
    const onlineSchools = items.filter((item) => item.online > 0).length;
    res.json({
      success: true,
      schools: schools.length,
      staff,
      staffByRole: byRole,
      trend: registerTrend(schools.map((school) => school.createdAt), staffUsers.map((user) => user.createdAt)),
      onlineSchools,
      offlineSchools: schools.length - onlineSchools,
      onlinePeople: onlineUsers.length,
      windowSeconds: ONLINE_MS / 1000,
      items,
    });
  })
);

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const [users, schools, pending, ads, follows] = await Promise.all([
      User.countDocuments(),
      School.countDocuments(),
      School.countDocuments({ status: "pending_review" }),
      PlatformAd.countDocuments({ isActive: true }),
      Follow.countDocuments(),
    ]);
    const byStatus = await School.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
    const recentLedger = await SmsLedger.find().sort({ createdAt: -1 }).limit(8).populate("school", "name");
    res.json({
      success: true,
      stats: { users, schools, pending, ads, follows, byStatus },
      recentLedger,
    });
  })
);

router.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const period = ["week", "month", "year"].includes(req.query.period) ? req.query.period : "month";
    const start = periodStart(period);
    const schools = await School.find().select("name status type").sort({ name: 1 });
    const schoolIds = schools.map((school) => school._id);

    const fromDay = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
    const categoryExpr = {
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
    };
    const [dayRows, categoryRows, students, parents, newStudents, teachers, newTeachers, discipline] = await Promise.all([
      SmsLedger.aggregate([
        { $match: { type: "send_debit", school: { $in: schoolIds } } },
        {
          $group: {
            _id: {
              school: "$school",
              bucket: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } },
            },
            messages: { $sum: { $ifNull: ["$recipients", 1] } },
            credits: { $sum: { $abs: "$credits" } },
          },
        },
      ]),
      SmsLedger.aggregate([
        { $match: { type: "send_debit", school: { $in: schoolIds }, createdAt: { $gte: start } } },
        { $addFields: { resolvedCategory: categoryExpr } },
        {
          $group: {
            _id: { school: "$school", category: "$resolvedCategory" },
            messages: { $sum: { $ifNull: ["$recipients", 1] } },
          },
        },
      ]),
      Student.aggregate([
        { $match: { isActive: true, school: { $in: schoolIds } } },
        { $group: { _id: "$school", count: { $sum: 1 } } },
      ]),
      Student.aggregate([
        { $match: { isActive: true, school: { $in: schoolIds }, "guardians.phone": { $exists: true, $ne: "" } } },
        { $group: { _id: "$school", count: { $sum: 1 } } },
      ]),
      Student.aggregate([
        { $match: { school: { $in: schoolIds }, createdAt: { $gte: start } } },
        { $group: { _id: "$school", count: { $sum: 1 } } },
      ]),
      Staff.aggregate([
        { $match: { isActive: true, category: "teacher", school: { $in: schoolIds } } },
        { $group: { _id: "$school", count: { $sum: 1 } } },
      ]),
      Staff.aggregate([
        { $match: { category: "teacher", school: { $in: schoolIds }, createdAt: { $gte: start } } },
        { $group: { _id: "$school", count: { $sum: 1 } } },
      ]),
      Staff.aggregate([
        { $match: { isActive: true, category: "discipline", school: { $in: schoolIds } } },
        { $group: { _id: "$school", count: { $sum: 1 } } },
      ]),
    ]);

    const mapCount = (rows) => new Map(rows.map((row) => [String(row._id), row.count]));
    const studentMap = mapCount(students);
    const parentMap = mapCount(parents);
    const newStudentMap = mapCount(newStudents);
    const teacherMap = mapCount(teachers);
    const newTeacherMap = mapCount(newTeachers);
    const disciplineMap = mapCount(discipline);
    const categoryMap = new Map();
    categoryRows.forEach((row) => {
      const id = String(row._id.school);
      const current = categoryMap.get(id) || { marks: 0, results: 0, discipline: 0, notice: 0 };
      const kind = ["marks", "results", "discipline", "notice"].includes(row._id.category) ? row._id.category : "notice";
      current[kind] += row.messages;
      categoryMap.set(id, current);
    });
    const historyMap = new Map();
    dayRows.forEach((row) => {
      const id = String(row._id.school);
      const list = historyMap.get(id) || [];
      list.push({ bucket: row._id.bucket, messages: row.messages, credits: row.credits });
      historyMap.set(id, list);
    });

    const items = schools.map((school) => {
      const id = String(school._id);
      const history = (historyMap.get(id) || []).sort((a, b) => a.bucket.localeCompare(b.bucket));
      const inPeriod = history.filter((point) => point.bucket >= fromDay);
      return {
        school: { _id: school._id, name: school.name, status: school.status, type: school.type },
        messages: inPeriod.reduce((sum, point) => sum + point.messages, 0),
        categories: categoryMap.get(id) || { marks: 0, results: 0, discipline: 0, notice: 0 },
        credits: inPeriod.reduce((sum, point) => sum + point.credits, 0),
        history,
        students: studentMap.get(id) || 0,
        studentsJoined: newStudentMap.get(id) || 0,
        teachers: teacherMap.get(id) || 0,
        teachersJoined: newTeacherMap.get(id) || 0,
        discipline: disciplineMap.get(id) || 0,
        parents: parentMap.get(id) || 0,
      };
    });

    const totals = items.reduce(
      (sum, item) => ({
        messages: sum.messages + item.messages,
        credits: sum.credits + item.credits,
        teachers: sum.teachers + item.teachers,
        teachersJoined: sum.teachersJoined + item.teachersJoined,
        discipline: sum.discipline + item.discipline,
        students: sum.students + item.students,
        studentsJoined: sum.studentsJoined + item.studentsJoined,
        parents: sum.parents + item.parents,
      }),
      { messages: 0, credits: 0, teachers: 0, teachersJoined: 0, discipline: 0, students: 0, studentsJoined: 0, parents: 0 }
    );

    res.json({
      success: true,
      period,
      timezone: TIMEZONE,
      from: start,
      to: new Date(),
      totals,
      items,
      rules: {
        messages: "SMS recipients on sends dated inside this period. Marks, term results, discipline, and school notices are counted separately.",
        credits: "SMS credits spent on those same sends.",
        studentsJoined: "Student records created inside this period, including any later marked inactive.",
        teachersJoined: "Teacher staff records created inside this period.",
        students: "Active students on the register now. This does not change with the period.",
        teachers: "Active staff in the teacher category now. Login accounts are not counted separately.",
        discipline: "Active staff in the discipline category now.",
        parents: "Active students who have a parent phone. Each student is counted once.",
      },
    });
  })
);

router.get(
  "/message-payments",
  asyncHandler(async (req, res) => {
    const [schools, payments] = await Promise.all([
      School.find().select("name status type messagesRemaining messagesGranted").sort({ name: 1 }),
      MessagePayment.find().sort({ paidAt: -1, createdAt: -1 }).limit(80).populate("school", "name"),
    ]);
    res.json({ success: true, schools, payments });
  })
);

router.post(
  "/message-payments",
  asyncHandler(async (req, res) => {
    const { school, payment } = await smsWallet.recordSchoolPayment({
      schoolId: req.body.schoolId,
      amountRwf: req.body.amountRwf,
      paidAt: req.body.paidAt,
      messages: req.body.messages,
      note: req.body.note,
      createdBy: req.user._id,
    });
    res.status(201).json({
      success: true,
      payment,
      school: {
        _id: school._id,
        name: school.name,
        messagesRemaining: school.messagesRemaining,
        messagesGranted: school.messagesGranted,
      },
      message: `${school.name} can now send ${school.messagesRemaining} more message${school.messagesRemaining === 1 ? "" : "s"}.`,
    });
  })
);

router.patch(
  "/message-payments/:id",
  asyncHandler(async (req, res) => {
    const { school, payment } = await smsWallet.updateSchoolPayment({
      paymentId: req.params.id,
      schoolId: req.body.schoolId,
      amountRwf: req.body.amountRwf,
      paidAt: req.body.paidAt,
      messages: req.body.messages,
      note: req.body.note,
    });
    res.json({
      success: true,
      payment,
      school: {
        _id: school._id,
        name: school.name,
        messagesRemaining: school.messagesRemaining,
        messagesGranted: school.messagesGranted,
      },
      message: `${school.name} now has ${school.messagesRemaining} message${school.messagesRemaining === 1 ? "" : "s"} left.`,
    });
  })
);

const EARNING_RATE_RWF = 5;

function kigaliDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function anchorDate(value) {
  const today = kigaliDay(new Date());
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : today;
  const [year, month, day] = raw.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return today.split("-").map(Number);
  return [year, month, day];
}

function earningRange(period, year, month, day) {
  if (period === "day") {
    const start = zonedMidnight(year, month, day);
    return { start, end: new Date(start.getTime() + 86400000) };
  }
  if (period === "week") {
    const midnight = zonedMidnight(year, month, day);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(midnight);
    const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] || 0;
    const start = new Date(midnight.getTime() - back * 86400000);
    return { start, end: new Date(start.getTime() + 7 * 86400000) };
  }
  if (period === "quarter") {
    const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
    const start = zonedMidnight(year, quarterStart, 1);
    const end = quarterStart === 10 ? zonedMidnight(year + 1, 1, 1) : zonedMidnight(year, quarterStart + 3, 1);
    return { start, end };
  }
  if (period === "year") return { start: zonedMidnight(year, 1, 1), end: zonedMidnight(year + 1, 1, 1) };
  const start = zonedMidnight(year, month, 1);
  const end = month === 12 ? zonedMidnight(year + 1, 1, 1) : zonedMidnight(year, month + 1, 1);
  return { start, end };
}

function dayKeys(start, end) {
  const keys = [];
  let cursor = start.getTime();
  while (cursor < end.getTime() && keys.length < 400) {
    keys.push(kigaliDay(new Date(cursor)));
    cursor += 86400000;
  }
  return keys;
}

function shortDay(bucket) {
  const [year, month, day] = bucket.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function deliveredCount() {
  return {
    $sum: {
      $cond: [
        { $gt: ["$recipients", 0] },
        "$recipients",
        { $cond: [{ $eq: [{ $ifNull: ["$recipients", null] }, null] }, 1, 0] },
      ],
    },
  };
}

router.get(
  "/earnings",
  asyncHandler(async (req, res) => {
    const period = ["day", "week", "month", "quarter", "year"].includes(req.query.period) ? req.query.period : "month";
    const todayKey = kigaliDay(new Date());
    const [todayYear, todayMonth, todayDay] = todayKey.split("-").map(Number);
    const todayStart = zonedMidnight(todayYear, todayMonth, todayDay);
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    let start;
    let end;
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || "") && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || "")) {
      const [fromYear, fromMonth, fromDay] = anchorDate(req.query.from);
      const [toYear, toMonth, toDay] = anchorDate(req.query.to);
      start = zonedMidnight(fromYear, fromMonth, fromDay);
      end = new Date(zonedMidnight(toYear, toMonth, toDay).getTime() + 86400000);
      if (end <= start) end = new Date(start.getTime() + 86400000);
    } else {
      const [year, month, day] = anchorDate(req.query.date || todayKey);
      ({ start, end } = earningRange(period, year, month, day));
    }
    const length = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - length);
    const oneDay = end.getTime() - start.getTime() <= 86400000;
    const startKey = kigaliDay(start);
    const endKey = kigaliDay(new Date(end.getTime() - 1));
    const previousKey = kigaliDay(previousStart);
    const [rows, purchases, costs] = await Promise.all([
      SmsLedger.aggregate([
        {
          $match: {
            type: "send_debit",
            $or: [
              { createdAt: { $gte: previousStart, $lt: end } },
              { createdAt: { $gte: todayStart, $lt: todayEnd } },
            ],
          },
        },
        { $addFields: { resolvedBilling: { $ifNull: ["$billing", "paid"] } } },
        { $match: { resolvedBilling: { $ne: "unpaid" } } },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } },
              hour: { $dateToString: { format: "%H", date: "$createdAt", timezone: TIMEZONE } },
              school: "$school",
            },
            messages: deliveredCount(),
          },
        },
      ]),
      SmsLedger.aggregate([
        { $match: { type: "wholesale_purchase", createdAt: { $gte: previousStart, $lt: end } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } },
            amount: { $sum: { $ifNull: ["$amountRwf", 0] } },
          },
        },
      ]),
      OperatingCost.aggregate([
        { $match: { spentAt: { $gte: previousStart, $lt: end } } },
        {
          $group: {
            _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$spentAt", timezone: TIMEZONE } }, kind: "$kind" },
            amount: { $sum: "$amountRwf" },
          },
        },
      ]),
    ]);
    const recordedCosts = await OperatingCost.find({ spentAt: { $gte: start, $lt: end } }).sort({ spentAt: -1 }).limit(40);
    const byDay = new Map();
    const byHour = new Map();
    const bySchool = new Map();
    let previousMessages = 0;
    let todayMessages = 0;
    rows.forEach((row) => {
      const count = row.messages || 0;
      const day = row._id.day;
      if (day === todayKey) todayMessages += count;
      if (day >= startKey && day <= endKey) {
        byDay.set(day, (byDay.get(day) || 0) + count);
        byHour.set(row._id.hour, (byHour.get(row._id.hour) || 0) + count);
        const schoolId = String(row._id.school || "");
        bySchool.set(schoolId, (bySchool.get(schoolId) || 0) + count);
      } else if (day >= previousKey && day < startKey) previousMessages += count;
    });
    const expenseByDay = new Map();
    let gatewayRwf = 0;
    let operatingRwf = 0;
    let previousExpensesRwf = 0;
    function keepExpense(day, amount, kind) {
      if (day >= startKey && day <= endKey) {
        if (kind === "gateway") gatewayRwf += amount;
        else operatingRwf += amount;
        expenseByDay.set(day, (expenseByDay.get(day) || 0) + amount);
      } else if (day >= previousKey && day < startKey) previousExpensesRwf += amount;
    }
    purchases.forEach((row) => keepExpense(row._id, row.amount || 0, "gateway"));
    costs.forEach((row) => keepExpense(row._id.day, row.amount || 0, row._id.kind === "gateway" ? "gateway" : "operating"));
    const buckets = oneDay ? Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")) : dayKeys(start, end);
    let runningRevenue = 0;
    let runningMessages = 0;
    const series = buckets.map((bucket) => {
      const messages = (oneDay ? byHour.get(bucket) : byDay.get(bucket)) || 0;
      const revenueRwf = messages * EARNING_RATE_RWF;
      const expensesRwf = oneDay ? 0 : expenseByDay.get(bucket) || 0;
      runningRevenue += revenueRwf;
      runningMessages += messages;
      return {
        bucket,
        label: oneDay ? `${bucket}:00` : shortDay(bucket),
        messages,
        revenueRwf,
        expensesRwf,
        netProfitRwf: revenueRwf - expensesRwf,
        cumulativeRevenueRwf: runningRevenue,
        cumulativeMessages: runningMessages,
      };
    });
    const schoolIds = [...bySchool.keys()].filter((id) => id && id !== "undefined");
    const schools = await School.find({ _id: { $in: schoolIds } }).select("name");
    const names = new Map(schools.map((school) => [String(school._id), school.name]));
    const distribution = [...bySchool.entries()]
      .map(([id, messages]) => ({ id, name: names.get(id) || "School", messages, revenueRwf: messages * EARNING_RATE_RWF }))
      .filter((row) => row.messages > 0)
      .sort((a, b) => b.revenueRwf - a.revenueRwf || a.name.localeCompare(b.name));
    const daily = dayKeys(start, end).map((bucket) => {
      const messagesForDay = byDay.get(bucket) || 0;
      const revenueForDay = messagesForDay * EARNING_RATE_RWF;
      const expensesForDay = expenseByDay.get(bucket) || 0;
      return {
        bucket,
        label: shortDay(bucket),
        messages: messagesForDay,
        revenueRwf: revenueForDay,
        expensesRwf: expensesForDay,
        netProfitRwf: revenueForDay - expensesForDay,
      };
    });
    const messages = [...byDay.values()].reduce((total, count) => total + count, 0);
    const revenueRwf = messages * EARNING_RATE_RWF;
    const expensesRwf = gatewayRwf + operatingRwf;
    const dayCount = Math.max(1, dayKeys(start, end).length);
    res.json({
      success: true,
      rateRwf: EARNING_RATE_RWF,
      period,
      grain: oneDay ? "hour" : "day",
      timezone: TIMEZONE,
      from: start,
      to: end,
      fromDate: startKey,
      toDate: endKey,
      totals: {
        messages,
        revenueRwf,
        expensesRwf,
        gatewayRwf,
        operatingRwf,
        netProfitRwf: revenueRwf - expensesRwf,
        todayMessages,
        todayEarningsRwf: todayMessages * EARNING_RATE_RWF,
        averageDailyEarningsRwf: Math.round(revenueRwf / dayCount),
        previousMessages,
        previousRevenueRwf: previousMessages * EARNING_RATE_RWF,
        previousExpensesRwf,
        previousNetProfitRwf: previousMessages * EARNING_RATE_RWF - previousExpensesRwf,
      },
      series,
      daily,
      distribution,
      costs: recordedCosts,
      rule: "Revenue is each successfully delivered message × 5 RWF. Unpaid and unsent messages are excluded. Net profit subtracts SMS gateway purchases and recorded operating costs in this period.",
    });
  })
);

router.post(
  "/operating-costs",
  asyncHandler(async (req, res) => {
    const amount = Number(req.body.amountRwf);
    const kind = req.body.kind === "gateway" ? "gateway" : "operating";
    const spentAt = new Date(req.body.spentAt);
    if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, "Enter the cost in Rwandan francs.");
    if (!req.body.spentAt || Number.isNaN(spentAt.getTime())) throw new ApiError(400, "Enter the date of this cost.");
    const cost = await OperatingCost.create({
      kind,
      amountRwf: amount,
      spentAt,
      note: req.body.note ? String(req.body.note).slice(0, 160) : undefined,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, cost, message: "Cost recorded. Net profit now includes it." });
  })
);

router.delete(
  "/operating-costs/:id",
  asyncHandler(async (req, res) => {
    const cost = await OperatingCost.findByIdAndDelete(req.params.id);
    if (!cost) throw new ApiError(404, "That cost was not found.");
    res.json({ success: true, message: "Cost removed from this period." });
  })
);

router.patch(
  "/message-wallets/:schoolId",
  asyncHandler(async (req, res) => {
    const qty = Number(req.body.messagesRemaining);
    if (!Number.isInteger(qty) || qty < 0) throw new ApiError(400, "Enter how many messages are left, using a whole number.");
    const school = await School.findById(req.params.schoolId);
    if (!school) throw new ApiError(404, "School not found");
    school.messagesRemaining = qty;
    if ((school.messagesGranted || 0) < qty) school.messagesGranted = qty;
    await school.save();
    res.json({
      success: true,
      school: {
        _id: school._id,
        name: school.name,
        messagesRemaining: school.messagesRemaining,
        messagesGranted: school.messagesGranted,
      },
      message: `${school.name} now has ${qty} message${qty === 1 ? "" : "s"} left.`,
    });
  })
);

router.post(
  "/school-admins",
  asyncHandler(async (req, res) => {
    const { fullName, email, phone, password } = req.body;
    if (!fullName || !email || !password) {
      throw new ApiError(400, "Name, email and password are required");
    }
    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) throw new ApiError(409, "An account with this email already exists");
    const msisdn = phone && String(phone).trim() ? optionalMsisdn(phone) : "";
    if (phone && String(phone).trim() && !msisdn) {
      throw new ApiError(400, "Phone must begin with 250, for example 250788000000.");
    }
    const user = await User.create({
      fullName,
      email,
      phone: msisdn,
      role: "school_admin",
      passwordHash: await User.hashPassword(password),
    });
    res.status(201).json({
      success: true,
      user: user.toSafeJSON(),
      message: "School director account created. They can sign in and submit a school profile.",
    });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    const items = await User.find(filter).select("-passwordHash").populate("school", "name status").sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, items });
  })
);

module.exports = router;
