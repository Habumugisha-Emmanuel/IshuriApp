const mongoose = require("mongoose");

const disciplineScoreSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    academicYear: { type: String, required: true },
    term: { type: String, required: true },
    score: { type: Number, required: true },
  },
  { timestamps: true }
);

disciplineScoreSchema.index({ school: 1, student: 1, academicYear: 1, term: 1 }, { unique: true });

module.exports = mongoose.model("DisciplineScore", disciplineScoreSchema);
