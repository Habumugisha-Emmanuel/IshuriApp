const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    paidOn: { type: Date, required: true },
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true }
);

const studentChargeSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    classRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ClassRoom" },
    account: { type: mongoose.Schema.Types.ObjectId, ref: "FeeAccount", required: true },
    accountName: { type: String, required: true },
    accountGroup: { type: String, enum: ["fee", "material", "ledger"], default: "material" },
    amountDue: { type: Number, required: true, min: 1 },
    amountPaid: { type: Number, default: 0, min: 0 },
    dueOn: { type: Date, required: true },
    span: { type: String, enum: ["day", "week", "month", "year"], default: "month" },
    note: String,
    payments: [paymentSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

studentChargeSchema.index({ school: 1, dueOn: 1 });
studentChargeSchema.index({ school: 1, student: 1, account: 1, dueOn: 1 });

module.exports = mongoose.model("StudentCharge", studentChargeSchema);
