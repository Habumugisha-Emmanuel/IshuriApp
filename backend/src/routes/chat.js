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

const TYPING_MS = 4500;
const ACTIVE_MS = 70000;

function isActive(seenAt) {
  if (!seenAt) return false;
  return Date.now() - new Date(seenAt).getTime() < ACTIVE_MS;
}

function presentUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    role: user.role,
    schoolName: user.role === "super_admin" ? "IshuriApp" : user.school?.name || "School",
    logoUrl: user.role === "super_admin" ? "" : user.school?.logoUrl || "",
    active: isActive(user.lastSeenAt),
    lastSeenAt: user.lastSeenAt || null,
  };
}

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

function idOf(value) {
  if (!value) return "";
  return String(value._id || value);
}

function presentMessage(message, me, byId = new Map()) {
  const parent = message.replyTo ? byId.get(String(message.replyTo)) : null;
  const reactions = (message.reactions || []).map((row) => ({
    emoji: row.emoji,
    mine: String(row.user) === String(me._id),
  }));
  const sender = idOf(message.sender);
  return {
    id: message._id,
    body: message.unsent ? "" : message.body,
    kind: message.kind || "text",
    unsent: Boolean(message.unsent),
    edited: Boolean(message.editedAt),
    status: message.status,
    mine: Boolean(sender) && sender === String(me._id),
    senderName: message.guestName || message.sender?.fullName || "",
    senderRole: message.sender?.role || (message.guestName ? "parent" : ""),
    createdAt: message.createdAt,
    reactions,
    reply: parent
      ? {
          id: parent._id,
          body: parent.unsent ? "" : parent.body,
          unsent: Boolean(parent.unsent),
          mine: idOf(parent.sender) === String(me._id),
          name: parent.guestName || parent.sender?.fullName || "",
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
    const parent = await ChatMessage.findById(message.replyTo).populate("sender", "fullName role");
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

const DESK_ROLES = new Set(["school_admin", "super_admin", "teacher", "dos", "discipline", "accountant"]);
const STAFF_ROLES = ["school_admin", "teacher", "dos", "discipline", "accountant"];

function assertDesk(user) {
  if (!DESK_ROLES.has(user.role)) {
    throw new ApiError(403, "Messages are for school staff.");
  }
}

function sameSchool(me, peer) {
  const mine = me.school && (me.school._id || me.school);
  const theirs = peer.school && (peer.school._id || peer.school);
  return Boolean(mine && theirs && String(mine) === String(theirs));
}

async function loadPeer(me, userId) {
  assertDesk(me);
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(400, "Choose a person to message");
  if (String(userId) === String(me._id)) throw new ApiError(400, "Choose someone else");
  const peer = await User.findById(userId).populate("school", "name logoUrl");
  if (!peer || peer.isActive === false) throw new ApiError(404, "That person is not available");
  const staffPeer = STAFF_ROLES.includes(peer.role) && sameSchool(me, peer);
  const allowed =
    (me.role === "super_admin" && peer.role === "school_admin") ||
    (me.role === "school_admin" && (peer.role === "super_admin" || peer.role === "school_admin" || staffPeer)) ||
    (me.role !== "super_admin" && me.role !== "school_admin" && staffPeer);
  if (!allowed) {
    throw new ApiError(403, me.role === "super_admin" || me.role === "school_admin"
      ? "You can message school directors and IshuriApp"
      : "You can message the staff at your school.");
  }
  return peer;
}

async function schoolStaff(schoolId) {
  if (!schoolId) return [];
  return User.find({ school: schoolId, isActive: { $ne: false }, role: { $in: STAFF_ROLES } }).select("_id fullName role");
}

function sameIdList(left, right) {
  const a = (left || []).map((id) => String(id)).sort();
  const b = (right || []).map((id) => String(id)).sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

async function ensureSchoolGroup(user) {
  assertDesk(user);
  const schoolId = user.school && (user.school._id || user.school);
  if (!schoolId || user.role === "super_admin") return null;
  const staff = await schoolStaff(schoolId);
  if (!staff.length) return null;
  const key = `group:${schoolId}`;
  let thread = await ChatThread.findOne({ memberKey: key });
  const directorIds = staff.filter((person) => person.role === "school_admin").map((person) => person._id);
  if (!thread) {
    try {
      thread = await ChatThread.create({
        memberKey: key,
        kind: "group",
        title: "School group",
        school: schoolId,
        members: staff.map((person) => person._id),
        admins: directorIds,
        lastAt: new Date(),
      });
    } catch (err) {
      if (err && err.code === 11000) thread = await ChatThread.findOne({ memberKey: key });
      else throw err;
    }
  }
  if (!thread) return null;
  const activeIds = new Set(staff.map((person) => String(person._id)));
  const members = [...new Set((thread.members || []).map((id) => String(id)).filter((id) => activeIds.has(id)))];
  directorIds.forEach((id) => {
    const keyId = String(id);
    if (!members.includes(keyId)) members.push(keyId);
  });
  const admins = directorIds.map((id) => String(id)).filter((id) => members.includes(id));
  if (!sameIdList(thread.members, members) || !sameIdList(thread.admins, admins) || thread.kind !== "group") {
    thread.members = members;
    thread.admins = admins;
    thread.kind = "group";
    thread.title = "School group";
    thread.school = schoolId;
    await thread.save();
  }
  if (!members.includes(String(user._id))) return null;
  return thread;
}

async function requireSchoolGroup(user) {
  const schoolId = user.school && (user.school._id || user.school);
  const thread = await ensureSchoolGroup(user);
  if (thread) return thread;
  if (schoolId && await ChatThread.exists({ memberKey: `group:${schoolId}` })) {
    throw new ApiError(403, "You are not in this group.");
  }
  throw new ApiError(404, "This school has no staff group yet.");
}

function assertGroupAdmin(user, thread) {
  const admin = user.role === "school_admin" || (thread.admins || []).some((id) => String(id) === String(user._id));
  if (!admin) throw new ApiError(403, "Only the school director can change the group.");
}

async function markThreadRead(thread, userId) {
  if (!thread || !userId) return;
  const now = new Date();
  const hit = (thread.reads || []).find((row) => String(row.user) === String(userId));
  if (hit) hit.readAt = now;
  else thread.reads.push({ user: userId, readAt: now });
  if (thread.kind === "family") {
    await ChatMessage.updateMany(
      { thread: thread._id, sender: null, status: "sent" },
      { $set: { status: "read", readAt: now } }
    );
    if (!thread.lastSender) thread.lastStatus = "read";
  }
  await thread.save();
}

function typingRows(thread, exceptId) {
  const now = Date.now();
  const fresh = (row) => row && row.at && now - new Date(row.at).getTime() < TYPING_MS && String(row.user || "") !== String(exceptId || "");
  const rows = (thread?.typing || []).filter(fresh);
  if (
    !rows.length
    && thread?.typingUser
    && fresh({ user: thread.typingUser, at: thread.typingAt })
  ) {
    rows.push({ user: thread.typingUser, at: thread.typingAt });
  }
  return rows;
}

async function typingPeople(thread, exceptId, known = []) {
  const rows = typingRows(thread, exceptId);
  const names = new Map();
  known.forEach((person) => {
    const id = person && (person._id || person.id);
    if (id && person.fullName) names.set(String(id), person.fullName);
  });
  const missing = rows.map((row) => row.user).filter((id) => !names.has(String(id)));
  if (missing.length) {
    const users = await User.find({ _id: { $in: missing } }).select("fullName");
    users.forEach((user) => names.set(String(user._id), user.fullName));
  }
  const people = rows
    .map((row) => ({ id: String(row.user), name: names.get(String(row.user)) || "" }))
    .filter((person) => person.name);
  if (exceptId && thread?.guestTypingAt && Date.now() - new Date(thread.guestTypingAt).getTime() < TYPING_MS) {
    people.push({ id: "parent", name: thread.title || "Parent" });
  }
  return people;
}

function clearTyping(thread, userId) {
  thread.typing = (thread.typing || []).filter((row) => String(row.user) !== String(userId));
  if (String(thread.typingUser || "") === String(userId)) {
    thread.typingUser = null;
    thread.typingAt = null;
  }
}

async function noteTyping(thread, userId) {
  const now = new Date();
  const rows = typingRows(thread, userId);
  rows.push({ user: userId, at: now });
  thread.typing = rows;
  thread.typingUser = userId;
  thread.typingAt = now;
  await thread.save();
}

async function roomStatus(thread, me) {
  const people = await User.find({ _id: { $in: thread.members } }).select("fullName role lastSeenAt");
  const adminIds = new Set((thread.admins || []).map((id) => String(id)));
  const roster = people
    .map((person) => ({
      id: person._id,
      fullName: person.fullName,
      role: person.role,
      active: isActive(person.lastSeenAt),
      lastSeenAt: person.lastSeenAt || null,
      admin: adminIds.has(String(person._id)) || person.role === "school_admin",
      mine: Boolean(me && String(person._id) === String(me._id)),
    }))
    .sort((left, right) => Number(right.admin) - Number(left.admin) || Number(right.mine) - Number(left.mine) || left.fullName.localeCompare(right.fullName));
  const typing = await typingPeople(thread, me && me._id, people);
  const others = roster.filter((person) => !person.mine);
  return {
    roster,
    typing,
    activeCount: others.filter((person) => person.active).length,
  };
}

async function groupPeer(thread, me) {
  const status = await roomStatus(thread, me);
  const canManage = me.role === "school_admin" || (thread.admins || []).some((id) => String(id) === String(me._id));
  let outside = [];
  if (canManage) {
    const inside = new Set((thread.members || []).map((id) => String(id)));
    const staff = await schoolStaff(thread.school);
    outside = staff
      .filter((person) => !inside.has(String(person._id)))
      .map((person) => ({ id: person._id, fullName: person.fullName, role: person.role }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
  }
  return {
    peer: {
      id: "group",
      fullName: "School group",
      role: "group",
      schoolName: "",
      logoUrl: "",
      members: status.roster.length,
      activeCount: status.activeCount,
      active: status.activeCount > 0,
      canManage,
      people: status.roster,
      outside,
    },
    typing: status.typing,
  };
}

async function loadGroupMessages(thread, user, seen) {
  if (seen && thread) await markThreadRead(thread, user._id);
  const rows = thread
    ? await ChatMessage.find({ thread: thread._id }).sort({ createdAt: 1 }).limit(300).populate("sender", "fullName role")
    : [];
  return presentThread(rows, user);
}

async function sharedUnread(threads, userId) {
  const shared = threads.filter((thread) => thread.kind === "group" || thread.kind === "family");
  if (!shared.length) return new Map();
  const clauses = shared.map((thread) => {
    const stamp = (thread.reads || []).find((row) => String(row.user) === String(userId));
    return {
      thread: thread._id,
      createdAt: { $gt: stamp?.readAt || new Date(0) },
      sender: { $ne: userId },
      unsent: { $ne: true },
    };
  });
  const rows = await ChatMessage.aggregate([
    { $match: { $or: clauses } },
    { $group: { _id: "$thread", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
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
    };
    if (req.user.role === "super_admin") {
      filter.role = "school_admin";
    } else if (req.user.role === "school_admin") {
      filter.$or = [
        { role: { $in: ["school_admin", "super_admin"] } },
        { role: { $in: STAFF_ROLES }, school: req.user.school },
      ];
    } else {
      if (!req.user.school) throw new ApiError(403, "No school is attached to this account");
      filter.role = { $in: STAFF_ROLES };
      filter.school = req.user.school;
    }
    const users = await User.find(filter).select("fullName role school lastSeenAt").populate("school", "name logoUrl");
    users.sort((left, right) => {
      if (left.role !== right.role) return left.role === "super_admin" ? -1 : 1;
      return left.fullName.localeCompare(right.fullName);
    });
    let group = false;
    const schoolId = req.user.school && (req.user.school._id || req.user.school);
    if (schoolId && req.user.role !== "super_admin") {
      if (req.user.role === "school_admin") {
        group = Boolean(await ensureSchoolGroup(req.user));
      } else {
        const key = `group:${schoolId}`;
        const mine = await ChatThread.exists({ memberKey: key, members: req.user._id });
        const any = await ChatThread.exists({ memberKey: key });
        group = Boolean(mine) || !any;
      }
    }
    res.json({
      success: true,
      group,
      items: users.map(presentUser),
    });
  })
);

router.get(
  "/inbox",
  asyncHandler(async (req, res) => {
    assertDesk(req.user);
    if (req.user.school && req.user.role !== "super_admin") {
      await ChatThread.updateMany(
        {
          school: req.user.school,
          members: { $ne: req.user._id },
          kind: "family",
          memberKey: /^family:[^:]+$/,
          withUser: null,
        },
        { $addToSet: { members: req.user._id } }
      );
    }
    const threads = await ChatThread.find({ members: req.user._id, lastBody: { $ne: "" } })
      .sort({ lastAt: -1 })
      .limit(40)
      .populate({ path: "members", select: "fullName role school lastSeenAt", populate: { path: "school", select: "name logoUrl" } });
    const directIds = threads.filter((thread) => (thread.kind || "direct") === "direct").map((thread) => thread._id);
    const unreadRows = directIds.length
      ? await ChatMessage.aggregate([
          { $match: { thread: { $in: directIds }, sender: { $ne: req.user._id }, status: "sent", unsent: { $ne: true } } },
          { $group: { _id: "$thread", count: { $sum: 1 } } },
        ])
      : [];
    const unreadByThread = new Map(unreadRows.map((row) => [String(row._id), row.count]));
    const sharedByThread = await sharedUnread(threads, req.user._id);
    sharedByThread.forEach((count, id) => unreadByThread.set(id, count));
    const items = (await Promise.all(threads.map(async (thread) => {
      const kind = thread.kind || "direct";
      let peer = null;
      if (kind === "group") {
        const others = thread.members.filter((member) => String(member._id) !== String(req.user._id));
        const activeCount = others.filter((member) => isActive(member.lastSeenAt)).length;
        peer = {
          id: "group",
          fullName: "School group",
          role: "group",
          schoolName: "",
          logoUrl: "",
          members: thread.members.length,
          activeCount,
          active: activeCount > 0,
        };
      } else if (kind === "family") {
        peer = {
          id: thread.withUser ? `family/${thread.student}/${thread.withUser}` : `family/${thread.student}`,
          fullName: thread.title || "Parent",
          role: "parent",
          schoolName: "",
          logoUrl: "",
          note: thread.withUser ? "Private" : "",
          active: isActive(thread.guestSeenAt),
          lastSeenAt: thread.guestSeenAt || null,
        };
      } else {
        const person = thread.members.find((member) => String(member._id) !== String(req.user._id));
        peer = person ? presentUser(person) : null;
      }
      const typing = await typingPeople(thread, req.user._id, thread.members);
      return {
        threadId: thread._id,
        peer,
        lastBody: thread.lastBody,
        lastAt: thread.lastAt,
        lastMine: String(thread.lastSender || "") === String(req.user._id),
        lastStatus: thread.lastStatus || "sent",
        unread: unreadByThread.get(String(thread._id)) || 0,
        typing,
      };
    }))).filter((item) => item.peer);
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
    let typing = [];
    if (thread) {
      const rows = await ChatMessage.find({ thread: thread._id }).sort({ createdAt: 1 }).limit(300);
      items = presentThread(rows, req.user);
      typing = await typingPeople(thread, req.user._id, [peer]);
    }
    res.json({ success: true, peer: presentUser(peer), threadId: thread?._id || null, peerTyping: typing.length > 0, typing, items });
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
    clearTyping(thread, req.user._id);
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
    if (thread) await noteTyping(thread, req.user._id);
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

router.get(
  "/group",
  asyncHandler(async (req, res) => {
    const thread = await requireSchoolGroup(req.user);
    const items = await loadGroupMessages(thread, req.user, req.query.seen === "1");
    const view = await groupPeer(thread, req.user);
    res.json({
      success: true,
      peer: view.peer,
      threadId: thread._id,
      peerTyping: view.typing.length > 0,
      typing: view.typing,
      items,
    });
  })
);

router.post(
  "/group/members",
  asyncHandler(async (req, res) => {
    const thread = await requireSchoolGroup(req.user);
    assertGroupAdmin(req.user, thread);
    const userId = String(req.body?.userId || "");
    if (!mongoose.isValidObjectId(userId)) throw new ApiError(400, "Choose a person to message");
    const person = await User.findById(userId).select("fullName role school isActive");
    const schoolId = req.user.school && (req.user.school._id || req.user.school);
    if (!person || person.isActive === false || !STAFF_ROLES.includes(person.role) || String(person.school) !== String(schoolId)) {
      throw new ApiError(400, "Choose a staff member at this school.");
    }
    if ((thread.members || []).some((id) => String(id) === userId)) {
      throw new ApiError(400, "That person is already in this group.");
    }
    thread.members.push(person._id);
    if (person.role === "school_admin" && !(thread.admins || []).some((id) => String(id) === userId)) {
      thread.admins.push(person._id);
    }
    await thread.save();
    const view = await groupPeer(thread, req.user);
    res.status(201).json({ success: true, peer: view.peer });
  })
);

router.delete(
  "/group/members/:userId",
  asyncHandler(async (req, res) => {
    const thread = await requireSchoolGroup(req.user);
    assertGroupAdmin(req.user, thread);
    const userId = String(req.params.userId || "");
    if (!mongoose.isValidObjectId(userId)) throw new ApiError(400, "Choose a person to message");
    const person = await User.findById(userId).select("role");
    if (person && person.role === "school_admin") throw new ApiError(400, "The school director stays in this group.");
    if (!(thread.members || []).some((id) => String(id) === userId)) throw new ApiError(404, "That person is not available");
    thread.members = thread.members.filter((id) => String(id) !== userId);
    thread.admins = (thread.admins || []).filter((id) => String(id) !== userId);
    thread.reads = (thread.reads || []).filter((row) => String(row.user) !== userId);
    thread.typing = (thread.typing || []).filter((row) => String(row.user) !== userId);
    if (String(thread.typingUser || "") === userId) {
      thread.typingUser = null;
      thread.typingAt = null;
    }
    await thread.save();
    const view = await groupPeer(thread, req.user);
    res.json({ success: true, peer: view.peer });
  })
);

router.post(
  "/group/typing",
  asyncHandler(async (req, res) => {
    const thread = await requireSchoolGroup(req.user);
    await noteTyping(thread, req.user._id);
    res.json({ success: true });
  })
);

router.post(
  "/group",
  asyncHandler(async (req, res) => {
    const thread = await requireSchoolGroup(req.user);
    const like = req.body?.kind === "like";
    const body = like ? "❤️" : String(req.body?.body || "").trim();
    if (!like && !body) throw new ApiError(400, "Write a message");
    if (body.length > 2000) throw new ApiError(400, "Keep the message under 2000 characters");
    let replyTo = null;
    if (req.body?.replyTo && mongoose.isValidObjectId(req.body.replyTo)) {
      const parent = await ChatMessage.findOne({ _id: req.body.replyTo, thread: thread._id });
      if (parent) replyTo = parent._id;
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
    clearTyping(thread, req.user._id);
    await thread.save();
    const saved = await ChatMessage.findById(message._id).populate("sender", "fullName role");
    res.status(201).json({ success: true, threadId: thread._id, message: await presentSaved(saved, req.user) });
  })
);

function familyPeer(thread) {
  return {
    id: thread.withUser ? `family/${thread.student}/${thread.withUser}` : `family/${thread.student}`,
    fullName: thread.title || "Parent",
    role: "parent",
    schoolName: "",
    logoUrl: "",
    note: thread.withUser ? "Private" : "",
    active: isActive(thread.guestSeenAt),
    lastSeenAt: thread.guestSeenAt || null,
  };
}

async function familyThreadFor(user, studentId, personId) {
  assertDesk(user);
  if (!mongoose.isValidObjectId(studentId)) throw new ApiError(400, "Choose a conversation");
  if (personId && !mongoose.isValidObjectId(personId)) throw new ApiError(400, "Choose a conversation");
  const key = personId ? `family:${studentId}:with:${personId}` : `family:${studentId}`;
  const thread = await ChatThread.findOne({ memberKey: key, members: user._id, kind: "family" });
  if (!thread) throw new ApiError(404, "That conversation is not available");
  if (personId && String(thread.withUser || "") !== String(user._id)) throw new ApiError(404, "That conversation is not available");
  return thread;
}

router.get(
  ["/family/:studentId", "/family/:studentId/:personId"],
  asyncHandler(async (req, res) => {
    const thread = await familyThreadFor(req.user, req.params.studentId, req.params.personId);
    const items = await loadGroupMessages(thread, req.user, req.query.seen === "1");
    const typing = await typingPeople(thread, req.user._id, []);
    res.json({
      success: true,
      peer: familyPeer(thread),
      threadId: thread._id,
      peerTyping: typing.length > 0,
      typing,
      items,
    });
  })
);

router.post(
  ["/family/:studentId/typing", "/family/:studentId/:personId/typing"],
  asyncHandler(async (req, res) => {
    const thread = await familyThreadFor(req.user, req.params.studentId, req.params.personId);
    await noteTyping(thread, req.user._id);
    res.json({ success: true });
  })
);

router.post(
  ["/family/:studentId", "/family/:studentId/:personId"],
  asyncHandler(async (req, res) => {
    const thread = await familyThreadFor(req.user, req.params.studentId, req.params.personId);
    const like = req.body?.kind === "like";
    const body = like ? "❤️" : String(req.body?.body || "").trim();
    if (!like && !body) throw new ApiError(400, "Write a message");
    if (body.length > 2000) throw new ApiError(400, "Keep the message under 2000 characters");
    const message = await ChatMessage.create({
      thread: thread._id,
      sender: req.user._id,
      body,
      kind: like ? "like" : "text",
      status: "sent",
    });
    thread.lastBody = (like ? "❤️" : body.replace(/\s+/g, " ")).slice(0, 180);
    thread.lastAt = message.createdAt;
    thread.lastSender = req.user._id;
    thread.lastStatus = "sent";
    clearTyping(thread, req.user._id);
    await thread.save();
    const saved = await ChatMessage.findById(message._id).populate("sender", "fullName role");
    res.status(201).json({ success: true, threadId: thread._id, message: await presentSaved(saved, req.user) });
  })
);

module.exports = router;
