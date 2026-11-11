const express = require("express");
const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { authRequired } = require("../middleware/auth");
const { User, ChatThread, ChatMessage } = require("../models");

const router = express.Router();
router.use(authRequired);

function memberKey(left, right) {
  return [String(left), String(right)].sort().join(":");
}

function presentUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    role: user.role,
    schoolName: user.role === "super_admin" ? "IshuriApp" : user.school?.name || "School",
    logoUrl: user.role === "super_admin" ? "" : user.school?.logoUrl || "",
  };
}

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

function presentMessage(message, me, byId = new Map()) {
  const parent = message.replyTo ? byId.get(String(message.replyTo)) : null;
  const reactions = (message.reactions || []).map((row) => ({
    emoji: row.emoji,
    mine: String(row.user) === String(me._id),
  }));
  return {
    id: message._id,
    body: message.unsent ? "" : message.body,
    kind: message.kind || "text",
    unsent: Boolean(message.unsent),
    edited: Boolean(message.editedAt),
    status: message.status,
    mine: String(message.sender) === String(me._id),
    createdAt: message.createdAt,
    reactions,
    reply: parent
      ? {
          id: parent._id,
          body: parent.unsent ? "" : parent.body,
          unsent: Boolean(parent.unsent),
          mine: String(parent.sender) === String(me._id),
          kind: parent.kind || "text",
        }
      : null,
  };
}

function presentThread(rows, me) {
  const byId = new Map(rows.map((row) => [String(row._id), row]));
  return rows.map((row) => presentMessage(row, me, byId));
}

async function presentSaved(message, me) {
  const byId = new Map();
  if (message.replyTo) {
    const parent = await ChatMessage.findById(message.replyTo);
    if (parent) byId.set(String(parent._id), parent);
  }
  return presentMessage(message, me, byId);
}

async function ownedMessage(req) {
  assertDesk(req.user);
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "That message is missing");
  const message = await ChatMessage.findById(req.params.id);
  if (!message) throw new ApiError(404, "That message is missing");
  const thread = await ChatThread.findOne({ _id: message.thread, members: req.user._id });
  if (!thread) throw new ApiError(403, "You are not in this conversation");
  return { message, thread };
}

function assertDesk(user) {
  if (user.role !== "school_admin" && user.role !== "super_admin") {
    throw new ApiError(403, "Messages are for school directors and IshuriApp");
  }
}

async function loadPeer(me, userId) {
  assertDesk(me);
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(400, "Choose a person to message");
  if (String(userId) === String(me._id)) throw new ApiError(400, "Choose someone else");
  const peer = await User.findById(userId).populate("school", "name logoUrl");
  if (!peer || peer.isActive === false) throw new ApiError(404, "That person is not available");
  const allowed =
    (me.role === "super_admin" && peer.role === "school_admin") ||
    (me.role === "school_admin" && (peer.role === "super_admin" || peer.role === "school_admin"));
  if (!allowed) throw new ApiError(403, "You can message school directors and IshuriApp");
  return peer;
}

async function openThread(me, peer) {
  const key = memberKey(me._id, peer._id);
  const existing = await ChatThread.findOne({ memberKey: key });
  if (existing) return existing;
  try {
    return await ChatThread.create({
      memberKey: key,
      members: [me._id, peer._id],
      lastAt: new Date(),
    });
  } catch (err) {
    if (err && err.code === 11000) return ChatThread.findOne({ memberKey: key });
    throw err;
  }
}

router.get(
  "/people",
  asyncHandler(async (req, res) => {
    assertDesk(req.user);
    const filter = {
      isActive: { $ne: false },
      _id: { $ne: req.user._id },
      role: req.user.role === "super_admin" ? "school_admin" : { $in: ["school_admin", "super_admin"] },
    };
    const users = await User.find(filter).select("fullName role school").populate("school", "name logoUrl");
    users.sort((left, right) => {
      if (left.role !== right.role) return left.role === "super_admin" ? -1 : 1;
      return left.fullName.localeCompare(right.fullName);
    });
    res.json({ success: true, items: users.map(presentUser) });
  })
);

router.get(
  "/inbox",
  asyncHandler(async (req, res) => {
    assertDesk(req.user);
    const threads = await ChatThread.find({ members: req.user._id, lastBody: { $ne: "" } })
      .sort({ lastAt: -1 })
      .limit(40)
      .populate({ path: "members", select: "fullName role school", populate: { path: "school", select: "name logoUrl" } });
    const ids = threads.map((thread) => thread._id);
    const unreadRows = ids.length
      ? await ChatMessage.aggregate([
          { $match: { thread: { $in: ids }, sender: { $ne: req.user._id }, status: "sent", unsent: { $ne: true } } },
          { $group: { _id: "$thread", count: { $sum: 1 } } },
        ])
      : [];
    const unreadByThread = new Map(unreadRows.map((row) => [String(row._id), row.count]));
    const items = threads.map((thread) => {
      const peer = thread.members.find((member) => String(member._id) !== String(req.user._id));
      return {
        threadId: thread._id,
        peer: peer ? presentUser(peer) : null,
        lastBody: thread.lastBody,
        lastAt: thread.lastAt,
        lastMine: String(thread.lastSender || "") === String(req.user._id),
        lastStatus: thread.lastStatus || "sent",
        unread: unreadByThread.get(String(thread._id)) || 0,
      };
    }).filter((item) => item.peer);
    items.sort((left, right) => right.unread - left.unread || new Date(right.lastAt) - new Date(left.lastAt));
    const unread = items.reduce((sum, item) => sum + item.unread, 0);
    res.json({ success: true, unread, items });
  })
);

router.get(
  "/with/:userId",
  asyncHandler(async (req, res) => {
    const peer = await loadPeer(req.user, req.params.userId);
    const thread = await ChatThread.findOne({ memberKey: memberKey(req.user._id, peer._id) });
    let items = [];
    if (thread && req.query.seen === "1") {
      const marked = await ChatMessage.updateMany(
        { thread: thread._id, sender: { $ne: req.user._id }, status: "sent" },
        { $set: { status: "read", readAt: new Date() } }
      );
      if (marked.modifiedCount && String(thread.lastSender || "") !== String(req.user._id)) {
        thread.lastStatus = "read";
        await thread.save();
      }
    }
    let peerTyping = false;
    if (thread) {
      const rows = await ChatMessage.find({ thread: thread._id }).sort({ createdAt: 1 }).limit(300);
      items = presentThread(rows, req.user);
      peerTyping = Boolean(
        thread.typingUser
        && String(thread.typingUser) !== String(req.user._id)
        && thread.typingAt
        && Date.now() - new Date(thread.typingAt).getTime() < 4000
      );
    }
    res.json({ success: true, peer: presentUser(peer), threadId: thread?._id || null, peerTyping, items });
  })
);

router.post(
  "/with/:userId",
  asyncHandler(async (req, res) => {
    const peer = await loadPeer(req.user, req.params.userId);
    const like = req.body?.kind === "like";
    const body = like ? "❤️" : String(req.body?.body || "").trim();
    if (!like && !body) throw new ApiError(400, "Write a message");
    if (body.length > 2000) throw new ApiError(400, "Keep the message under 2000 characters");
    const thread = await openThread(req.user, peer);
    let replyTo = null;
    if (req.body?.replyTo) {
      if (!mongoose.isValidObjectId(req.body.replyTo)) throw new ApiError(400, "Choose a message to reply to");
      const parent = await ChatMessage.findOne({ _id: req.body.replyTo, thread: thread._id });
      if (!parent) throw new ApiError(400, "That message is no longer in this chat");
      replyTo = parent._id;
    }
    const message = await ChatMessage.create({
      thread: thread._id,
      sender: req.user._id,
      body,
      kind: like ? "like" : "text",
      replyTo,
      status: "sent",
    });
    thread.lastBody = (like ? "❤️" : body.replace(/\s+/g, " ")).slice(0, 180);
    thread.lastAt = message.createdAt;
    thread.lastSender = req.user._id;
    thread.lastStatus = "sent";
    thread.typingUser = null;
    thread.typingAt = null;
    await thread.save();
    res.status(201).json({
      success: true,
      threadId: thread._id,
      message: await presentSaved(message, req.user),
    });
  })
);

router.post(
  "/with/:userId/typing",
  asyncHandler(async (req, res) => {
    const peer = await loadPeer(req.user, req.params.userId);
    const thread = await ChatThread.findOne({ memberKey: memberKey(req.user._id, peer._id) });
    if (thread) {
      thread.typingUser = req.user._id;
      thread.typingAt = new Date();
      await thread.save();
    }
    res.json({ success: true });
  })
);

router.post(
  "/messages/:id/react",
  asyncHandler(async (req, res) => {
    const { message } = await ownedMessage(req);
    const emoji = String(req.body?.emoji || "");
    if (!REACTIONS.includes(emoji)) throw new ApiError(400, "Choose a reaction");
    if (message.unsent) throw new ApiError(400, "That message was unsent");
    const reactions = [...(message.reactions || [])];
    const index = reactions.findIndex((row) => String(row.user) === String(req.user._id));
    if (index >= 0 && reactions[index].emoji === emoji) reactions.splice(index, 1);
    else if (index >= 0) reactions[index].emoji = emoji;
    else reactions.push({ user: req.user._id, emoji });
    message.reactions = reactions;
    message.markModified("reactions");
    await message.save();
    res.json({ success: true, message: await presentSaved(message, req.user) });
  })
);

router.patch(
  "/messages/:id",
  asyncHandler(async (req, res) => {
    const { message, thread } = await ownedMessage(req);
    if (String(message.sender) !== String(req.user._id)) throw new ApiError(403, "You can edit only your own message");
    if (message.unsent) throw new ApiError(400, "That message was unsent");
    if (message.kind === "like") throw new ApiError(400, "A heart cannot be edited");
    const body = String(req.body?.body || "").trim();
    if (!body) throw new ApiError(400, "Write the message");
    if (body.length > 2000) throw new ApiError(400, "Keep the message under 2000 characters");
    message.body = body;
    message.editedAt = new Date();
    await message.save();
    const latest = await ChatMessage.findOne({ thread: thread._id }).sort({ createdAt: -1 });
    if (latest && String(latest._id) === String(message._id)) {
      thread.lastBody = body.replace(/\s+/g, " ").slice(0, 180);
      await thread.save();
    }
    res.json({ success: true, message: await presentSaved(message, req.user) });
  })
);

router.delete(
  "/messages/:id",
  asyncHandler(async (req, res) => {
    const { message, thread } = await ownedMessage(req);
    if (String(message.sender) !== String(req.user._id)) throw new ApiError(403, "You can unsend only your own message");
    message.unsent = true;
    message.body = "";
    message.reactions = [];
    await message.save();
    const latest = await ChatMessage.findOne({ thread: thread._id }).sort({ createdAt: -1 });
    if (latest && String(latest._id) === String(message._id)) {
      thread.lastBody = "Message unsent";
      thread.lastAt = new Date();
      await thread.save();
    }
    res.json({ success: true, message: await presentSaved(message, req.user) });
  })
);

module.exports = router;
