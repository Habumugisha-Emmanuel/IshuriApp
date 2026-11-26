const mongoose = require("mongoose");

const estimateSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    studentName: { type: String, required: true },
    classRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ClassRoom" },
    account: { type: mongoose.Schema.Types.ObjectId, ref: "FeeAccount", required: true },
    accountName: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    dueOn: { type: Date, required: true },
    status: { type: String, enum: ["draft", "invoiced"], default: "draft" },
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

estimateSchema.index({ school: 1, dueOn: -1 });

module.exports = mongoose.model("Estimate", estimateSchema);
