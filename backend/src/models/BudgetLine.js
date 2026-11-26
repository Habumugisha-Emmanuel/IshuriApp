const mongoose = require("mongoose");

const budgetLineSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    year: { type: Number, required: true },
    accountName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

budgetLineSchema.index({ school: 1, year: 1, accountName: 1 }, { unique: true });

module.exports = mongoose.model("BudgetLine", budgetLineSchema);
