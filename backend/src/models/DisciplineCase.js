const mongoose = require("mongoose");

const disciplineCaseSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    category: {
      type: String,
      enum: ["lateness", "absence", "misconduct", "uniform", "violence", "academic", "other"],
      default: "misconduct",
    },
    severity: { type: String, enum: ["low", "medium", "high"], default: "low" },
    title: { type: String, required: true },
    description: String,
    actionTaken: String,
    marksLost: { type: Number, default: 0 },
    scoreAfter: Number,
    status: { type: String, enum: ["open", "resolved", "escalated"], default: "open" },
    occurredAt: { type: Date, default: Date.now },
    parentNotifiedAt: Date,
  },
  { timestamps: true }
);

disciplineCaseSchema.index({ school: 1, student: 1, occurredAt: -1 });

module.exports = mongoose.model("DisciplineCase", disciplineCaseSchema);
