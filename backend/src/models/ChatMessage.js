const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    thread: { type: mongoose.Schema.Types.ObjectId, ref: "ChatThread", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, default: "", maxlength: 2000 },
    kind: { type: String, enum: ["text", "like"], default: "text" },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "ChatMessage" },
    reactions: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      emoji: { type: String, trim: true },
    }],
    unsent: { type: Boolean, default: false },
    editedAt: Date,
    status: { type: String, enum: ["sent", "read"], default: "sent" },
    readAt: Date,
  },
  { timestamps: true }
);

chatMessageSchema.index({ thread: 1, createdAt: 1 });
chatMessageSchema.index({ thread: 1, sender: 1, status: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
