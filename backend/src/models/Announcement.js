const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ["advertisement", "announcement", "opportunity", "scholarship", "notice"],
      default: "announcement",
    },
    imageUrl: String,
    expiresAt: Date,
    isPublic: { type: Boolean, default: true },
    status: { type: String, enum: ["draft", "published"], default: "published" },
  },
  { timestamps: true }
);

announcementSchema.index({ school: 1, createdAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);
