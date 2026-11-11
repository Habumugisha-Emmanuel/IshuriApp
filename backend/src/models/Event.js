const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: [
        "parents_meeting",
        "sport",
        "competition",
        "debate",
        "ceremony",
        "visiting_day",
        "graduation",
        "scholarship",
        "other",
      ],
      default: "other",
    },
    description: String,
    coverUrl: String,
    venue: String,
    startsAt: { type: Date, required: true },
    endsAt: Date,
    isPublic: { type: Boolean, default: true },
    status: { type: String, enum: ["draft", "published", "cancelled"], default: "published" },
  },
  { timestamps: true }
);

eventSchema.index({ school: 1, startsAt: -1 });
eventSchema.index({ isPublic: 1, status: 1, startsAt: -1 });

module.exports = mongoose.model("Event", eventSchema);
