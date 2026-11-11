const mongoose = require("mongoose");

const galleryItemSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    imageUrl: { type: String, required: true },
    caption: String,
    album: { type: String, default: "Campus" },
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

galleryItemSchema.index({ school: 1, createdAt: -1 });

module.exports = mongoose.model("GalleryItem", galleryItemSchema);
