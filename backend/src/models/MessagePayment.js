const mongoose = require("mongoose");

const messagePaymentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    amountRwf: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, required: true },
    messages: { type: Number, required: true, min: 1 },
    messagesRemainingAfter: { type: Number, required: true, min: 0 },
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

messagePaymentSchema.index({ school: 1, paidAt: -1 });

module.exports = mongoose.model("MessagePayment", messagePaymentSchema);
