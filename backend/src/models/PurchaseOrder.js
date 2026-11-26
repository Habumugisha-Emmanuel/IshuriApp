const mongoose = require("mongoose");

const purchaseOrderSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    vendorName: { type: String, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: "FeeAccount" },
    accountName: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    tax: { type: Number, default: 0, min: 0 },
    expectedOn: { type: Date, required: true },
    status: { type: String, enum: ["open", "billed"], default: "open" },
    note: String,
    bill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ school: 1, expectedOn: -1 });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
