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

function creditsOf(value) {
  const credits = Number(value);
  if (!Number.isInteger(credits) || credits < 1 || credits > 40) {
    throw new ApiError(400, "Enter the credits for this subject. 1 credit equals 10 marks.");
  }
  return credits;
}

async function assertTeacherSubject(req, subjectId) {
  if (req.user.role !== "teacher") return;
  const staff = await Staff.findOne({ school: req.user.school, user: req.user._id, isActive: { $ne: false } });
  const assigned = staff && await ClassRoom.exists({
    school: req.user.school,
    isActive: true,
    subjects: { $elemMatch: { subject: subjectId, teacher: staff._id } },
  });
  if (!assigned) throw new ApiError(403, "Only the teacher assigned to this subject in this class can change these marks.");
}

router.post(
  "/subjects",
  requireRoles("school_admin"),
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) throw new ApiError(400, "Type the subject name, then add it to this class.");
    const item = await Subject.create({
      name,
      code: req.body.code,
      level: req.body.level,
      description: req.body.description,
      credits: creditsOf(req.body.credits),
      school: req.user.school,
    });
    res.status(201).json({ success: true, item });
  })
);

router.patch(
  "/subjects/:id",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const item = await Subject.findOne({ _id: req.params.id, school: req.user.school, isActive: { $ne: false } });
    if (!item) throw new ApiError(404, "Subject not found");
    await assertTeacherSubject(req, item._id);
    if (req.body.credits !== undefined) item.credits = creditsOf(req.body.credits);
    if (req.user.role === "school_admin" && req.body.name) item.name = String(req.body.name).trim();
    await item.save();
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
      .populate("subjects.subject", "name code credits")
      .populate("subjects.teacher", "fullName");
    if (req.user.role !== "teacher") return res.json({ success: true, items });
    const staff = await Staff.findOne({ school: req.user.school, user: req.user._id, isActive: { $ne: false } });
    const staffId = String(staff?._id || "");
    const visible = items.map((room) => {
      const plain = room.toObject();
      plain.subjects = (plain.subjects || []).filter((row) => String(row.teacher?._id || row.teacher || "") === staffId);
      return plain;
    }).filter((room) => room.subjects.length || String(room.classTeacher?._id || room.classTeacher || "") === staffId);
    res.json({ success: true, items: visible });
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
      .populate("subjects.subject", "name code credits")
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
    const subjectKey = String(subjectId || "");
    const matches = classroom.subjects.filter((row) => String(row.subject?._id || row.subject) === subjectKey);
    const existing = matches[0];
    const previousIds = [...new Set(matches.map((row) => (row.teacher ? String(row.teacher) : "")).filter(Boolean))];
    classroom.subjects = classroom.subjects.filter((row) => String(row.subject?._id || row.subject) !== subjectKey);
    if (teacherId) classroom.subjects.push({ subject: subjectId, teacher: teacherId });
    else if (existing) classroom.subjects.push({ subject: subjectId });
    classroom.markModified("subjects");
    await classroom.save();
    async function syncStaff(staffId) {
      if (!staffId) return;
      const rooms = await ClassRoom.find({
        school: classroom.school,
        isActive: true,
        $or: [{ classTeacher: staffId }, { "subjects.teacher": staffId }],
      });
      const subjects = new Set();
      const classIds = new Set();
      rooms.forEach((room) => {
        if (String(room.classTeacher || "") === String(staffId)) classIds.add(String(room._id));
        (room.subjects || []).forEach((row) => {
          if (String(row.teacher || "") !== String(staffId)) return;
          subjects.add(String(row.subject));
          classIds.add(String(room._id));
        });
      });
      await Staff.updateOne({ _id: staffId, school: classroom.school }, { subjects: [...subjects], classes: [...classIds] });
    }
    if (teacherId) await syncStaff(teacherId);
    for (const previousId of previousIds) {
      if (previousId !== String(teacherId || "")) await syncStaff(previousId);
    }
    res.json({ success: true, item: classroom });
  })
);

module.exports = router;
