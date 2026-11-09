const mongoose = require("mongoose");

const smsLedgerSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    type: {
      type: String,
      enum: ["wholesale_purchase", "school_topup", "send_debit", "refund", "adjustment"],
      required: true,
    },
    credits: { type: Number, required: true },
    unitPriceRwf: Number,
    amountRwf: Number,
    balanceAfter: Number,
    platformBalanceAfter: Number,
    gatewayMessageId: String,
    category: { type: String, enum: ["marks", "results", "discipline", "notice"], default: "notice" },
    billing: { type: String, enum: ["paid", "unpaid"], default: "paid" },
    recipients: Number,
    parts: Number,
    messagePreview: String,
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

smsLedgerSchema.index({ school: 1, createdAt: -1 });
smsLedgerSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("SmsLedger", smsLedgerSchema);
