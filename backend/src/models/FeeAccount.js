const mongoose = require("mongoose");

const feeAccountSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    group: { type: String, enum: ["fee", "material", "ledger"], default: "material" },
    kind: { type: String, enum: ["asset", "liability", "equity", "income", "expense"], default: "income" },
    amount: { type: Number, default: 0, min: 0 },
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: "ClassRoom" }],
    system: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

feeAccountSchema.index({ school: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("FeeAccount", feeAccountSchema);
