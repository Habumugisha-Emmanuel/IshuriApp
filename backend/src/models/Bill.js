const mongoose = require("mongoose");

const billPaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    paidOn: { type: Date, required: true },
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true }
);

const billSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    vendorName: { type: String, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: "FeeAccount" },
    accountName: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    amountPaid: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    dueOn: { type: Date, required: true },
    note: String,
    payments: [billPaymentSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

billSchema.index({ school: 1, dueOn: -1 });

module.exports = mongoose.model("Bill", billSchema);
