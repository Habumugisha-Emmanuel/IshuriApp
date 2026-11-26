const mongoose = require("mongoose");

const bankMarkSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    refKey: { type: String, required: true },
    cleared: { type: Boolean, default: true },
  },
  { timestamps: true }
);

bankMarkSchema.index({ school: 1, refKey: 1 }, { unique: true });

module.exports = mongoose.model("BankMark", bankMarkSchema);
