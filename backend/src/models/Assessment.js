const mongoose = require("mongoose");

const assessmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    classRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ClassRoom", required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["quiz", "test", "exam", "assignment", "periodic", "national"],
      default: "test",
    },
    term: { type: String, enum: ["1", "2", "3", "annual"], default: "1" },
    academicYear: String,
    maxScore: { type: Number, default: 100 },
    date: { type: Date, default: Date.now },
    comment: String,
    parentsNotifiedAt: Date,
  },
  { timestamps: true }
);

assessmentSchema.index({ school: 1, classRoom: 1, subject: 1, date: -1 });

module.exports = mongoose.model("Assessment", assessmentSchema);
