const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    description: String,
    monthlyPriceRwf: { type: Number, required: true },
    yearlyPriceRwf: Number,
    features: [String],
    schoolTypes: [{ type: String, enum: ["primary", "secondary", "tvet", "university"] }],
    maxStaff: Number,
    maxStudents: Number,
    includedSmsCredits: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
