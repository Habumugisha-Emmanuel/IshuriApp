const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const slugify = require("slugify");
const { School, Staff, User } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const { optionalMsisdn } = require("../utils/phone");

function storedPhone(raw, label) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  const phone = optionalMsisdn(raw);
  if (!phone) throw new ApiError(400, `${label} must begin with 250, for example 250788000000.`);
  return phone;
}

const router = express.Router();

router.use(authRequired);

router.get(
  "/mine",
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.role === "super_admin" ? req.query.schoolId : req.user.school);
    if (!school) throw new ApiError(404, "School not found");
    res.json({ success: true, school });
  })
);

router.patch(
  "/mine",
  requireRoles("school_admin"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    if (!school) throw new ApiError(404, "School not found");
    const allowed = [
      "name",
      "motto",
      "tagline",
      "about",
      "history",
      "vision",
      "mission",
      "logoUrl",
      "coverUrl",
      "website",
      "email",
      "phone",
      "whatsapp",
      "socials",
      "location",
      "establishedYear",
      "studentCount",
      "teacherCount",
      "performanceSummary",
      "examResults",
      "facilities",
      "programs",
      "feesNote",
      "visitingHours",
      "ownership",
      "type",
    ];
    allowed.forEach((key) => {
      if (req.body[key] === undefined) return;
      if (key === "phone") school.phone = storedPhone(req.body.phone, "School phone");
      else if (key === "whatsapp") school.whatsapp = storedPhone(req.body.whatsapp, "WhatsApp");
      else school[key] = req.body[key];
    });
    if (school.status === "draft") {
      school.status = "pending_review";
      school.submittedAt = new Date();
    }
    await school.save();
    res.json({ success: true, school });
  })
);

router.post(
  "/mine/submit",
  requireRoles("school_admin"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    if (!["draft", "rejected"].includes(school.status)) {
      throw new ApiError(400, "This school is already in review or live");
    }
    school.status = "pending_review";
    school.submittedAt = new Date();
    school.rejectionReason = undefined;
    await school.save();
    res.json({ success: true, school, message: "Submitted for IshuriApp review" });
  })
);

router.post(
  "/",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    if (req.user.school) throw new ApiError(400, "This account already has a school profile");
    const { name, type, ownership, location } = req.body;
    if (!name || !type) throw new ApiError(400, "School name and type are required");
    const slugBase = slugify(name, { lower: true, strict: true }) || "school";
    let slug = slugBase;
    let i = 1;
    while (await School.findOne({ slug })) slug = `${slugBase}-${i++}`;
    const profile = {};
    [
      "motto",
      "tagline",
      "about",
      "history",
      "vision",
      "mission",
      "logoUrl",
      "coverUrl",
      "website",
      "whatsapp",
      "performanceSummary",
      "feesNote",
      "visitingHours",
      "programs",
      "facilities",
    ].forEach((key) => {
      if (req.body[key] === undefined || req.body[key] === "") return;
      profile[key] = key === "whatsapp" ? storedPhone(req.body[key], "WhatsApp") : req.body[key];
    });
    ["establishedYear", "studentCount", "teacherCount"].forEach((key) => {
      if (req.body[key] !== undefined && req.body[key] !== "") profile[key] = Number(req.body[key]);
    });
    const school = await School.create({
      name,
      slug,
      type,
      ownership: ownership || "public",
      email: req.body.email || req.user.email,
      phone: storedPhone(req.body.phone || req.user.phone, "School phone"),
      location: location || {},
      ...profile,
      status: "pending_review",
      createdBy: req.user._id,
      submittedAt: new Date(),
      subscription: { status: "none" },
    });
    req.user.school = school._id;
    await req.user.save();
    res.status(201).json({
      success: true,
      school,
      message: "School profile submitted. IshuriApp will review it before it becomes public.",
    });
  })
);

router.get(
  "/pending",
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const items = await School.find({ status: "pending_review" }).populate("createdBy", "fullName email phone").sort({ submittedAt: 1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/:id/approve",
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw new ApiError(404, "School not found");
    school.status = "approved";
    school.verified = true;
    school.reviewedAt = new Date();
    school.reviewedBy = req.user._id;
    school.reviewNotes = req.body.notes;
    if (req.body.nationalRank !== undefined) school.nationalRank = req.body.nationalRank;
    await school.save();
    res.json({ success: true, school });
  })
);

router.post(
  "/:id/reject",
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw new ApiError(404, "School not found");
    school.status = "rejected";
    school.reviewedAt = new Date();
    school.reviewedBy = req.user._id;
    school.rejectionReason = req.body.reason || "More verification is required";
    await school.save();
    res.json({ success: true, school });
  })
);

router.post(
  "/:id/activate",
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw new ApiError(404, "School not found");
    school.status = "approved";
    school.verified = true;
    school.reviewedAt = new Date();
    school.reviewedBy = req.user._id;
    school.rejectionReason = undefined;
    await school.save();
    await User.updateMany({ school: school._id, isActive: false }, { isActive: true });
    res.json({ success: true, school, message: "School is active again" });
  })
);

router.delete(
  "/:id",
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw new ApiError(404, "School not found");
    await User.updateMany({ school: school._id }, { isActive: false });
    await School.findByIdAndDelete(school._id);
    res.json({ success: true, message: "School profile deleted" });
  })
);

router.post(
  "/:id/suspend",
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      { status: "suspended", reviewNotes: req.body.reason },
      { new: true }
    );
    res.json({ success: true, school });
  })
);

router.patch(
  "/:id",
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) throw new ApiError(404, "School not found");
    ["nationalRank", "isFeatured", "performanceSummary", "verified"].forEach((key) => {
      if (req.body[key] !== undefined) school[key] = req.body[key];
    });
    await school.save();
    res.json({ success: true, school });
  })
);

router.get(
  "/",
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    const items = await School.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, items });
  })
);

router.get(
  "/:id/staff-review",
  requireRoles("school_admin"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const items = await Staff.find({ school: req.user.school, visibility: "pending" });
    res.json({ success: true, items });
  })
);

module.exports = router;
