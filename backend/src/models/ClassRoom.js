const mongoose = require("mongoose");

const classRoomSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    name: { type: String, required: true, trim: true },
    level: String,
    combination: String,
    academicYear: { type: String, required: true },
    classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    subjects: [
      {
        subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
      },
    ],
    capacity: Number,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

classRoomSchema.index({ school: 1, academicYear: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("ClassRoom", classRoomSchema);
