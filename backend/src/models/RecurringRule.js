const mongoose = require("mongoose");

const recurringRuleSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    classRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ClassRoom", required: true },
    className: { type: String, default: "" },
    account: { type: mongoose.Schema.Types.ObjectId, ref: "FeeAccount", required: true },
    accountName: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    span: { type: String, enum: ["day", "week", "month", "year"], default: "month" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

recurringRuleSchema.index({ school: 1, classRoom: 1, account: 1 });

module.exports = mongoose.model("RecurringRule", recurringRuleSchema);
