const mongoose = require("mongoose");

const SCHOOL_TYPES = ["primary", "secondary", "tvet", "university"];
const STATUSES = ["draft", "pending_review", "approved", "rejected", "suspended"];
const OWNERSHIP = ["public", "private", "faith_based", "international"];

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    type: { type: String, enum: SCHOOL_TYPES, required: true },
    ownership: { type: String, enum: OWNERSHIP, default: "public" },
    status: { type: String, enum: STATUSES, default: "draft" },
    motto: String,
    tagline: String,
    about: String,
    history: String,
    vision: String,
    mission: String,
    logoUrl: String,
    coverUrl: String,
    website: String,
    email: String,
    phone: String,
    whatsapp: String,
    socials: {
      facebook: String,
      twitter: String,
      instagram: String,
      youtube: String,
      linkedin: String,
    },
    location: {
      province: String,
      district: String,
      sector: String,
      cell: String,
      village: String,
      address: String,
      landmark: String,
      latitude: Number,
      longitude: Number,
    },
    establishedYear: Number,
    studentCount: Number,
    teacherCount: Number,
    nationalRank: Number,
    performanceSummary: String,
    examResults: [
      {
        year: Number,
        exam: String,
        passRate: Number,
        distinctionRate: Number,
        notes: String,
      },
    ],
    facilities: [String],
    programs: [String],
    feesNote: String,
    visitingHours: String,
    smsBalance: { type: Number, default: 0, min: 0 },
    messagesGranted: { type: Number, default: 0, min: 0 },
    messagesRemaining: { type: Number, default: 0, min: 0 },
    subscription: {
      plan: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan" },
      status: { type: String, enum: ["none", "trial", "active", "expired", "cancelled"], default: "none" },
      startsAt: Date,
      endsAt: Date,
    },
    submittedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewNotes: String,
    rejectionReason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    followersCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0, min: 0 },
    ratingCount: { type: Number, default: 0, min: 0 },
     likeCount: { type: Number, default: 0, min: 0 },

    isFeatured: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

schoolSchema.index({ name: "text", motto: "text", about: "text", "location.district": "text" });
schoolSchema.index({ status: 1, type: 1 });
schoolSchema.index({ "location.province": 1, "location.district": 1 });
schoolSchema.index({ nationalRank: 1 });

schoolSchema.virtual("isUniversity").get(function isUniversity() {
  return this.type === "university";
});

schoolSchema.methods.hasMarksSystem = function hasMarksSystem() {
  return this.type !== "university";
};

module.exports = mongoose.model("School", schoolSchema);
module.exports.SCHOOL_TYPES = SCHOOL_TYPES;
module.exports.STATUSES = STATUSES;
