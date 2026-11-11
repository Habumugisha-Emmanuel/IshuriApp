const mongoose = require("mongoose");

const chatThreadSchema = new mongoose.Schema(
  {
    memberKey: { type: String, required: true, unique: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    lastBody: { type: String, default: "" },
    lastAt: { type: Date, default: Date.now },
    lastSender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastStatus: { type: String, enum: ["sent", "read"], default: "sent" },
    typingUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    typingAt: Date,
  },
  { timestamps: true }
);

chatThreadSchema.index({ members: 1, lastAt: -1 });

module.exports = mongoose.model("ChatThread", chatThreadSchema);
