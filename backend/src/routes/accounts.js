const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { School, Student, ClassRoom, FeeAccount, StudentCharge, CashEntry, Vendor, Bill, Estimate, PurchaseOrder, BudgetLine, RecurringRule, BankMark } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const { toRwandaMsisdn, localPhone } = require("../utils/phone");
const smsWallet = require("../services/smsWallet");
const books = require("../services/books");

const router = express.Router();
router.use(authRequired, requireSchoolScope);
router.use((req, res, next) => {
  const statusReport = req.method === "GET" && req.path === "/ledger";
  if (statusReport && (req.user.role === "school_admin" || req.user.role === "accountant")) return next();
  return requireRoles("accountant")(req, res, next);
});

function francs(value, label) {
  const amount = books.money(value);
  if (amount == null || amount < 0 || amount > 1000000000) {
    throw new ApiError(400, `${label} must be a Rwandan franc amount.`);
  }
  return amount;
}

function optionalFrancs(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const amount = books.money(value);
  if (amount == null || amount < 0 || amount > 1000000000) return null;
  return amount;
}

async function ensureAccounts(schoolId) {
  await FeeAccount.updateMany({ school: schoolId, kind: { $exists: false } }, { $set: { kind: "income" } });
  const existing = await FeeAccount.find({ school: schoolId });
  const codes = new Set(existing.map((item) => item.code));
  const missing = books.DEFAULT_ACCOUNTS.filter((item) => !codes.has(item.code));
  if (missing.length) {
    await FeeAccount.insertMany(missing.map((item) => ({ ...item, school: schoolId, system: true })));
  }
  return FeeAccount.find({ school: schoolId, isActive: true }).sort({ code: 1 });
}

function presentAccount(item) {
  return {
    id: item._id,
    name: item.name,
    code: item.code,
    group: item.group,
    kind: item.kind || "income",
    amount: item.amount || 0,
    classIds: (item.classes || []).map((id) => String(id)),
    system: Boolean(item.system),
  };
}

function calendarDate(value, label) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) throw new ApiError(400, label);
  const on = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${on}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, label);
  return { date, on };
}

function periodQuery(query) {
  const period = ["day", "week", "month", "year"].includes(query.period) ? query.period : "month";
  return { period, ...books.bounds(period, { year: Number(query.year), month: Number(query.month), on: query.on }) };
}

function filterQuery(query) {
  const itemIds = String(query.items || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    status: ["paid", "unpaid", "partial"].includes(query.status) ? query.status : "",
    risk: ["normal", "medium", "at_risk"].includes(query.risk) ? query.risk : "",
    min: optionalFrancs(query.min),
    max: optionalFrancs(query.max),
    below: optionalFrancs(query.below),
    itemIds,
  };
}

async function loadBook(user, query) {
  const { period, start, end, year, month } = periodQuery(query);
  const accounts = await ensureAccounts(user.school);
  const chargeFilter = { school: user.school, dueOn: { $gte: start, $lt: end } };
  if (query.classRoom) chargeFilter.classRoom = query.classRoom;
  const charges = await StudentCharge.find(chargeFilter).populate({
    path: "student",
    select: "fullName studentCode classRoom guardians",
    populate: { path: "classRoom", select: "name" },
  });
  const paymentMatch = { school: user.school };
  if (query.classRoom) paymentMatch.classRoom = query.classRoom;
  const paymentCharges = await StudentCharge.find(paymentMatch).select("payments amountDue accountName accountGroup classRoom");
  const entries = await CashEntry.find({
    school: user.school,
    occurredOn: { $gte: start, $lt: end },
  }).sort({ occurredOn: -1 });

  let billed = 0;
  let openPaid = 0;
  let unpaid = 0;
  const byItem = new Map();
  charges.forEach((charge) => {
    const due = charge.amountDue || 0;
    const paid = Math.min(charge.amountPaid || 0, due);
    billed += due;
    openPaid += paid;
    unpaid += Math.max(0, due - paid);
    const key = charge.accountName;
    const current = byItem.get(key) || { name: key, group: charge.accountGroup, billed: 0, paid: 0, unpaid: 0 };
    current.billed += due;
    current.paid += paid;
    current.unpaid += Math.max(0, due - paid);
    byItem.set(key, current);
  });

  let collected = 0;
  const seriesMap = new Map(books.seriesKeys(period, start, end).map((key) => [key, { billed: 0, collected: 0 }]));
  charges.forEach((charge) => {
    const key = books.bucketKey(period, charge.dueOn);
    if (!seriesMap.has(key)) return;
    seriesMap.get(key).billed += charge.amountDue || 0;
  });
  paymentCharges.forEach((charge) => {
    (charge.payments || []).forEach((payment) => {
      const when = new Date(payment.paidOn);
      if (when < start || when >= end) return;
      collected += payment.amount || 0;
      const key = books.bucketKey(period, when);
      if (seriesMap.has(key)) seriesMap.get(key).collected += payment.amount || 0;
    });
  });

  let expenses = 0;
  let otherIncome = 0;
  entries.forEach((entry) => {
    if (entry.kind === "expense") expenses += entry.amount;
    else otherIncome += entry.amount;
  });

  const students = books.applyStudentFilters(books.rollupStudents(charges, toRwandaMsisdn), filterQuery(query));
  const risks = { normal: 0, medium: 0, atRisk: 0 };
  students.forEach((student) => {
    if (student.risk === "at_risk") risks.atRisk += 1;
    else if (student.risk === "medium") risks.medium += 1;
    else risks.normal += 1;
  });

  return {
    period,
    year,
    month,
    from: start,
    to: end,
    timezone: books.TIMEZONE,
    accounts: accounts.map(presentAccount),
    totals: {
      billed,
      paid: openPaid,
      unpaid,
      collected,
      expenses,
      otherIncome,
      net: query.classRoom ? collected : collected + otherIncome - expenses,
    },
    byItem: [...byItem.values()],
    series: [...seriesMap.entries()].map(([bucket, amounts]) => ({
      bucket,
      label: books.seriesLabel(period, bucket),
      ...amounts,
    })),
    risks,
    students,
    entries: entries.map((entry) => ({
      id: entry._id,
      kind: entry.kind,
      title: entry.title,
      amount: entry.amount,
      occurredOn: entry.occurredOn,
      accountName: entry.accountName || "",
      note: entry.note || "",
    })),
  };
}

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const book = await loadBook(req.user, req.query);
    res.json({ success: true, ...book });
  })
);

router.post(
  "/accounts",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) throw new ApiError(400, "Enter the account name.");
    const group = req.body.group === "fee" ? "fee" : req.body.group === "ledger" ? "ledger" : "material";
    const kinds = ["asset", "liability", "equity", "income", "expense"];
    const kind = kinds.includes(req.body.kind) ? req.body.kind : group === "ledger" ? "expense" : "income";
    const count = await FeeAccount.countDocuments({ school: req.user.school });
    const account = await FeeAccount.create({
      school: req.user.school,
      name: name.slice(0, 80),
      code: String(5000 + count),
      group,
      kind,
      system: false,
    });
    res.status(201).json({ success: true, account });
  })
);

router.post(
  "/charges",
  asyncHandler(async (req, res) => {
    const account = await FeeAccount.findOne({ _id: req.body.accountId, school: req.user.school, isActive: true });
    if (!account) throw new ApiError(400, "Choose the fee or material.");
    const amountDue = francs(req.body.amountDue, "Amount due");
    if (amountDue < 1) throw new ApiError(400, "Enter the amount due, in Rwandan francs.");
    const dueDate = calendarDate(req.body.dueOn, "Enter the due date.");
    const due = dueDate.date;
    const span = ["day", "week", "month", "year"].includes(req.body.span) ? req.body.span : "month";
    const classRoom = req.body.classRoom ? await ClassRoom.findOne({ _id: req.body.classRoom, school: req.user.school, isActive: true }) : null;
    if (req.body.classRoom && !classRoom) throw new ApiError(400, "Choose a class.");
    let students = [];
    if (req.body.studentId) {
      const student = await Student.findOne({ _id: req.body.studentId, school: req.user.school, isActive: true });
      if (!student) throw new ApiError(404, "Student not found");
      students = [student];
    } else if (classRoom) {
      students = await Student.find({ school: req.user.school, classRoom: classRoom._id, isActive: true });
    }
    if (!students.length) throw new ApiError(400, "Choose a class, or one student.");
    const day = books.bounds("day", { on: dueDate.on });
    let created = 0;
    for (const student of students) {
      const duplicate = await StudentCharge.findOne({
        school: req.user.school,
        student: student._id,
        account: account._id,
        dueOn: { $gte: day.start, $lt: day.end },
      });
      if (duplicate) continue;
      await StudentCharge.create({
        school: req.user.school,
        student: student._id,
        classRoom: student.classRoom || classRoom?._id,
        account: account._id,
        accountName: account.name,
        accountGroup: account.group,
        amountDue,
        amountPaid: 0,
        dueOn: due,
        span,
        note: String(req.body.note || "").slice(0, 160),
        createdBy: req.user._id,
      });
      created += 1;
    }
    res.status(201).json({ success: true, created, skipped: students.length - created });
  })
);

router.post(
  "/pay",
  asyncHandler(async (req, res) => {
    const account = await FeeAccount.findOne({ _id: req.body.accountId, school: req.user.school, isActive: true, group: { $in: ["fee", "material"] } });
    if (!account) throw new ApiError(400, "Choose the fee or material.");
    const student = await Student.findOne({ _id: req.body.studentId, school: req.user.school, isActive: true });
    if (!student) throw new ApiError(404, "Student not found");
    const classIds = (account.classes || []).map(String);
    if (classIds.length && !classIds.includes(String(student.classRoom))) throw new ApiError(400, "Choose the classes for this item.");
    const amount = francs(req.body.amount, "Amount paid");
    if (amount < 1) throw new ApiError(400, "Enter the amount received, in Rwandan francs.");
    const price = Number(account.amount) || 0;
    let charge = await StudentCharge.findOne({ school: req.user.school, student: student._id, account: account._id });
    if (!charge) {
      if (price < 1) throw new ApiError(400, "Enter the amount due, in Rwandan francs.");
      charge = new StudentCharge({
        school: req.user.school,
        student: student._id,
        classRoom: student.classRoom,
        account: account._id,
        accountName: account.name,
        accountGroup: account.group === "fee" ? "fee" : "material",
        amountDue: price,
        amountPaid: 0,
        dueOn: new Date(),
        span: "year",
        createdBy: req.user._id,
        payments: [],
      });
    } else if (price > (charge.amountDue || 0)) {
      charge.amountDue = price;
    }
    const remaining = Math.max(0, (charge.amountDue || 0) - (charge.amountPaid || 0));
    if (amount > remaining) throw new ApiError(400, "The amount paid cannot be above the total.");
    charge.payments.push({ amount, paidOn: new Date(), createdBy: req.user._id });
    charge.amountPaid = (charge.amountPaid || 0) + amount;
    await charge.save();
    res.json({ success: true });
  })
);

router.post(
  "/charges/:id/pay",
  asyncHandler(async (req, res) => {
    const charge = await StudentCharge.findOne({ _id: req.params.id, school: req.user.school });
    if (!charge) throw new ApiError(404, "That charge was not found.");
    const remaining = Math.max(0, (charge.amountDue || 0) - (charge.amountPaid || 0));
    const amount = francs(req.body.amount, "Amount received");
    if (amount < 1) throw new ApiError(400, "Enter the amount received, in Rwandan francs.");
    if (amount > remaining) throw new ApiError(400, `The unpaid amount is ${remaining} RWF.`);
    const paidOn = req.body.paidOn ? calendarDate(req.body.paidOn, "Enter the payment date.").date : new Date();
    charge.payments.push({
      amount,
      paidOn,
      note: String(req.body.note || "").slice(0, 160),
      createdBy: req.user._id,
    });
    charge.amountPaid = (charge.amountPaid || 0) + amount;
    await charge.save();
    res.json({ success: true, charge });
  })
);

router.delete(
  "/charges/:id",
  asyncHandler(async (req, res) => {
    const charge = await StudentCharge.findOne({ _id: req.params.id, school: req.user.school });
    if (!charge) throw new ApiError(404, "That charge was not found.");
    if ((charge.amountPaid || 0) > 0) throw new ApiError(400, "A charge with a payment stays on the books.");
    await charge.deleteOne();
    res.json({ success: true });
  })
);

router.post(
  "/cash",
  asyncHandler(async (req, res) => {
    const kind = req.body.kind === "expense" ? "expense" : req.body.kind === "other_income" ? "other_income" : "";
    if (!kind) throw new ApiError(400, "Choose expenses or other income.");
    const title = String(req.body.title || "").trim();
    if (!title) throw new ApiError(400, "Enter a title.");
    const amount = francs(req.body.amount, "Amount");
    if (amount < 1) throw new ApiError(400, "Enter the amount, in Rwandan francs.");
    const occurredOn = calendarDate(req.body.occurredOn, "Enter the date.").date;
    const entry = await CashEntry.create({
      school: req.user.school,
      kind,
      title: title.slice(0, 80),
      accountName: String(req.body.accountName || title).slice(0, 80),
      amount,
      occurredOn,
      note: String(req.body.note || "").slice(0, 160),
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, entry });
  })
);

router.delete(
  "/cash/:id",
  asyncHandler(async (req, res) => {
    const entry = await CashEntry.findOneAndDelete({ _id: req.params.id, school: req.user.school });
    if (!entry) throw new ApiError(404, "That entry was not found.");
    res.json({ success: true });
  })
);

router.post(
  "/remind",
  asyncHandler(async (req, res) => {
    const message = String(req.body.message || "").trim();
    if (!message) throw new ApiError(400, "Write the message first.");
    if (message.length > 160) throw new ApiError(400, "Keep the message under 160 characters.");
    const book = await loadBook(req.user, {
      period: req.body.period,
      year: req.body.year,
      month: req.body.month,
      on: req.body.on,
      classRoom: req.body.classRoom,
      status: req.body.status,
      risk: req.body.risk,
      min: req.body.min,
      max: req.body.max,
      below: req.body.below,
      items: Array.isArray(req.body.items) ? req.body.items.join(",") : req.body.items,
    });
    const ready = [];
    const skipped = [];
    const seen = new Set();
    book.students.forEach((student) => {
      if (!student.phone) {
        skipped.push({ name: student.name, reason: "The parent phone is missing, so this student was left out." });
        return;
      }
      if (seen.has(student.phone)) return;
      seen.add(student.phone);
      ready.push(student.phone);
    });
    if (!ready.length) throw new ApiError(400, "No parent matches these filters.");
    const school = await School.findById(req.user.school);
    if (!school) throw new ApiError(404, "School not found");
    if (school.status !== "approved") throw new ApiError(400, "School must be approved first");
    const sent = await smsWallet.sendFromSchool({
      school,
      phones: ready,
      message,
      createdBy: req.user._id,
      category: "notice",
    });
    res.json({
      success: true,
      delivered: sent.delivered,
      skipped,
      walletMessage: sent.walletMessage,
      message: sent.result?.simulated
        ? "The message was not sent. SMS is turned off on the server."
        : `Sent to ${sent.delivered} parent${sent.delivered === 1 ? "" : "s"}.${sent.walletMessage ? ` ${sent.walletMessage}` : ""}`,
    });
  })
);

router.post(
  "/notify",
  asyncHandler(async (req, res) => {
    const kind = ["status", "reminder", "special"].includes(req.body.kind) ? req.body.kind : "";
    if (!kind) throw new ApiError(400, "Choose a message.");
    const ids = [...new Set((Array.isArray(req.body.studentIds) ? req.body.studentIds : []).map(String))].filter(Boolean);
    if (!ids.length) throw new ApiError(400, "Choose a student");
    const students = await Student.find({ _id: { $in: ids }, school: req.user.school, isActive: true }).select("fullName guardians");
    if (students.length !== ids.length) throw new ApiError(400, "Choose a student");
    const school = await School.findById(req.user.school);
    if (!school) throw new ApiError(404, "School not found");
    if (school.status !== "approved") throw new ApiError(400, "School must be approved first");
    const byId = new Map(students.map((student) => [String(student._id), student]));
    const limit = "Keep the message under 155 characters.";
    let jobs = [];
    if (kind === "special") {
      const message = String(req.body.message || "").trim();
      if (!message) throw new ApiError(400, "Write the message first.");
      if ([...message].length > 155) throw new ApiError(400, limit);
      jobs = ids.map((id) => ({ student: byId.get(id), message }));
    } else {
      const rows = Array.isArray(req.body.messages) ? req.body.messages : [];
      jobs = ids.map((id) => {
        const row = rows.find((item) => String(item.studentId) === id);
        return { student: byId.get(id), message: String(row?.text || "").trim() };
      });
      if (jobs.some((job) => !job.message || [...job.message].length > 155)) throw new ApiError(400, limit);
    }
    const skipped = [];
    const ready = [];
    const seen = new Set();
    jobs.forEach((job) => {
      const guardian = (job.student.guardians || []).find((item) => item.isPrimary) || job.student.guardians?.[0];
      const phone = toRwandaMsisdn(guardian?.phone);
      if (!phone) {
        skipped.push({ name: job.student.fullName, reason: "The parent phone is missing, so this student was left out." });
        return;
      }
      if (kind === "special" && seen.has(phone)) return;
      seen.add(phone);
      ready.push({ phone, message: job.message });
    });
    if (!ready.length) throw new ApiError(400, "No parent matches these filters.");
    let delivered = 0;
    let walletMessage = "";
    if (kind === "special") {
      const sent = await smsWallet.sendFromSchool({
        school,
        phones: ready.map((item) => item.phone),
        message: ready[0].message,
        createdBy: req.user._id,
        category: "notice",
      });
      delivered = sent.delivered;
      walletMessage = sent.walletMessage || "";
    } else {
      for (const item of ready) {
        const sent = await smsWallet.sendFromSchool({
          school,
          phones: [item.phone],
          message: item.message,
          createdBy: req.user._id,
          category: "notice",
        });
        delivered += sent.delivered;
        walletMessage = sent.walletMessage || walletMessage;
      }
    }
    res.json({
      success: true,
      delivered,
      skipped,
      walletMessage,
      message: `Sent to ${delivered} parent${delivered === 1 ? "" : "s"}.`,
    });
  })
);

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const { period, start, end, year, month } = periodQuery(req.query);
    const accounts = await ensureAccounts(req.user.school);
    const [charges, entries, bills, owedCharges] = await Promise.all([
      StudentCharge.find({ school: req.user.school }).select("amountDue amountPaid dueOn accountName payments"),
      CashEntry.find({ school: req.user.school }).select("kind title accountName amount occurredOn"),
      Bill.find({ school: req.user.school }).select("amount amountPaid tax dueOn accountName vendorName payments"),
      StudentCharge.find({ school: req.user.school }).populate({
        path: "student",
        select: "fullName studentCode classRoom guardians",
        populate: { path: "classRoom", select: "name" },
      }),
    ]);
    const payments = [];
    charges.forEach((charge) => {
      (charge.payments || []).forEach((payment) => payments.push({ amount: payment.amount, paidOn: payment.paidOn }));
    });
    const statements = books.buildStatements({
      charges,
      payments,
      entries,
      bills,
      start,
      end,
      now: new Date(),
    });
    const seriesMap = new Map(books.seriesKeys(period, start, end).map((key) => [key, { income: 0, expenses: 0, collected: 0 }]));
    charges.forEach((charge) => {
      const key = books.bucketKey(period, charge.dueOn);
      if (seriesMap.has(key) && charge.dueOn >= start && charge.dueOn < end) seriesMap.get(key).income += charge.amountDue || 0;
      (charge.payments || []).forEach((payment) => {
        const paidKey = books.bucketKey(period, payment.paidOn);
        if (seriesMap.has(paidKey) && payment.paidOn >= start && payment.paidOn < end) seriesMap.get(paidKey).collected += payment.amount || 0;
      });
    });
    entries.forEach((entry) => {
      const key = books.bucketKey(period, entry.occurredOn);
      if (!seriesMap.has(key) || entry.occurredOn < start || entry.occurredOn >= end) return;
      if (entry.kind === "expense") seriesMap.get(key).expenses += entry.amount || 0;
      else seriesMap.get(key).income += entry.amount || 0;
    });
    bills.forEach((bill) => {
      const key = books.bucketKey(period, bill.dueOn);
      if (seriesMap.has(key) && bill.dueOn >= start && bill.dueOn < end) seriesMap.get(key).expenses += bill.amount || 0;
    });
    const debtors = books.rollupStudents(owedCharges, toRwandaMsisdn)
      .filter((student) => student.unpaid > 0)
      .sort((a, b) => b.unpaid - a.unpaid)
      .slice(0, 6)
      .map((student) => ({ id: student.id, name: student.name, className: student.className, unpaid: student.unpaid, risk: student.risk }));
    const activity = [
      ...charges.map((charge) => ({ id: `c-${charge._id}`, kind: "invoice", title: charge.accountName, amount: charge.amountDue, date: charge.dueOn })),
      ...entries.map((entry) => ({ id: `e-${entry._id}`, kind: entry.kind, title: entry.title, amount: entry.amount, date: entry.occurredOn })),
      ...bills.map((bill) => ({ id: `b-${bill._id}`, kind: "bill", title: bill.vendorName, amount: bill.amount, date: bill.dueOn })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
    const vendors = await Vendor.find({ school: req.user.school, isActive: true }).sort({ name: 1 });
    const [estimates, orders, budgetLines, rules] = await Promise.all([
      Estimate.find({ school: req.user.school }).sort({ dueOn: -1 }).limit(40),
      PurchaseOrder.find({ school: req.user.school }).sort({ expectedOn: -1 }).limit(40),
      BudgetLine.find({ school: req.user.school, year }),
      RecurringRule.find({ school: req.user.school }).sort({ accountName: 1 }),
    ]);
    const yearWindow = books.bounds("year", { year });
    const yearBook = books.buildStatements({ charges, payments, entries, bills, start: yearWindow.start, end: yearWindow.end, now: new Date() });
    const actualByName = new Map();
    [...yearBook.profit.incomeLines, ...yearBook.profit.expenseLines].forEach((line) => {
      actualByName.set(line.name, (actualByName.get(line.name) || 0) + line.amount);
    });
    let tax = 0;
    bills.forEach((bill) => {
      if (bill.dueOn >= start && bill.dueOn < end) tax += bill.tax || 0;
    });
    res.json({
      success: true,
      period,
      year,
      month,
      from: start,
      to: end,
      ...statements,
      series: [...seriesMap.entries()].map(([bucket, amounts]) => ({
        bucket,
        label: books.seriesLabel(period, bucket),
        ...amounts,
      })),
      debtors,
      activity,
      accounts: accounts.map(presentAccount),
      vendors: vendors.map((vendor) => ({ id: vendor._id, name: vendor.name, phone: vendor.phone || "" })),
      bills: bills.map((bill) => ({
        id: bill._id,
        vendorName: bill.vendorName,
        accountName: bill.accountName,
        amount: bill.amount,
        amountPaid: bill.amountPaid,
        unpaid: Math.max(0, (bill.amount || 0) - (bill.amountPaid || 0)),
        tax: bill.tax || 0,
        dueOn: bill.dueOn,
      })).sort((a, b) => new Date(b.dueOn) - new Date(a.dueOn)).slice(0, 12),
      estimates: estimates.map((item) => ({
        id: item._id,
        studentId: item.student,
        studentName: item.studentName,
        accountName: item.accountName,
        amount: item.amount,
        dueOn: item.dueOn,
        status: item.status,
      })),
      orders: orders.map((item) => ({
        id: item._id,
        vendorName: item.vendorName,
        accountName: item.accountName,
        amount: item.amount,
        tax: item.tax || 0,
        expectedOn: item.expectedOn,
        status: item.status,
      })),
      budgets: budgetLines.map((item) => ({
        id: item._id,
        accountName: item.accountName,
        amount: item.amount,
        actual: actualByName.get(item.accountName) || 0,
      })),
      recurring: rules.map((item) => ({
        id: item._id,
        className: item.className,
        accountName: item.accountName,
        amount: item.amount,
        span: item.span,
      })),
      tax,
    });
  })
);

router.post(
  "/vendors",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) throw new ApiError(400, "Enter the supplier name.");
    const typedPhone = String(req.body.phone || "").trim();
    const phone = typedPhone ? localPhone(typedPhone) : "";
    if (typedPhone && !phone) throw new ApiError(400, "The phone number must be 10 digits and start with 07.");
    const vendor = await Vendor.create({
      school: req.user.school,
      name: name.slice(0, 80),
      phone,
      note: String(req.body.note || "").slice(0, 160),
    });
    res.status(201).json({ success: true, vendor });
  })
);

router.post(
  "/bills",
  asyncHandler(async (req, res) => {
    const vendor = await Vendor.findOne({ _id: req.body.vendorId, school: req.user.school, isActive: true });
    if (!vendor) throw new ApiError(400, "Choose a supplier.");
    const account = await FeeAccount.findOne({ _id: req.body.accountId, school: req.user.school, isActive: true, kind: "expense" });
    if (!account) throw new ApiError(400, "Choose an expense account.");
    const amount = francs(req.body.amount, "Amount");
    if (amount < 1) throw new ApiError(400, "Enter the amount, in Rwandan francs.");
    const tax = optionalFrancs(req.body.tax) || 0;
    if (tax > amount) throw new ApiError(400, "Tax cannot be more than the bill.");
    const dueOn = calendarDate(req.body.dueOn, "Enter the due date.").date;
    const bill = await Bill.create({
      school: req.user.school,
      vendor: vendor._id,
      vendorName: vendor.name,
      account: account._id,
      accountName: account.name,
      amount,
      tax,
      dueOn,
      note: String(req.body.note || "").slice(0, 160),
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, bill });
  })
);

router.post(
  "/bills/:id/pay",
  asyncHandler(async (req, res) => {
    const bill = await Bill.findOne({ _id: req.params.id, school: req.user.school });
    if (!bill) throw new ApiError(404, "That bill was not found.");
    const remaining = Math.max(0, (bill.amount || 0) - (bill.amountPaid || 0));
    const amount = francs(req.body.amount, "Amount");
    if (amount < 1) throw new ApiError(400, "Enter the amount, in Rwandan francs.");
    if (amount > remaining) throw new ApiError(400, `The unpaid amount is ${remaining} RWF.`);
    const paidOn = req.body.paidOn ? calendarDate(req.body.paidOn, "Enter the payment date.").date : new Date();
    bill.payments.push({ amount, paidOn, createdBy: req.user._id });
    bill.amountPaid = (bill.amountPaid || 0) + amount;
    await bill.save();
    res.json({ success: true, bill });
  })
);

async function createChargeForStudent({ schoolId, userId, student, account, amountDue, due, span, note }) {
  const day = books.bounds("day", { on: due.toISOString().slice(0, 10) });
  const duplicate = await StudentCharge.findOne({
    school: schoolId,
    student: student._id,
    account: account._id,
    dueOn: { $gte: day.start, $lt: day.end },
  });
  if (duplicate) return false;
  await StudentCharge.create({
    school: schoolId,
    student: student._id,
    classRoom: student.classRoom,
    account: account._id,
    accountName: account.name,
    accountGroup: account.group,
    amountDue,
    amountPaid: 0,
    dueOn: due,
    span,
    note: String(note || "").slice(0, 160),
    createdBy: userId,
  });
  return true;
}

router.post(
  "/charges/:id/credit",
  asyncHandler(async (req, res) => {
    const charge = await StudentCharge.findOne({ _id: req.params.id, school: req.user.school });
    if (!charge) throw new ApiError(404, "That charge was not found.");
    const amount = francs(req.body.amount, "Credit");
    if (amount < 1) throw new ApiError(400, "Enter the credit, in Rwandan francs.");
    const nextDue = (charge.amountDue || 0) - amount;
    if (nextDue < (charge.amountPaid || 0) || nextDue < 1) {
      throw new ApiError(400, "A credit cannot go below the amount already paid.");
    }
    charge.amountDue = nextDue;
    charge.note = `${charge.note || ""} Credit ${amount}`.trim().slice(0, 160);
    await charge.save();
    res.json({ success: true, charge });
  })
);

router.post(
  "/estimates",
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({ _id: req.body.studentId, school: req.user.school, isActive: true });
    if (!student) throw new ApiError(400, "Choose a class, or one student.");
    const account = await FeeAccount.findOne({ _id: req.body.accountId, school: req.user.school, isActive: true });
    if (!account || account.kind !== "income") throw new ApiError(400, "Choose the fee or material.");
    const amount = francs(req.body.amount, "Amount");
    if (amount < 1) throw new ApiError(400, "Enter the amount due, in Rwandan francs.");
    const dueOn = calendarDate(req.body.dueOn, "Enter the due date.").date;
    const estimate = await Estimate.create({
      school: req.user.school,
      student: student._id,
      studentName: student.fullName,
      classRoom: student.classRoom,
      account: account._id,
      accountName: account.name,
      amount,
      dueOn,
      note: String(req.body.note || "").slice(0, 160),
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, estimate });
  })
);

router.post(
  "/estimates/:id/invoice",
  asyncHandler(async (req, res) => {
    const estimate = await Estimate.findOne({ _id: req.params.id, school: req.user.school, status: "draft" });
    if (!estimate) throw new ApiError(404, "That estimate was not found.");
    const student = await Student.findOne({ _id: estimate.student, school: req.user.school });
    const account = await FeeAccount.findOne({ _id: estimate.account, school: req.user.school });
    if (!student || !account) throw new ApiError(400, "Choose the fee or material.");
    const created = await createChargeForStudent({
      schoolId: req.user.school,
      userId: req.user._id,
      student,
      account,
      amountDue: estimate.amount,
      due: estimate.dueOn,
      span: "year",
      note: estimate.note || "From an estimate",
    });
    if (!created) throw new ApiError(400, "That invoice is already on the books.");
    estimate.status = "invoiced";
    await estimate.save();
    res.json({ success: true, estimate });
  })
);

router.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const vendor = await Vendor.findOne({ _id: req.body.vendorId, school: req.user.school, isActive: true });
    if (!vendor) throw new ApiError(400, "Choose a supplier.");
    const account = await FeeAccount.findOne({ _id: req.body.accountId, school: req.user.school, isActive: true, kind: "expense" });
    if (!account) throw new ApiError(400, "Choose an expense account.");
    const amount = francs(req.body.amount, "Amount");
    if (amount < 1) throw new ApiError(400, "Enter the amount, in Rwandan francs.");
    const tax = optionalFrancs(req.body.tax) || 0;
    if (tax > amount) throw new ApiError(400, "Tax cannot be more than the bill.");
    const expectedOn = calendarDate(req.body.expectedOn, "Enter the due date.").date;
    const order = await PurchaseOrder.create({
      school: req.user.school,
      vendor: vendor._id,
      vendorName: vendor.name,
      account: account._id,
      accountName: account.name,
      amount,
      tax,
      expectedOn,
      note: String(req.body.note || "").slice(0, 160),
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, order });
  })
);

router.post(
  "/orders/:id/bill",
  asyncHandler(async (req, res) => {
    const order = await PurchaseOrder.findOne({ _id: req.params.id, school: req.user.school, status: "open" });
    if (!order) throw new ApiError(404, "That purchase order was not found.");
    const bill = await Bill.create({
      school: req.user.school,
      vendor: order.vendor,
      vendorName: order.vendorName,
      account: order.account,
      accountName: order.accountName,
      amount: order.amount,
      tax: order.tax || 0,
      dueOn: order.expectedOn,
      note: order.note || "From a purchase order",
      createdBy: req.user._id,
    });
    order.status = "billed";
    order.bill = bill._id;
    await order.save();
    res.json({ success: true, bill });
  })
);

router.post(
  "/budgets",
  asyncHandler(async (req, res) => {
    const accountName = String(req.body.accountName || "").trim();
    if (!accountName) throw new ApiError(400, "Choose an account.");
    const amount = francs(req.body.amount, "Amount");
    const year = Number(req.body.year);
    if (!year || year < 2020) throw new ApiError(400, "Enter the year.");
    const line = await BudgetLine.findOneAndUpdate(
      { school: req.user.school, year, accountName: accountName.slice(0, 80) },
      { $set: { amount } },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, budget: line });
  })
);

router.post(
  "/recurring",
  asyncHandler(async (req, res) => {
    const classRoom = await ClassRoom.findOne({ _id: req.body.classRoom, school: req.user.school, isActive: true });
    if (!classRoom) throw new ApiError(400, "Choose a class.");
    const account = await FeeAccount.findOne({ _id: req.body.accountId, school: req.user.school, isActive: true });
    if (!account || account.kind !== "income") throw new ApiError(400, "Choose the fee or material.");
    const amount = francs(req.body.amount, "Amount");
    if (amount < 1) throw new ApiError(400, "Enter the amount due, in Rwandan francs.");
    const span = ["day", "week", "month", "year"].includes(req.body.span) ? req.body.span : "month";
    const rule = await RecurringRule.create({
      school: req.user.school,
      classRoom: classRoom._id,
      className: classRoom.name,
      account: account._id,
      accountName: account.name,
      amount,
      span,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, rule });
  })
);

router.post(
  "/recurring/:id/run",
  asyncHandler(async (req, res) => {
    const rule = await RecurringRule.findOne({ _id: req.params.id, school: req.user.school });
    if (!rule) throw new ApiError(404, "That recurring invoice was not found.");
    const account = await FeeAccount.findOne({ _id: rule.account, school: req.user.school });
    if (!account) throw new ApiError(400, "Choose the fee or material.");
    const due = calendarDate(req.body.dueOn, "Enter the due date.").date;
    const students = await Student.find({ school: req.user.school, classRoom: rule.classRoom, isActive: true });
    let created = 0;
    for (const student of students) {
      const ok = await createChargeForStudent({
        schoolId: req.user.school,
        userId: req.user._id,
        student,
        account,
        amountDue: rule.amount,
        due,
        span: rule.span,
        note: "Recurring invoice",
      });
      if (ok) created += 1;
    }
    res.json({ success: true, created, skipped: students.length - created });
  })
);

router.post(
  "/payroll",
  asyncHandler(async (req, res) => {
    const name = String(req.body.fullName || "").trim();
    if (!name) throw new ApiError(400, "Enter the staff name.");
    const amount = francs(req.body.amount, "Amount");
    if (amount < 1) throw new ApiError(400, "Enter the amount, in Rwandan francs.");
    const occurredOn = calendarDate(req.body.paidOn, "Enter the payment date.").date;
    await ensureAccounts(req.user.school);
    const entry = await CashEntry.create({
      school: req.user.school,
      kind: "expense",
      title: `Staff pay — ${name.slice(0, 60)}`,
      accountName: "Staff pay",
      amount,
      occurredOn,
      note: "Staff pay",
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, entry });
  })
);

router.get(
  "/banking",
  asyncHandler(async (req, res) => {
    const [charges, entries, bills, marks] = await Promise.all([
      StudentCharge.find({ school: req.user.school }).select("accountName payments"),
      CashEntry.find({ school: req.user.school }).select("kind title accountName amount occurredOn"),
      Bill.find({ school: req.user.school }).select("vendorName payments"),
      BankMark.find({ school: req.user.school, cleared: true }).select("refKey"),
    ]);
    const cleared = new Set(marks.map((item) => item.refKey));
    const lines = [];
    charges.forEach((charge) => {
      (charge.payments || []).forEach((payment) => {
        lines.push({
          refKey: `pay:${payment._id}`,
          direction: "in",
          title: charge.accountName,
          amount: payment.amount,
          date: payment.paidOn,
        });
      });
    });
    entries.forEach((entry) => {
      lines.push({
        refKey: `cash:${entry._id}`,
        direction: entry.kind === "expense" ? "out" : "in",
        title: entry.title,
        amount: entry.amount,
        date: entry.occurredOn,
      });
    });
    bills.forEach((bill) => {
      (bill.payments || []).forEach((payment) => {
        lines.push({
          refKey: `bill:${payment._id}`,
          direction: "out",
          title: bill.vendorName,
          amount: payment.amount,
          date: payment.paidOn,
        });
      });
    });
    lines.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({
      success: true,
      lines: lines.slice(0, 80).map((line) => ({ ...line, cleared: cleared.has(line.refKey) })),
    });
  })
);

function presentEntry(entry) {
  return {
    id: entry._id,
    kind: entry.kind,
    title: entry.title,
    amount: entry.amount,
    occurredOn: entry.occurredOn,
    accountName: entry.accountName || "",
  };
}

function presentCharge(charge) {
  const due = charge.amountDue || 0;
  const paid = Math.min(charge.amountPaid || 0, due);
  return {
    id: charge._id,
    studentId: charge.student?._id || charge.student || "",
    studentName: charge.student?.fullName || "",
    classId: charge.student?.classRoom?._id || charge.classRoom || "",
    className: charge.student?.classRoom?.name || "",
    accountId: charge.account?._id || charge.account,
    accountName: charge.accountName,
    accountGroup: charge.accountGroup,
    amountDue: due,
    amountPaid: paid,
    unpaid: Math.max(0, due - paid),
    dueOn: charge.dueOn,
    payments: (charge.payments || []).map((payment) => ({ amount: payment.amount, paidOn: payment.paidOn })),
  };
}

router.get(
  "/ledger",
  asyncHandler(async (req, res) => {
    const director = req.user.role === "school_admin";
    const accounts = director
      ? await FeeAccount.find({ school: req.user.school, isActive: true, group: { $in: ["fee", "material"] } }).sort({ code: 1 })
      : await ensureAccounts(req.user.school);
    const [charges, entries] = await Promise.all([
      StudentCharge.find({ school: req.user.school, accountGroup: { $in: ["fee", "material"] } }).populate({
        path: "student",
        select: "fullName classRoom",
        populate: { path: "classRoom", select: "name" },
      }).sort({ createdAt: -1 }),
      director ? [] : CashEntry.find({ school: req.user.school }).sort({ occurredOn: -1, createdAt: -1 }),
    ]);
    const items = charges.map(presentCharge);
    const sum = (group) => items.filter((item) => item.accountGroup === group).reduce((total, item) => ({
      due: total.due + item.amountDue,
      paid: total.paid + item.amountPaid,
      unpaid: total.unpaid + item.unpaid,
    }), { due: 0, paid: 0, unpaid: 0 });
    res.json({
      success: true,
      items,
      accounts: accounts.filter((item) => item.group === "fee" || item.group === "material").map(presentAccount),
      expenseAccounts: director ? [] : accounts.filter((item) => item.kind === "expense").map(presentAccount),
      entries: director ? [] : entries.map(presentEntry),
      fees: sum("fee"),
      materials: sum("material"),
    });
  })
);

async function classIdsForItem(req) {
  if (req.body.allClasses !== false) return [];
  const requested = [...new Set((Array.isArray(req.body.classIds) ? req.body.classIds : []).map(String))].filter(Boolean);
  if (!requested.length) throw new ApiError(400, "Choose the classes for this item.");
  const rooms = await ClassRoom.find({ _id: { $in: requested }, school: req.user.school, isActive: true }).select("_id");
  if (rooms.length !== requested.length) throw new ApiError(400, "Choose a class");
  return rooms.map((room) => room._id);
}

function itemName(req) {
  const name = String(req.body.name || "").trim();
  if (!name) throw new ApiError(400, "Enter the material item.");
  return name.slice(0, 80);
}

function itemAmount(req) {
  const amount = francs(req.body.amount, "Amount due");
  if (amount < 1) throw new ApiError(400, "Enter the amount due, in Rwandan francs.");
  return amount;
}

router.post(
  "/items",
  asyncHandler(async (req, res) => {
    const name = itemName(req);
    const amount = itemAmount(req);
    const classIds = await classIdsForItem(req);
    const accounts = await ensureAccounts(req.user.school);
    let account = accounts.find((item) => (item.group === "fee" || item.group === "material") && item.name.toLowerCase() === name.toLowerCase());
    if (account) {
      account.amount = amount;
      account.classes = classIds;
      await account.save();
    } else {
      const count = await FeeAccount.countDocuments({ school: req.user.school });
      account = await FeeAccount.create({
        school: req.user.school,
        name: name.slice(0, 80),
        code: String(5000 + count),
        group: "material",
        kind: "income",
        amount,
        classes: classIds,
        system: false,
      });
    }
    res.status(201).json({ success: true, account: presentAccount(account) });
  })
);

router.patch(
  "/items/:id",
  asyncHandler(async (req, res) => {
    const account = await FeeAccount.findOne({ _id: req.params.id, school: req.user.school, isActive: true, group: "material" });
    if (!account) throw new ApiError(404, "That item was not found.");
    const name = itemName(req);
    const others = await FeeAccount.find({ school: req.user.school, isActive: true, _id: { $ne: account._id }, group: { $in: ["fee", "material"] } });
    if (others.some((item) => item.name.toLowerCase() === name.toLowerCase())) throw new ApiError(400, "That item is already on the books.");
    account.name = name;
    account.amount = itemAmount(req);
    account.classes = await classIdsForItem(req);
    await account.save();
    await StudentCharge.updateMany({ school: req.user.school, account: account._id }, { $set: { accountName: account.name } });
    res.json({ success: true, account: presentAccount(account) });
  })
);

router.delete(
  "/items/:id",
  asyncHandler(async (req, res) => {
    const account = await FeeAccount.findOne({ _id: req.params.id, school: req.user.school, isActive: true, group: "material" });
    if (!account) throw new ApiError(404, "That item was not found.");
    const paid = await StudentCharge.exists({ school: req.user.school, account: account._id, amountPaid: { $gt: 0 } });
    if (paid) throw new ApiError(400, "A charge with a payment stays on the books.");
    await StudentCharge.deleteMany({ school: req.user.school, account: account._id });
    account.isActive = false;
    await account.save();
    res.json({ success: true });
  })
);

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const accounts = await ensureAccounts(req.user.school);
    const group = req.body.group === "fee" ? "fee" : "material";
    let account = null;
    if (group === "fee") {
      account = accounts.find((item) => item.group === "fee" && item.name === "School fees");
    } else if (req.body.accountId) {
      account = accounts.find((item) => item.group === "material" && String(item._id) === String(req.body.accountId));
    } else {
      const name = String(req.body.itemName || "").trim();
      if (!name) throw new ApiError(400, "Enter the material item.");
      account = accounts.find((item) => item.group === "material" && item.name.toLowerCase() === name.toLowerCase());
      if (!account) {
        const count = await FeeAccount.countDocuments({ school: req.user.school });
        account = await FeeAccount.create({
          school: req.user.school,
          name: name.slice(0, 80),
          code: String(5000 + count),
          group: "material",
          kind: "income",
          system: false,
        });
      }
    }
    if (!account) throw new ApiError(400, "Choose the fee or material.");
    const amountDue = francs(req.body.amountDue, "Amount due");
    if (amountDue < 1) throw new ApiError(400, "Enter the amount due, in Rwandan francs.");
    const oneStudent = Boolean(req.body.studentId);
    const rawPaid = oneStudent ? req.body.amountPaid : 0;
    const amountPaid = rawPaid === undefined || rawPaid === null || String(rawPaid).trim() === "" ? 0 : francs(rawPaid, "Amount paid");
    if (amountPaid > amountDue) throw new ApiError(400, "The amount paid cannot be above the total.");
    const classRoom = req.body.classRoom ? await ClassRoom.findOne({ _id: req.body.classRoom, school: req.user.school, isActive: true }) : null;
    if (!classRoom) throw new ApiError(400, "Choose a class.");
    let students = [];
    if (oneStudent) {
      const student = await Student.findOne({ _id: req.body.studentId, school: req.user.school, isActive: true });
      if (!student) throw new ApiError(404, "Student not found");
      students = [student];
    } else {
      students = await Student.find({ school: req.user.school, classRoom: classRoom._id, isActive: true });
    }
    if (!students.length) throw new ApiError(400, "Choose a class, or one student.");
    let created = 0;
    let updated = 0;
    for (const student of students) {
      const existing = await StudentCharge.findOne({ school: req.user.school, student: student._id, account: account._id });
      if (existing) {
        if (amountDue < (existing.amountPaid || 0)) throw new ApiError(400, "The amount paid cannot be above the total.");
        existing.amountDue = amountDue;
        const room = Math.max(0, amountDue - (existing.amountPaid || 0));
        if (amountPaid > room) throw new ApiError(400, "The amount paid cannot be above the total.");
        if (amountPaid > 0) {
          existing.payments.push({ amount: amountPaid, paidOn: new Date(), createdBy: req.user._id });
          existing.amountPaid = (existing.amountPaid || 0) + amountPaid;
        }
        await existing.save();
        updated += 1;
      } else {
        await StudentCharge.create({
          school: req.user.school,
          student: student._id,
          classRoom: student.classRoom || classRoom._id,
          account: account._id,
          accountName: account.name,
          accountGroup: account.group === "fee" ? "fee" : "material",
          amountDue,
          amountPaid,
          dueOn: new Date(),
          span: "year",
          createdBy: req.user._id,
          payments: amountPaid > 0 ? [{ amount: amountPaid, paidOn: new Date(), createdBy: req.user._id }] : [],
        });
        created += 1;
      }
    }
    res.status(201).json({ success: true, created, updated });
  })
);

router.post(
  "/banking/clear",
  asyncHandler(async (req, res) => {
    const refKey = String(req.body.refKey || "");
    if (!/^(pay|cash|bill):[a-f0-9]{24}$/i.test(refKey)) throw new ApiError(400, "That line was not found.");
    await BankMark.findOneAndUpdate(
      { school: req.user.school, refKey },
      { $set: { cleared: Boolean(req.body.cleared) } },
      { upsert: true }
    );
    res.json({ success: true });
  })
);

module.exports = router;
