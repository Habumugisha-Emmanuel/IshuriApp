const mongoose = require("mongoose");

const platformAdSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: String,
    imageUrl: String,
    videoUrl: String,
    ctaLabel: String,
    ctaUrl: String,
    category: {
      type: String,
      enum: ["internship", "new_school", "event", "opportunity", "sponsor", "other"],
      default: "other",
    },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    startsAt: Date,
    endsAt: Date,
    isActive: { type: Boolean, default: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

platformAdSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

module.exports = mongoose.model("PlatformAd", platformAdSchema);
