const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { User, Staff, School, ClassRoom } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const { optionalMsisdn } = require("../utils/phone");

function storedPhone(raw, label) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  const phone = optionalMsisdn(raw);
  if (!phone) throw new ApiError(400, `${label} must begin with 250, for example 250788000000.`);
  return phone;
}

const router = express.Router();
router.use(authRequired, requireSchoolScope);

function schoolId(req) {
  return req.user.role === "super_admin" ? req.query.schoolId || req.body.schoolId : req.user.school;
}

const roleMap = {
  teacher: "teacher",
  discipline: "discipline",
  admin: "school_admin",
  leadership: "school_admin",
  support: "teacher",
};

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { school: schoolId(req), isActive: { $ne: false } };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.visibility) filter.visibility = req.query.visibility;
    const items = await Staff.find(filter)
      .populate("user", "fullName email phone role title")
      .populate("subjects", "name code")
      .populate("classes", "name academicYear");
    res.json({ success: true, items });
  })
);

router.post(
  "/",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(schoolId(req));
    if (!school) throw new ApiError(404, "School not found");
    const {
      fullName,
      email,
      phone,
      password,
      roleTitle,
      category = "teacher",
      department,
      qualifications,
      bio,
      socials,
      whatsapp,
    } = req.body;
    if (!fullName || !roleTitle) throw new ApiError(400, "Name and role title are required");
    if (category === "accountant") {
      throw new ApiError(400, "Accountant accounts are not part of IshuriApp");
    }

    const userRole = roleMap[category] || "teacher";
    const msisdn = storedPhone(phone, "Phone");
    const whatsappNumber = storedPhone(whatsapp || phone, "WhatsApp");

    let user;
    if (email && password) {
      const exists = await User.findOne({ email: String(email).toLowerCase() });
      if (exists) throw new ApiError(409, "Email already in use");
      user = await User.create({
        fullName,
        email,
        phone: msisdn,
        role: userRole,
        school: school._id,
        passwordHash: await User.hashPassword(password),
        title: roleTitle,
        socials,
      });
    }

    const staff = await Staff.create({
      school: school._id,
      user: user?._id,
      fullName,
      roleTitle,
      category,
      department,
      qualifications,
      bio,
      email,
      phone: msisdn,
      whatsapp: whatsappNumber,
      socials,
      visibility: "public",
    });
    res.status(201).json({ success: true, staff, user: user?.toSafeJSON() });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const staff = await Staff.findById(req.params.id);
    if (!staff) throw new ApiError(404, "Staff not found");
    if (req.user.role !== "super_admin" && staff.school.toString() !== req.user.school.toString()) {
      throw new ApiError(403, "Not allowed");
    }
    const isDirector = req.user.role === "school_admin" || req.user.role === "super_admin";
    const isSelf = staff.user && staff.user.toString() === req.user._id.toString();
    if (!isDirector && !isSelf) throw new ApiError(403, "Not allowed");

    const allowed = [
      "fullName",
      "roleTitle",
      "department",
      "qualifications",
      "bio",
      "photoUrl",
      "email",
      "phone",
      "whatsapp",
      "socials",
      "subjects",
      "classes",
    ];
    allowed.forEach((key) => {
      if (req.body[key] === undefined) return;
      if (key === "phone") staff.phone = storedPhone(req.body.phone, "Phone");
      else if (key === "whatsapp") staff.whatsapp = storedPhone(req.body.whatsapp, "WhatsApp");
      else staff[key] = req.body[key];
    });
    if (isDirector && req.body.category !== undefined) {
      if (req.body.category === "accountant") throw new ApiError(400, "Accountant accounts are not part of IshuriApp");
      staff.category = req.body.category;
    }
    if (isDirector) {
      const nextRole = roleMap[staff.category] || "teacher";
      if (staff.user) {
        const user = await User.findById(staff.user);
        if (user) {
          if (req.body.fullName) user.fullName = req.body.fullName;
          if (req.body.phone !== undefined) user.phone = staff.phone;
          if (req.body.roleTitle) user.title = req.body.roleTitle;
          if (req.body.email) {
            const email = String(req.body.email).toLowerCase();
            const taken = await User.findOne({ email, _id: { $ne: user._id } });
            if (taken) throw new ApiError(409, "Email already in use");
            user.email = email;
            staff.email = email;
          }
          user.role = nextRole;
          if (req.body.password) user.passwordHash = await User.hashPassword(req.body.password);
          await user.save();
        }
      } else if (req.body.email && req.body.password) {
        const email = String(req.body.email).toLowerCase();
        const taken = await User.findOne({ email });
        if (taken) throw new ApiError(409, "Email already in use");
        const user = await User.create({
          fullName: staff.fullName,
          email,
          phone: staff.phone,
          role: nextRole,
          school: staff.school,
          passwordHash: await User.hashPassword(req.body.password),
          title: staff.roleTitle,
        });
        staff.user = user._id;
        staff.email = email;
      }
    }
    if (!isDirector) staff.visibility = "pending";
    await staff.save();
    res.json({
      success: true,
      staff,
      message: isDirector ? "Updated" : "Submitted to the director for public review",
    });
  })
);

router.post(
  "/:id/approve",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      { visibility: "public", reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, staff });
  })
);

router.delete(
  "/:id",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const staff = await Staff.findOne({ _id: req.params.id, school: req.user.school });
    if (!staff) throw new ApiError(404, "Staff not found");
    staff.isActive = false;
    staff.visibility = "draft";
    await staff.save();
    if (staff.user) await User.findByIdAndUpdate(staff.user, { isActive: false });
    await ClassRoom.updateMany({ school: staff.school, classTeacher: staff._id }, { $unset: { classTeacher: "" } });
    await ClassRoom.updateMany(
      { school: staff.school, "subjects.teacher": staff._id },
      { $unset: { "subjects.$[row].teacher": "" } },
      { arrayFilters: [{ "row.teacher": staff._id }] }
    );
    res.json({ success: true });
  })
);

module.exports = router;
