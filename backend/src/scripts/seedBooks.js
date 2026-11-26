const path = require("path");
const { DEFAULT_ACCOUNTS } = require("../services/books");
const {
  User,
  Staff,
  ClassRoom,
  Student,
  FeeAccount,
  StudentCharge,
  CashEntry,
  Vendor,
  Bill,
  Estimate,
  PurchaseOrder,
  BudgetLine,
  RecurringRule,
  StockItem,
} = require("../models");

const DUE = "2026-11-05";
const PAID_ON = new Date("2026-11-08T12:00:00.000Z");

const CLASSMATES = [
  {
    studentCode: "GSN-2026-015",
    fullName: "Eric Habimana",
    gender: "male",
    address: "Nyamirambo, Nyarugenge",
    parent: "Jeanne Habimana",
    phone: "250788100015",
    lines: [
      ["School fees", 94000, 20000],
      ["Uniform", 18000, 0],
    ],
  },
  {
    studentCode: "GSN-2026-016",
    fullName: "Diane Uwimana",
    gender: "female",
    address: "Kimisagara, Nyarugenge",
    parent: "Jean Uwimana",
    phone: "250788100016",
    lines: [
      ["School fees", 94000, 0],
      ["Uniform", 18000, 0, "2026-09-01"],
    ],
  },
  {
    studentCode: "GSN-2026-017",
    fullName: "Kevin Mugisha",
    gender: "male",
    address: "Gitega, Nyarugenge",
    parent: "Alice Mugisha",
    phone: "250788100017",
    lines: [
      ["School fees", 94000, 70000],
      ["School materials", 12000, 12000],
    ],
  },
  {
    studentCode: "GSN-2026-018",
    fullName: "Sandrine Ingabire",
    gender: "female",
    address: "Nyabugogo, Nyarugenge",
    parent: "Olivier Ingabire",
    phone: "250788100018",
    lines: [
      ["School fees", 94000, 94000],
      ["Toilet paper", 3000, 0],
      ["Communication", 5000, 0],
    ],
  },
  {
    studentCode: "GSN-2026-019",
    fullName: "Patrick Ndayisaba",
    gender: "male",
    address: "Muhima, Nyarugenge",
    parent: "Chantal Ndayisaba",
    phone: "250788100019",
    lines: [
      ["School fees", 94000, 50000],
      ["School materials", 12000, 0],
    ],
  },
  {
    studentCode: "GSN-2026-020",
    fullName: "Bella Keza",
    gender: "female",
    address: "Kiyovu, Nyarugenge",
    parent: "Eric Keza",
    phone: "250788100020",
    lines: [
      ["School fees", 94000, 94000],
      ["Uniform", 18000, 18000],
      ["School materials", 12000, 12000],
      ["Toilet paper", 3000, 3000],
      ["Communication", 5000, 5000],
    ],
  },
  {
    studentCode: "GSN-2026-021",
    fullName: "Yves Hirwa",
    gender: "male",
    address: "Rwezamenyo, Nyarugenge",
    parent: "Marie Hirwa",
    phone: "250788100021",
    lines: [
      ["School fees", 94000, 0],
      ["Communication", 5000, 0],
    ],
  },
];

const ALINE_LINES = [
  ["School fees", 94000, 94000],
  ["Uniform", 18000, 18000],
];

function noon(day) {
  return new Date(`${day}T12:00:00.000Z`);
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function ensureAccountant(school, actorId) {
  const email = "accountant@gsnyarugenge.rw";
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      fullName: "Aline Mukandayisenga",
      email,
      phone: "250788444444",
      role: "accountant",
      school: school._id,
      title: "Accountant",
      passwordHash: await User.hashPassword("Accountant@123"),
    });
  } else if (!user.school) {
    user.school = school._id;
    user.role = "accountant";
    await user.save();
  }
  const staff = await Staff.findOne({ school: school._id, user: user._id });
  if (!staff) {
    await Staff.create({
      school: school._id,
      user: user._id,
      fullName: user.fullName,
      roleTitle: "Accountant",
      category: "accountant",
      email: user.email,
      phone: user.phone,
      whatsapp: user.phone,
      visibility: "public",
    });
  }
  return user;
}

async function ensureStudent(school, classRoom, actorId, row) {
  let student = await Student.findOne({ school: school._id, studentCode: row.studentCode });
  if (!student) {
    student = await Student.create({
      school: school._id,
      studentCode: row.studentCode,
      fullName: row.fullName,
      gender: row.gender,
      classRoom: classRoom._id,
      academicYear: classRoom.academicYear || "2026",
      address: row.address,
      registeredBy: actorId,
      guardians: [
        {
          relation: "father",
          fullName: row.parent,
          phone: row.phone,
          address: row.address,
          isPrimary: true,
        },
      ],
    });
  }
  return student;
}

async function ensureCharge(school, student, account, amountDue, amountPaid, dueDay, actorId) {
  const dueOn = noon(dueDay);
  const existing = await StudentCharge.find({ school: school._id, student: student._id, accountName: account.name });
  const match = existing.find((row) => dayKey(row.dueOn) === dueDay);
  if (match) return match;
  const payments = amountPaid > 0 ? [{ amount: amountPaid, paidOn: PAID_ON, note: "Recorded with the class sample", createdBy: actorId }] : [];
  return StudentCharge.create({
    school: school._id,
    student: student._id,
    classRoom: student.classRoom,
    account: account._id,
    accountName: account.name,
    accountGroup: account.group,
    amountDue,
    amountPaid,
    dueOn,
    span: "year",
    note: "S6 PCM sample",
    createdBy: actorId,
    payments,
  });
}

async function seedClassBooks({ school, classRoom, actorId }) {
  await ensureAccountant(school, actorId);
  const accounts = {};
  for (const row of DEFAULT_ACCOUNTS) {
    accounts[row.name] = await FeeAccount.findOneAndUpdate(
      { school: school._id, code: row.code },
      { $setOnInsert: { ...row, school: school._id, system: true } },
      { upsert: true, new: true }
    );
  }
  const aline = await Student.findOne({ school: school._id, studentCode: "GSN-2026-014" });
  const roster = [...CLASSMATES];
  if (aline) roster.unshift({ studentCode: aline.studentCode, lines: ALINE_LINES, existing: aline });
  for (const row of roster) {
    const student = row.existing || await ensureStudent(school, classRoom, actorId, row);
    for (const [name, due, paid, dueDay] of row.lines) {
      const account = accounts[name];
      if (!account) continue;
      await ensureCharge(school, student, account, due, paid, dueDay || DUE, actorId);
    }
  }
  const expense = await CashEntry.findOne({ school: school._id, title: "November chalk and exercise books" });
  if (!expense) {
    await CashEntry.create({
      school: school._id,
      kind: "expense",
      title: "November chalk and exercise books",
      accountName: "Supplies",
      amount: 45000,
      occurredOn: noon("2026-11-04"),
      note: "S6 PCM sample",
      createdBy: actorId,
    });
    await CashEntry.create({
      school: school._id,
      kind: "expense",
      title: "November electricity and water",
      accountName: "Utilities",
      amount: 120000,
      occurredOn: noon("2026-11-06"),
      note: "S6 PCM sample",
      createdBy: actorId,
    });
    await CashEntry.create({
      school: school._id,
      kind: "other_income",
      title: "Hall rental for a weekend event",
      accountName: "Other income",
      amount: 80000,
      occurredOn: noon("2026-11-09"),
      note: "S6 PCM sample",
      createdBy: actorId,
    });
  }
  let uniforms = await Vendor.findOne({ school: school._id, name: "Kigali Uniforms Ltd" });
  if (!uniforms) {
    uniforms = await Vendor.create({
      school: school._id,
      name: "Kigali Uniforms Ltd",
      phone: "250788555010",
      note: "School uniform supplier",
    });
  }
  let paper = await Vendor.findOne({ school: school._id, name: "Paper House Kigali" });
  if (!paper) {
    paper = await Vendor.create({
      school: school._id,
      name: "Paper House Kigali",
      phone: "250788555011",
      note: "Toilet paper and stationery",
    });
  }
  const openBill = await Bill.findOne({ school: school._id, vendor: uniforms._id, amount: 250000 });
  if (!openBill) {
    await Bill.create({
      school: school._id,
      vendor: uniforms._id,
      vendorName: uniforms.name,
      account: accounts.Supplies?._id,
      accountName: "Supplies",
      amount: 250000,
      amountPaid: 100000,
      dueOn: noon("2026-11-20"),
      note: "Term uniforms for S6 PCM",
      createdBy: actorId,
      payments: [{ amount: 100000, paidOn: PAID_ON, note: "First instalment", createdBy: actorId }],
    });
    await Bill.create({
      school: school._id,
      vendor: paper._id,
      vendorName: paper.name,
      account: accounts.Supplies?._id,
      accountName: "Supplies",
      amount: 60000,
      amountPaid: 0,
      dueOn: noon("2026-10-15"),
      note: "Toilet paper stock for November",
      createdBy: actorId,
      payments: [],
    });
  }
  await Bill.updateOne(
    { school: school._id, vendor: uniforms._id, amount: 250000, tax: { $in: [null, 0] } },
    { $set: { tax: 45000 } }
  );
  const eric = await Student.findOne({ school: school._id, studentCode: "GSN-2026-015" });
  if (eric && accounts.Communication && !(await Estimate.findOne({ school: school._id, student: eric._id, accountName: "Communication" }))) {
    await Estimate.create({
      school: school._id,
      student: eric._id,
      studentName: eric.fullName,
      classRoom: classRoom._id,
      account: accounts.Communication._id,
      accountName: "Communication",
      amount: 5000,
      dueOn: noon("2026-11-18"),
      status: "draft",
      note: "Quote for the term communication fee",
      createdBy: actorId,
    });
  }
  if (paper && accounts.Supplies && !(await PurchaseOrder.findOne({ school: school._id, vendor: paper._id, amount: 40000 }))) {
    await PurchaseOrder.create({
      school: school._id,
      vendor: paper._id,
      vendorName: paper.name,
      account: accounts.Supplies._id,
      accountName: "Supplies",
      amount: 40000,
      tax: 7200,
      expectedOn: noon("2026-11-28"),
      status: "open",
      note: "Extra stationery for S6 PCM",
      createdBy: actorId,
    });
  }
  const budgetRows = [
    ["School fees", 900000],
    ["Supplies", 400000],
    ["Utilities", 200000],
    ["Staff pay", 360000],
  ];
  for (const [accountName, amount] of budgetRows) {
    await BudgetLine.findOneAndUpdate(
      { school: school._id, year: 2026, accountName },
      { $set: { amount } },
      { upsert: true }
    );
  }
  if (accounts["School fees"] && !(await RecurringRule.findOne({ school: school._id, classRoom: classRoom._id, accountName: "School fees" }))) {
    await RecurringRule.create({
      school: school._id,
      classRoom: classRoom._id,
      className: classRoom.name,
      account: accounts["School fees"]._id,
      accountName: "School fees",
      amount: 94000,
      span: "year",
      createdBy: actorId,
    });
  }
  if (!(await StockItem.findOne({ school: school._id, name: "Exercise books" }))) {
    await StockItem.create({
      school: school._id,
      name: "Exercise books",
      category: "stationery",
      unit: "pcs",
      quantity: 40,
      reorderLevel: 10,
      unitCost: 500,
      location: "Store",
    });
  }
}

async function runStandalone() {
  require("dotenv").config({ path: path.join(__dirname, "../../.env") });
  const { connectDb } = require("../config/db");
  const { School } = require("../models");
  await connectDb();
  const school = await School.findOne({ slug: "gs-nyarugenge" });
  if (!school) {
    console.error("GS Nyarugenge is not in the database. Run npm run seed in the backend first.");
    process.exit(1);
  }
  let classRoom = await ClassRoom.findOne({ school: school._id, name: "S6 PCM" });
  if (!classRoom) {
    classRoom = await ClassRoom.create({
      school: school._id,
      name: "S6 PCM",
      level: "A-Level",
      combination: "PCM",
      academicYear: "2026",
    });
  }
  const actor = await User.findOne({ email: "director@gsnyarugenge.rw" });
  await seedClassBooks({ school, classRoom, actorId: actor?._id });
  const count = await Student.countDocuments({ school: school._id, classRoom: classRoom._id });
  console.log(`S6 PCM books ready. Students in the class: ${count}`);
  console.log("Accountant: accountant@gsnyarugenge.rw / Accountant@123");
  process.exit(0);
}

if (require.main === module) {
  runStandalone().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { seedClassBooks };
