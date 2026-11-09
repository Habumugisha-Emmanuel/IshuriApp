const mongoose = require("mongoose");

const operatingCostSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["gateway", "operating"], required: true },
    amountRwf: { type: Number, required: true, min: 0 },
    spentAt: { type: Date, required: true },
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

operatingCostSchema.index({ spentAt: -1, kind: 1 });

module.exports = mongoose.model("OperatingCost", operatingCostSchema);
