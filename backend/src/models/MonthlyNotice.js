const mongoose = require("mongoose");

const monthlyNoticeSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    classRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ClassRoom", required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    sentAt: { type: Date, default: Date.now },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

monthlyNoticeSchema.index({ school: 1, classRoom: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("MonthlyNotice", monthlyNoticeSchema);
