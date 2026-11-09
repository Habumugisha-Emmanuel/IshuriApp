const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { School, Subject, ClassRoom, Staff } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const { assignedClassIds } = require("../utils/teacherClasses");

const router = express.Router();
router.use(authRequired, requireSchoolScope);

async function assertMarksSchool(req) {
  const school = await School.findById(req.user.school);
  if (!school) throw new ApiError(404, "School not found");
  if (!school.hasMarksSystem()) {
    throw new ApiError(400, "Universities do not use the marks and class register in IshuriApp");
  }
  return school;
}

router.get(
  "/subjects",
  asyncHandler(async (req, res) => {
    const items = await Subject.find({ school: req.user.school, isActive: true }).sort({ name: 1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/subjects",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const item = await Subject.create({ ...req.body, school: req.user.school });
    res.status(201).json({ success: true, item });
  })
);

router.patch(
  "/subjects/:id",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const item = await Subject.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      req.body,
      { new: true }
    );
    res.json({ success: true, item });
  })
);

router.get(
  "/classes",
  asyncHandler(async (req, res) => {
    const filter = { school: req.user.school, isActive: true };
    if (req.query.academicYear) filter.academicYear = req.query.academicYear;
    const allowed = await assignedClassIds(req.user);
    if (allowed && req.query.scope !== "all") filter._id = { $in: allowed };
    const items = await ClassRoom.find(filter)
      .populate("classTeacher", "fullName roleTitle")
      .populate("subjects.subject", "name code")
      .populate("subjects.teacher", "fullName");
    res.json({ success: true, items });
  })
);

router.post(
  "/classes",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    await assertMarksSchool(req);
    const item = await ClassRoom.create({ ...req.body, school: req.user.school });
    res.status(201).json({ success: true, item });
  })
);

router.patch(
  "/classes/:id",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const classroom = await ClassRoom.findOne({ _id: req.params.id, school: req.user.school, isActive: true });
    if (!classroom) throw new ApiError(404, "Class not found");
    if (req.body.name !== undefined) classroom.name = String(req.body.name).trim();
    if (req.body.academicYear !== undefined) classroom.academicYear = String(req.body.academicYear).trim();
    if (req.body.classTeacher !== undefined) classroom.classTeacher = req.body.classTeacher || undefined;
    if (Array.isArray(req.body.subjectIds)) {
      const keep = req.body.subjectIds.map(String);
      classroom.subjects = classroom.subjects.filter((row) => keep.includes(String(row.subject)));
      keep.forEach((id) => {
        if (!classroom.subjects.some((row) => String(row.subject) === id)) classroom.subjects.push({ subject: id });
      });
    }
    await classroom.save();
    const item = await ClassRoom.findById(classroom._id)
      .populate("classTeacher", "fullName roleTitle")
      .populate("subjects.subject", "name code")
      .populate("subjects.teacher", "fullName");
    res.json({ success: true, item });
  })
);

router.delete(
  "/classes/:id",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const classroom = await ClassRoom.findOne({ _id: req.params.id, school: req.user.school, isActive: true });
    if (!classroom) throw new ApiError(404, "Class not found");
    classroom.isActive = false;
    classroom.name = `${classroom.name} (removed ${classroom._id.toString().slice(-6)})`;
    await classroom.save();
    await Staff.updateMany({ school: classroom.school, classes: classroom._id }, { $pull: { classes: classroom._id } });
    res.json({ success: true });
  })
);

router.post(
  "/classes/:id/assign",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const classroom = await ClassRoom.findOne({ _id: req.params.id, school: req.user.school });
    if (!classroom) throw new ApiError(404, "Class not found");
    const { subjectId, teacherId } = req.body;
    const existing = classroom.subjects.find((s) => s.subject.toString() === subjectId);
    if (existing) {
      if (teacherId) existing.teacher = teacherId;
      else if (teacherId === null || teacherId === "") existing.teacher = undefined;
    } else classroom.subjects.push(teacherId ? { subject: subjectId, teacher: teacherId } : { subject: subjectId });
    await classroom.save();
    res.json({ success: true, item: classroom });
  })
);

module.exports = router;
