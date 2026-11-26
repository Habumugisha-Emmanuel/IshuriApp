const express = require("express");
const slugify = require("slugify");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { User, School, Student, Staff } = require("../models");
const { signToken, authRequired } = require("../middleware/auth");
const { optionalMsisdn } = require("../utils/phone");

function storedPhone(raw, label) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  const phone = optionalMsisdn(raw);
  if (!phone) throw new ApiError(400, `${label} must be 10 digits and start with 07.`);
  return phone;
}

const router = express.Router();

router.post(
  "/register",
  asyncHandler(async () => {
    throw new ApiError(
      403,
      "Students and parents browse IshuriApp without an account. School teams are invited by the director."
    );
  })
);

router.post(
  "/apply-school",
  asyncHandler(async (req, res) => {
    const {
      fullName,
      email,
      phone,
      password,
      schoolName,
      type,
      ownership,
      location,
      about,
      emailSchool,
      phoneSchool,
    } = req.body;
    if (!fullName || !email || !password || !schoolName || !type) {
      throw new ApiError(400, "Director details and school name/type are required");
    }
    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) throw new ApiError(409, "An account with this email already exists");

    const slugBase = slugify(schoolName, { lower: true, strict: true }) || "school";
    let slug = slugBase;
    let i = 1;
    while (await School.findOne({ slug })) {
      slug = `${slugBase}-${i++}`;
    }

    const directorPhone = storedPhone(phone, "Phone");
    const schoolPhone = storedPhone(phoneSchool || phone, "School phone");
    const director = await User.create({
      fullName,
      email,
      phone: directorPhone,
      role: "school_admin",
      passwordHash: await User.hashPassword(password),
    });

    const school = await School.create({
      name: schoolName,
      slug,
      type,
      ownership: ownership || "public",
      status: "pending_review",
      about,
      email: emailSchool || email,
      phone: schoolPhone,
      location: location || {},
      createdBy: director._id,
      submittedAt: new Date(),
      subscription: { status: "none" },
    });

    director.school = school._id;
    await director.save();

    const token = signToken(director);
    res.status(201).json({
      success: true,
      token,
      user: director.toSafeJSON(),
      school,
      message: "Application received. IshuriApp will review the school before it becomes public.",
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || "").toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      throw new ApiError(401, "Invalid email or password");
    }
    if (!user.isActive) throw new ApiError(403, "This account is disabled");
    user.lastLoginAt = new Date();
    user.lastSeenAt = user.lastLoginAt;
    await user.save();
    const school = user.school ? await School.findById(user.school) : null;
    const student =
      user.role === "student" ? await Student.findOne({ user: user._id }).populate("classRoom") : null;
    res.json({
      success: true,
      token: signToken(user),
      user: user.toSafeJSON(),
      school,
      student,
    });
  })
);

router.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    const school = req.user.school ? await School.findById(req.user.school) : null;
    const student =
      req.user.role === "student" ? await Student.findOne({ user: req.user._id }).populate("classRoom") : null;
    res.json({ success: true, user: req.user.toSafeJSON(), school, student });
  })
);

router.post(
  "/presence",
  authRequired,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const recent = req.user.lastSeenAt && now.getTime() - new Date(req.user.lastSeenAt).getTime() < 20000;
    if (!recent) {
      await User.updateOne({ _id: req.user._id }, { $set: { lastSeenAt: now } });
      req.user.lastSeenAt = now;
    }
    res.json({ success: true, lastSeenAt: req.user.lastSeenAt });
  })
);

router.patch(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    if (req.body.fullName !== undefined) {
      const fullName = String(req.body.fullName || "").trim();
      if (!fullName) throw new ApiError(400, "Type your full name.");
      req.user.fullName = fullName;
    }
    if (req.body.phone !== undefined) req.user.phone = storedPhone(req.body.phone, "Phone");
    if (req.body.bio !== undefined) req.user.bio = String(req.body.bio || "").trim().slice(0, 500);
    if (req.body.title !== undefined) req.user.title = String(req.body.title || "").trim().slice(0, 80);
    if (req.body.gender !== undefined) {
      const gender = String(req.body.gender || "");
      if (!["", "male", "female", "other"].includes(gender)) throw new ApiError(400, "Choose a gender.");
      req.user.gender = gender;
    }
    if (req.body.avatarUrl !== undefined) {
      const avatarUrl = String(req.body.avatarUrl || "").trim();
      if (avatarUrl && !/^https:\/\//.test(avatarUrl)) throw new ApiError(400, "The profile photo could not be saved.");
      req.user.avatarUrl = avatarUrl;
    }
    if (req.body.socials && typeof req.body.socials === "object") {
      const current = req.user.socials?.toObject ? req.user.socials.toObject() : { ...(req.user.socials || {}) };
      delete current._id;
      ["facebook", "twitter", "instagram", "linkedin", "website"].forEach((key) => {
        if (req.body.socials[key] === undefined) return;
        current[key] = String(req.body.socials[key] || "").trim().slice(0, 200);
      });
      if (req.body.socials.whatsapp !== undefined) current.whatsapp = storedPhone(req.body.socials.whatsapp, "WhatsApp");
      req.user.socials = current;
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Type a valid email.");
      const taken = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (taken) throw new ApiError(409, "Email already in use");
      req.user.email = email;
    }
    if (req.body.newPassword || req.body.confirmPassword || req.body.currentPassword) {
      const next = String(req.body.newPassword || "");
      if (next.length < 8) throw new ApiError(400, "The new password needs at least 8 characters.");
      if (next !== String(req.body.confirmPassword || "")) throw new ApiError(400, "The new passwords do not match.");
      if (!(await req.user.comparePassword(String(req.body.currentPassword || "")))) {
        throw new ApiError(400, "The current password is not correct.");
      }
      req.user.passwordHash = await User.hashPassword(next);
    }
    await req.user.save();
    const staff = await Staff.findOne({ user: req.user._id });
    if (staff) {
      staff.fullName = req.user.fullName;
      staff.email = req.user.email;
      staff.phone = req.user.phone || "";
      staff.bio = req.user.bio || "";
      staff.photoUrl = req.user.avatarUrl || "";
      staff.whatsapp = req.user.socials?.whatsapp || req.user.phone || "";
      if (req.user.title) staff.roleTitle = req.user.title;
      await staff.save();
    }
    res.json({ success: true, user: req.user.toSafeJSON() });
  })
);

module.exports = router;
