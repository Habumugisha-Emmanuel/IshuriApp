const mongoose = require("mongoose");

const markSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    score: { type: Number, required: true },
    comment: String,
    notifiedAt: Date,
  },
  { timestamps: true }
);

markSchema.index({ assessment: 1, student: 1 }, { unique: true });
markSchema.index({ school: 1, student: 1 });

module.exports = mongoose.model("Mark", markSchema);
