const mongoose = require("mongoose");

const guardianSchema = new mongoose.Schema(
  {
    relation: { type: String, enum: ["father", "mother", "guardian"], required: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: String,
    address: String,
    occupation: String,
    isPrimary: { type: Boolean, default: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    studentCode: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female", "other"] },
    dateOfBirth: Date,
    photoUrl: String,
    classRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ClassRoom" },
    academicYear: String,
    address: String,
    guardians: [guardianSchema],
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

studentSchema.index({ school: 1, studentCode: 1 }, { unique: true });
studentSchema.index({ school: 1, classRoom: 1 });
studentSchema.index({ fullName: "text" });

module.exports = mongoose.model("Student", studentSchema);
