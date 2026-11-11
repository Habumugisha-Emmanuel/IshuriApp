const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: "StockItem", required: true },
    type: { type: String, enum: ["in", "out"], required: true },
    quantity: { type: Number, required: true, min: 1 },
    reason: String,
    reference: String,
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

stockMovementSchema.index({ school: 1, createdAt: -1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
