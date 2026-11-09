const mongoose = require("mongoose");

const stockItemSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    name: { type: String, required: true, trim: true },
    sku: String,
    category: {
      type: String,
      enum: ["stationery", "lab", "sports", "food", "furniture", "uniform", "other"],
      default: "other",
    },
    unit: { type: String, default: "pcs" },
    quantity: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    unitCost: Number,
    location: String,
    notes: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

stockItemSchema.index({ school: 1, name: 1 });

module.exports = mongoose.model("StockItem", stockItemSchema);
