const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ROLES = [
  "super_admin",
  "school_admin",
  "teacher",
  "discipline",
  "accountant",
  "student",
  "parent",
];

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, default: "school_admin" },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    avatarUrl: String,
    bio: String,
    title: String,
    gender: { type: String, enum: ["male", "female", "other", ""] },
    socials: {
      whatsapp: String,
      facebook: String,
      twitter: String,
      instagram: String,
      linkedin: String,
      website: String,
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    lastSeenAt: Date,
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    role: this.role,
    school: this.school,
    avatarUrl: this.avatarUrl,
    bio: this.bio,
    title: this.title,
    gender: this.gender,
    socials: this.socials,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

userSchema.index({ school: 1, role: 1 });
userSchema.index({ lastSeenAt: 1, school: 1 });

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
