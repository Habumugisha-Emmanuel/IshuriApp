const mongoose = require("mongoose");

const disciplineTermSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    academicYear: { type: String, required: true },
    term: { type: String, required: true },
    maxMarks: { type: Number, required: true, default: 40 },
    normalFrom: { type: Number, required: true, default: 30 },
    mediumFrom: { type: Number, required: true, default: 20 },
    abnormalFrom: { type: Number, required: true, default: 10 },
  },
  { timestamps: true }
);

disciplineTermSchema.index({ school: 1, academicYear: 1, term: 1 }, { unique: true });

module.exports = mongoose.model("DisciplineTerm", disciplineTermSchema);
