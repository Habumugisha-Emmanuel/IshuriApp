const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    fullName: { type: String, required: true, trim: true },
    roleTitle: { type: String, required: true },
    category: {
      type: String,
      enum: ["teacher", "admin", "discipline", "accountant", "support", "leadership"],
      default: "teacher",
    },
    department: String,
    qualifications: String,
    bio: String,
    photoUrl: String,
    email: String,
    phone: String,
    whatsapp: String,
    socials: {
      facebook: String,
      twitter: String,
      instagram: String,
      linkedin: String,
    },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: "ClassRoom" }],
    visibility: { type: String, enum: ["draft", "pending", "public"], default: "draft" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

staffSchema.index({ school: 1, category: 1, visibility: 1 });

module.exports = mongoose.model("Staff", staffSchema);
