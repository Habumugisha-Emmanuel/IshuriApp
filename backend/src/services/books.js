const { localPhone } = require("../utils/phone");

const TIMEZONE = "Africa/Kigali";

const DEFAULT_ACCOUNTS = [
  { name: "Cash", code: "1000", group: "ledger", kind: "asset" },
  { name: "Accounts receivable", code: "1100", group: "ledger", kind: "asset" },
  { name: "Accounts payable", code: "2000", group: "ledger", kind: "liability" },
  { name: "Retained earnings", code: "3000", group: "ledger", kind: "equity" },
  { name: "School fees", code: "4000", group: "fee", kind: "income" },
  { name: "Uniform", code: "4100", group: "material", kind: "income" },
  { name: "School materials", code: "4200", group: "material", kind: "income" },
  { name: "Toilet paper", code: "4300", group: "material", kind: "income" },
  { name: "Communication", code: "4400", group: "material", kind: "income" },
  { name: "School operations", code: "6000", group: "ledger", kind: "expense" },
  { name: "Supplies", code: "6100", group: "ledger", kind: "expense" },
  { name: "Utilities", code: "6200", group: "ledger", kind: "expense" },
  { name: "Staff pay", code: "6300", group: "ledger", kind: "expense" },
];

function kigaliParts(date) {
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
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
  };
}

function zonedMidnight(year, month, day) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const parts = kigaliParts(guess);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, 0, 0);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
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

function bounds(period, { year, month, on } = {}) {
  const now = kigaliParts(new Date());
  const picked = parseDay(on);
  const y = year >= 2020 && year <= now.year + 1 ? Number(year) : now.year;
  const m = month >= 1 && month <= 12 ? Number(month) : now.month;
  if (period === "day") {
    const stamp = picked || now;
    const start = zonedMidnight(stamp.year, stamp.month, stamp.day);
    return { start, end: new Date(start.getTime() + 86400000), year: stamp.year, month: stamp.month };
  }
  if (period === "week") {
    const stamp = picked || now;
    const midnight = zonedMidnight(stamp.year, stamp.month, stamp.day);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(midnight);
    const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] || 0;
    const start = new Date(midnight.getTime() - back * 86400000);
    return { start, end: new Date(start.getTime() + 7 * 86400000), year: stamp.year, month: stamp.month };
  }
  if (period === "year") {
    return { start: zonedMidnight(y, 1, 1), end: zonedMidnight(y + 1, 1, 1), year: y, month: m };
  }
  const start = zonedMidnight(y, m, 1);
  const end = m === 12 ? zonedMidnight(y + 1, 1, 1) : zonedMidnight(y, m + 1, 1);
  return { start, end, year: y, month: m };
}

function bucketKey(period, date) {
  const stamp = kigaliParts(date);
  if (period === "year") return `${stamp.year}-${String(stamp.month).padStart(2, "0")}`;
  if (period === "day") return String(stamp.hour).padStart(2, "0");
  return `${stamp.year}-${String(stamp.month).padStart(2, "0")}-${String(stamp.day).padStart(2, "0")}`;
}

function seriesKeys(period, start, end) {
  if (period === "day") return Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
  if (period === "year") {
    const { year } = kigaliParts(start);
    return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  }
  const keys = [];
  let cursor = start.getTime();
  const last = end.getTime() - 1;
  while (cursor <= last && keys.length < 400) {
    keys.push(bucketKey(period === "day" ? "week" : period, new Date(cursor)));
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

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount);
}

function riskOf(paid, unpaid) {
  if (unpaid <= 0) return "normal";
  if (paid <= 0) return "at_risk";
  return "medium";
}

function statusOf(paid, unpaid) {
  if (unpaid <= 0) return "paid";
  if (paid <= 0) return "unpaid";
  return "partial";
}

function parentPhoneOf(student, toRwandaMsisdn) {
  const list = student?.guardians || [];
  const primary = list.find((item) => item.isPrimary) || list[0];
  return {
    name: primary?.fullName || "",
    phone: localPhone(primary?.phone) || "",
  };
}

function rollupStudents(charges, toRwandaMsisdn) {
  const rows = new Map();
  charges.forEach((charge) => {
    const student = charge.student;
    if (!student?._id) return;
    const id = String(student._id);
    const billed = charge.amountDue || 0;
    const paid = Math.min(charge.amountPaid || 0, billed);
    const unpaid = Math.max(0, billed - paid);
    let row = rows.get(id);
    if (!row) {
      const parent = parentPhoneOf(student, toRwandaMsisdn);
      row = {
        id,
        name: student.fullName,
        code: student.studentCode || "",
        classId: student.classRoom?._id ? String(student.classRoom._id) : String(charge.classRoom || ""),
        className: student.classRoom?.name || "",
        parent: parent.name,
        phone: parent.phone || "",
        billed: 0,
        paid: 0,
        unpaid: 0,
        feesPaid: 0,
        feeBilled: 0,
        items: [],
      };
      rows.set(id, row);
    }
    row.billed += billed;
    row.paid += paid;
    row.unpaid += unpaid;
    if (charge.accountGroup === "fee") {
      row.feesPaid += paid;
      row.feeBilled += billed;
    }
    row.items.push({
      chargeId: String(charge._id),
      accountId: String(charge.account),
      name: charge.accountName,
      group: charge.accountGroup,
      billed,
      paid,
      unpaid,
      dueOn: charge.dueOn,
    });
  });
  return [...rows.values()].map((row) => ({
    ...row,
    status: statusOf(row.paid, row.unpaid),
    risk: riskOf(row.paid, row.unpaid),
  })).sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
}

function applyStudentFilters(students, { status, risk, min, max, below, itemIds }) {
  return students.filter((student) => {
    if (status && status !== "all" && student.status !== status) return false;
    if (risk && risk !== "all" && student.risk !== risk) return false;
    if (min != null && student.unpaid < min) return false;
    if (max != null && student.unpaid > max) return false;
    if (below != null && student.feesPaid >= below) return false;
    if (below != null && !itemIds.length && student.feeBilled <= 0) return false;
    if (itemIds.length) {
      const owes = student.items.some((item) => itemIds.includes(item.accountId) && item.unpaid > 0);
      if (!owes) return false;
    }
    return true;
  });
}

function inWindow(date, start, end) {
  const time = new Date(date).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function upTo(date, end) {
  return new Date(date).getTime() < end.getTime();
}

function unpaidOf(due, paid) {
  return Math.max(0, (due || 0) - Math.min(paid || 0, due || 0));
}

function buildStatements({ charges = [], payments = [], entries = [], bills = [], start, end, now }) {
  const incomeMap = new Map();
  const expenseMap = new Map();
  const otherLines = [];
  let income = 0;
  let otherIncome = 0;
  let expenses = 0;
  charges.forEach((charge) => {
    if (!inWindow(charge.dueOn, start, end)) return;
    income += charge.amountDue || 0;
    incomeMap.set(charge.accountName, (incomeMap.get(charge.accountName) || 0) + (charge.amountDue || 0));
  });
  entries.forEach((entry) => {
    if (!inWindow(entry.occurredOn, start, end)) return;
    if (entry.kind === "other_income") {
      otherIncome += entry.amount || 0;
      otherLines.push({ name: entry.title, amount: entry.amount || 0 });
    } else {
      expenses += entry.amount || 0;
      const name = entry.accountName || entry.title;
      expenseMap.set(name, (expenseMap.get(name) || 0) + (entry.amount || 0));
    }
  });
  bills.forEach((bill) => {
    if (!inWindow(bill.dueOn, start, end)) return;
    expenses += bill.amount || 0;
    const name = bill.accountName || "Bills";
    expenseMap.set(name, (expenseMap.get(name) || 0) + (bill.amount || 0));
  });

  let cash = 0;
  let incomeToDate = 0;
  let otherToDate = 0;
  let expenseToDate = 0;
  let receivable = 0;
  payments.forEach((payment) => {
    if (upTo(payment.paidOn, end)) cash += payment.amount || 0;
  });
  charges.forEach((charge) => {
    if (!upTo(charge.dueOn, end)) return;
    incomeToDate += charge.amountDue || 0;
    receivable += unpaidOf(charge.amountDue, charge.amountPaid);
  });
  entries.forEach((entry) => {
    if (!upTo(entry.occurredOn, end)) return;
    if (entry.kind === "other_income") {
      otherToDate += entry.amount || 0;
      cash += entry.amount || 0;
    } else {
      expenseToDate += entry.amount || 0;
      cash -= entry.amount || 0;
    }
  });
  let payable = 0;
  bills.forEach((bill) => {
    if (upTo(bill.dueOn, end)) {
      expenseToDate += bill.amount || 0;
      payable += unpaidOf(bill.amount, bill.amountPaid);
    }
    (bill.payments || []).forEach((payment) => {
      if (upTo(payment.paidOn, end)) cash -= payment.amount || 0;
    });
  });
  const equity = incomeToDate + otherToDate - expenseToDate;
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  const payableAging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  const ageOf = (open, dueOn, target) => {
    if (open <= 0) return;
    const days = Math.floor((now.getTime() - new Date(dueOn).getTime()) / 86400000);
    if (days <= 0) target.current += open;
    else if (days <= 30) target.d30 += open;
    else if (days <= 60) target.d60 += open;
    else if (days <= 90) target.d90 += open;
    else target.over90 += open;
  };
  charges.forEach((charge) => {
    ageOf(unpaidOf(charge.amountDue, charge.amountPaid), charge.dueOn, aging);
  });
  bills.forEach((bill) => {
    ageOf(unpaidOf(bill.amount, bill.amountPaid), bill.dueOn, payableAging);
  });
  return {
    profit: {
      income,
      otherIncome,
      expenses,
      net: income + otherIncome - expenses,
      incomeLines: [...incomeMap.entries()].map(([name, amount]) => ({ name, amount })),
      otherLines,
      expenseLines: [...expenseMap.entries()].map(([name, amount]) => ({ name, amount })),
    },
    balance: {
      cash,
      receivable,
      payable,
      equity,
      assets: cash + receivable,
      liabilitiesEquity: payable + equity,
    },
    aging,
    payableAging,
  };
}

module.exports = {
  TIMEZONE,
  DEFAULT_ACCOUNTS,
  bounds,
  bucketKey,
  seriesKeys,
  seriesLabel,
  money,
  riskOf,
  statusOf,
  rollupStudents,
  applyStudentFilters,
  buildStatements,
};
