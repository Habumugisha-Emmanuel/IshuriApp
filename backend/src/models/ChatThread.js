const mongoose = require("mongoose");

const chatThreadSchema = new mongoose.Schema(
  {
    memberKey: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["direct", "group", "family"], default: "direct" },
    title: { type: String, default: "" },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    withUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    guestTypingStudent: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lastBody: { type: String, default: "" },
    lastAt: { type: Date, default: Date.now },
    lastSender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastStatus: { type: String, enum: ["sent", "read"], default: "sent" },
    reads: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      readAt: { type: Date, default: Date.now },
    }],
    typing: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
    }],
    typingUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    typingAt: Date,
    guestTypingAt: Date,
    guestSeenAt: Date,
  },
  { timestamps: true }
);

chatThreadSchema.index({ members: 1, lastAt: -1 });

module.exports = mongoose.model("ChatThread", chatThreadSchema);
