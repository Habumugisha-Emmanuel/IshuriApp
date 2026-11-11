const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { Student, ClassRoom, User, School } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const { toRwandaMsisdn } = require("../utils/phone");
const { assignedClassIds } = require("../utils/teacherClasses");

const router = express.Router();
router.use(authRequired, requireSchoolScope);

async function assertClassAccess(user, classRoomId) {
  const allowed = await assignedClassIds(user);
  if (!allowed) return;
  if (!classRoomId || !allowed.some((id) => id.toString() === String(classRoomId))) {
    throw new ApiError(403, "You can only manage students in a class assigned to you");
  }
}

router.get(
  "/",
  requireRoles("school_admin", "teacher", "discipline", "accountant"),
  asyncHandler(async (req, res) => {
    const filter = { school: req.user.school, isActive: true };
    const allowed = await assignedClassIds(req.user);
    if (req.query.classRoom) filter.classRoom = req.query.classRoom;
    if (allowed) {
      if (req.query.classRoom) {
        const room = await ClassRoom.findOne({ _id: req.query.classRoom, school: req.user.school, isActive: true }).select("_id");
        if (!room) return res.json({ success: true, items: [] });
      } else {
        filter.classRoom = { $in: allowed };
      }
    }
    if (req.query.q) filter.$text = { $search: req.query.q };
    const items = await Student.find(filter).populate("classRoom", "name level academicYear").sort({ fullName: 1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    if (!school.hasMarksSystem()) throw new ApiError(400, "Universities do not register class students here");
    const fullName = String(req.body.fullName || "").trim();
    const studentCode = String(req.body.studentCode || "").trim();
    const classRoom = String(req.body.classRoom || "").trim();
    const { gender, dateOfBirth, address, guardians = [] } = req.body;
    if (!fullName || !studentCode) throw new ApiError(400, "Student name and code are required");
    if (!classRoom) throw new ApiError(400, "Choose a class before registering the student");
    const phoneGuardian = guardians.find((g) => g && String(g.phone || "").trim());
    if (!phoneGuardian) throw new ApiError(400, "Enter the parent phone. That number receives the messages.");
    const klass = await ClassRoom.findOne({ _id: classRoom, school: req.user.school });
    if (!klass) throw new ApiError(400, "Class does not belong to this school");
    const allowed = await assignedClassIds(req.user);
    if (allowed && !allowed.some((id) => id.toString() === String(classRoom))) {
      throw new ApiError(403, "You can only register students in a class assigned to you");
    }
    const phone = toRwandaMsisdn(phoneGuardian.phone);
    if (!phone) throw new ApiError(400, "The parent phone must begin with 250, for example 250727022525.");
    const normalizedGuardians = [
      {
        relation: ["father", "mother", "guardian"].includes(phoneGuardian.relation) ? phoneGuardian.relation : "guardian",
        fullName: String(phoneGuardian.fullName || "").trim() || "Parent",
        phone,
        isPrimary: true,
      },
    ];
    const student = await Student.create({
      school: req.user.school,
      studentCode,
      fullName,
      gender: gender || undefined,
      dateOfBirth,
      address,
      classRoom,
      guardians: normalizedGuardians,
      registeredBy: req.user._id,
    });
    res.status(201).json({ success: true, student });
  })
);

router.patch(
  "/:id",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({ _id: req.params.id, school: req.user.school, isActive: true });
    if (!student) throw new ApiError(404, "Student not found");
    await assertClassAccess(req.user, student.classRoom);
    const fullName = req.body.fullName !== undefined ? String(req.body.fullName || "").trim() : student.fullName;
    const studentCode = req.body.studentCode !== undefined ? String(req.body.studentCode || "").trim() : student.studentCode;
    if (!fullName || !studentCode) throw new ApiError(400, "Student name and code are required");
    if (req.body.classRoom) {
      const klass = await ClassRoom.findOne({ _id: req.body.classRoom, school: req.user.school });
      if (!klass) throw new ApiError(400, "Class does not belong to this school");
      await assertClassAccess(req.user, req.body.classRoom);
      student.classRoom = req.body.classRoom;
    }
    student.fullName = fullName;
    student.studentCode = studentCode;
    if (req.body.guardians) {
      const phoneGuardian = req.body.guardians.find((g) => g && String(g.phone || "").trim());
      if (!phoneGuardian) throw new ApiError(400, "Enter the parent phone. That number receives the messages.");
      const phone = toRwandaMsisdn(phoneGuardian.phone);
      if (!phone) throw new ApiError(400, "The parent phone must begin with 250, for example 250727022525.");
      student.guardians = [
        {
          relation: ["father", "mother", "guardian"].includes(phoneGuardian.relation) ? phoneGuardian.relation : "guardian",
          fullName: String(phoneGuardian.fullName || "").trim() || "Parent",
          phone,
          isPrimary: true,
        },
      ];
    }
    await student.save();
    res.json({ success: true, student, message: `${student.fullName} was updated.` });
  })
);

router.delete(
  "/:id",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({ _id: req.params.id, school: req.user.school, isActive: true });
    if (!student) throw new ApiError(404, "Student not found");
    await assertClassAccess(req.user, student.classRoom);
    student.isActive = false;
    await student.save();
    res.json({ success: true, message: `${student.fullName} was removed from the class list.` });
  })
);

router.get(
  "/:id",
  requireRoles("school_admin", "teacher", "discipline"),
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({ _id: req.params.id, school: req.user.school }).populate("classRoom");
    if (!student) throw new ApiError(404, "Student not found");
    res.json({ success: true, student });
  })
);

router.post(
  "/:id/parent-account",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({ _id: req.params.id, school: req.user.school });
    if (!student) throw new ApiError(404, "Student not found");
    const guardian = student.guardians.find((g) => g.isPrimary) || student.guardians[0];
    if (!guardian) throw new ApiError(400, "Add a guardian first");
    const email = req.body.email || guardian.email;
    const password = req.body.password;
    if (!email || !password) throw new ApiError(400, "Parent email and password are required");
    const user = await User.create({
      fullName: guardian.fullName,
      email,
      phone: guardian.phone,
      role: "parent",
      school: req.user.school,
      passwordHash: await User.hashPassword(password),
    });
    guardian.user = user._id;
    await student.save();
    res.status(201).json({ success: true, user: user.toSafeJSON() });
  })
);

module.exports = router;
