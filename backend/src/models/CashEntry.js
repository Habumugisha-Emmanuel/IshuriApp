const mongoose = require("mongoose");

const cashEntrySchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    kind: { type: String, enum: ["expense", "other_income"], required: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    occurredOn: { type: Date, required: true },
    note: String,
    accountName: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

cashEntrySchema.index({ school: 1, occurredOn: -1 });

module.exports = mongoose.model("CashEntry", cashEntrySchema);
