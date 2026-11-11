const mongoose = require("mongoose");

const platformWalletSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "sms" },
    wholesaleCredits: { type: Number, default: 0 },
    totalBought: { type: Number, default: 0 },
    totalSoldToSchools: { type: Number, default: 0 },
    totalSent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

platformWalletSchema.statics.getSmsWallet = async function getSmsWallet() {
  return this.findOneAndUpdate({ key: "sms" }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
};

module.exports = mongoose.model("PlatformWallet", platformWalletSchema);
