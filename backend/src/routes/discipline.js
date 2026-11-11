const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { DisciplineCase, DisciplineTerm, DisciplineScore, Student, School } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const smsWallet = require("../services/smsWallet");
const { schoolBrief, termAliases, yearsIn, kigaliYear } = require("../utils/schoolBrief");

const router = express.Router();
router.use(authRequired, requireSchoolScope, requireRoles("discipline", "school_admin"));

function bandOf(score, term) {
  if (!term) return "at_risk";
  if (score >= term.normalFrom) return "normal";
  if (score >= term.mediumFrom) return "medium";
  if (score >= term.abnormalFrom) return "abnormal";
  return "at_risk";
}

function disciplineParentMessage({ school, student, title, marksLost, scoreAfter, maxMarks }) {
  return `Mwiriwe neza Bubyeyi dufatanije kurera, turabamenyesha ko umwana wanyu ${student}, wiga mu ishuri rya ${school}, yagaragaje imyitwarire itari myiza: ${title}. Akaba akuwemo amanota ${marksLost} y'imyitwarire nk'igihano kigenwa n'urwego rushinzwe imyitwarire mukigo cy'ishuri, asigaranye ${scoreAfter} / ${maxMarks}. Turabasaba gufatanya n'ishuri kumufasha kunoza imyitwarire. Murakoze. Best regards, IshuriApp.`;
}

function assertRanges(maxMarks, normalFrom, mediumFrom, abnormalFrom) {
  const values = [maxMarks, normalFrom, mediumFrom, abnormalFrom].map(Number);
  if (values.some((n) => Number.isNaN(n))) throw new ApiError(400, "Marks ranges must be numbers");
  if (!(maxMarks > normalFrom && normalFrom > mediumFrom && mediumFrom > abnormalFrom)) {
    throw new ApiError(400, "Set ranges from highest to lowest: maximum, normal, medium, then abnormal");
  }
}

router.get(
  "/term",
  asyncHandler(async (req, res) => {
    const term = await DisciplineTerm.findOne({ school: req.user.school }).sort({ updatedAt: -1 });
    const scores = term
      ? await DisciplineScore.find({
          school: req.user.school,
          academicYear: term.academicYear,
          term: term.term,
        }).populate({ path: "student", match: { isActive: { $ne: false } }, select: "fullName studentCode classRoom", populate: { path: "classRoom", select: "name" } })
      : [];
    res.json({
      success: true,
      term,
      scores: scores.filter((row) => row.student).map((row) => ({
        ...row.toObject(),
        band: bandOf(row.score, term),
      })),
    });
  })
);

router.post(
  "/term",
  asyncHandler(async (req, res) => {
    const academicYear = String(req.body.academicYear || new Date().getFullYear());
    const termName = String(req.body.term || "Term 1");
    const maxMarks = Number(req.body.maxMarks ?? 40);
    const normalFrom = Number(req.body.normalFrom ?? 30);
    const mediumFrom = Number(req.body.mediumFrom ?? 20);
    const abnormalFrom = Number(req.body.abnormalFrom ?? 10);
    assertRanges(maxMarks, normalFrom, mediumFrom, abnormalFrom);

    const term = await DisciplineTerm.findOneAndUpdate(
      { school: req.user.school, academicYear, term: termName },
      { maxMarks, normalFrom, mediumFrom, abnormalFrom },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const students = await Student.find({ school: req.user.school, isActive: true });
    for (const student of students) {
      await DisciplineScore.updateOne(
        { school: req.user.school, student: student._id, academicYear, term: termName },
        { $setOnInsert: { score: maxMarks } },
        { upsert: true }
      );
    }

    res.status(201).json({
      success: true,
      term,
      initialized: students.length,
      message: `Term marks set to ${maxMarks} for ${students.length} students`,
    });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { school: req.user.school };
    if (req.query.student) filter.student = req.query.student;
    if (req.query.status) filter.status = req.query.status;
    const items = (await DisciplineCase.find(filter)
      .populate({ path: "student", match: { isActive: { $ne: false } }, select: "fullName studentCode classRoom", populate: { path: "classRoom", select: "name" } })
      .populate("reportedBy", "fullName")
      .sort({ occurredAt: -1 }))
      .filter((item) => item.student);
    let scores = [];
    if (req.query.student) {
      const rows = await DisciplineScore.find({ school: req.user.school, student: req.query.student }).sort({
        academicYear: -1,
        term: -1,
      });
      const terms = await DisciplineTerm.find({ school: req.user.school });
      scores = rows.map((row) => {
        const term = terms.find((entry) => entry.academicYear === row.academicYear && entry.term === row.term);
        return {
          ...row.toObject(),
          maxMarks: term?.maxMarks,
          band: bandOf(row.score, term),
        };
      });
    }
    res.json({ success: true, items, scores });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({ _id: req.body.student, school: req.user.school });
    if (!student) throw new ApiError(404, "Student not found");
    const marksLost = Number(req.body.marksLost);
    if (!Number.isFinite(marksLost) || marksLost <= 0) {
      throw new ApiError(400, "Enter how many marks to subtract");
    }
    const title = String(req.body.title || "").trim() || "Indiscipline";

    const term = await DisciplineTerm.findOne({ school: req.user.school }).sort({ updatedAt: -1 });
    if (!term) throw new ApiError(400, "Initialize the term discipline marks first");
    let score = await DisciplineScore.findOne({
      school: req.user.school,
      student: student._id,
      academicYear: term.academicYear,
      term: term.term,
    });
    if (!score) {
      score = await DisciplineScore.create({
        school: req.user.school,
        student: student._id,
        academicYear: term.academicYear,
        term: term.term,
        score: term.maxMarks,
      });
    }
    score.score = Number(score.score) - marksLost;
    await score.save();
    const scoreAfter = score.score;

    const item = await DisciplineCase.create({
      school: req.user.school,
      student: student._id,
      reportedBy: req.user._id,
      category: req.body.category || "misconduct",
      severity: req.body.severity || "medium",
      title,
      description: req.body.description,
      actionTaken: req.body.actionTaken,
      marksLost,
      scoreAfter,
    });

    const school = await School.findById(req.user.school);
    const guardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
    let notified = false;
    let notifyError = "";
    if (!guardian?.phone) {
      notifyError = "No parent phone on this student";
      console.log(`SMS NOT SENT: ${notifyError}`);
    } else {
      try {
        const message = disciplineParentMessage({
          school: school.name,
          student: student.fullName,
          title,
          marksLost,
          scoreAfter,
          maxMarks: term.maxMarks,
        });
        const sent = await smsWallet.sendFromSchool({
          school,
          phones: [guardian.phone],
          message,
          createdBy: req.user._id,
          category: "discipline",
        });
        item.parentNotifiedAt = new Date();
        await item.save();
        notified = true;
        console.log(`SMS SENT: id=${sent.result.message_id} recipients=${sent.delivered}`);
      } catch (err) {
        notifyError = err.message || "Parent could not be notified";
        console.log(`SMS NOT SENT: ${notifyError}`);
      }
    }

    res.status(201).json({
      success: true,
      item,
      scoreAfter,
      band: bandOf(scoreAfter, term),
      notified,
      parentPhone: guardian?.phone || "",
      message: notified
        ? `Marks subtracted and parent notified. ${student.fullName} is now on ${scoreAfter}.`
        : `Marks subtracted. ${student.fullName} is now on ${scoreAfter}. Parent was not notified: ${notifyError}.`,
    });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await DisciplineCase.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      req.body,
      { new: true }
    );
    res.json({ success: true, item });
  })
);

router.post(
  "/:id/notify-parent",
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    const item = await DisciplineCase.findOne({ _id: req.params.id, school: school._id }).populate("student");
    if (!item) throw new ApiError(404, "Case not found");
    const guardian = item.student.guardians.find((g) => g.isPrimary) || item.student.guardians[0];
    if (!guardian?.phone) throw new ApiError(400, "No parent phone on this student");
    const term = await DisciplineTerm.findOne({ school: school._id }).sort({ updatedAt: -1 });
    const message = disciplineParentMessage({
      school: school.name,
      student: item.student.fullName,
      title: item.title,
      marksLost: item.marksLost || 0,
      scoreAfter: item.scoreAfter,
      maxMarks: term?.maxMarks || 40,
    });
    const sent = await smsWallet.sendFromSchool({
      school,
      phones: [guardian.phone],
      message,
      createdBy: req.user._id,
      category: "discipline",
    });
    item.parentNotifiedAt = new Date();
    await item.save();
    res.json({ success: true, item, result: sent.result, smsBalance: school.smsBalance, message: "Parent notified" });
  })
);

router.get(
  "/report",
  asyncHandler(async (req, res) => {
    const academicYear = String(req.query.academicYear || "").trim();
    const termName = String(req.query.term || "").trim();
    if (!academicYear || !termName) throw new ApiError(400, "Choose the academic year and the term.");
    const school = await School.findById(req.user.school);
    if (!school) throw new ApiError(404, "School not found");
    const aliases = termAliases(termName);
    const years = yearsIn(academicYear);
    const studentId = String(req.query.student || "").trim();
    let classRoomId = String(req.query.classRoom || "").trim();

    if (studentId) {
      const student = await Student.findOne({ _id: studentId, school: school._id, isActive: true });
      if (!student) throw new ApiError(404, "Student not found");
      classRoomId = String(student.classRoom || classRoomId || "");
    }

    const studentFilter = { school: school._id, isActive: true };
    if (classRoomId) studentFilter.classRoom = classRoomId;
    if (studentId) studentFilter._id = studentId;
    const students = await Student.find(studentFilter).populate("classRoom", "name").sort({ fullName: 1 });
    const studentIds = students.map((student) => student._id);

    const terms = await DisciplineTerm.find({ school: school._id, academicYear });
    const term = terms.find((item) => aliases.includes(String(item.term || "").trim().toLowerCase())) || null;
    const scores = await DisciplineScore.find({
      school: school._id,
      student: { $in: studentIds },
      academicYear,
    });
    const scoreFor = (id) => scores.find((row) => String(row.student) === String(id) && aliases.includes(String(row.term || "").trim().toLowerCase()));

    const cases = await DisciplineCase.find({ school: school._id, student: { $in: studentIds } })
      .populate("reportedBy", "fullName")
      .sort({ occurredAt: 1, createdAt: 1 });
    const inYear = (item) => {
      const year = kigaliYear(item.occurredAt || item.createdAt);
      return !years.length || years.includes(year);
    };

    const startingDefault = term?.maxMarks ?? 40;
    const items = students.map((student) => {
      const score = scoreFor(student._id);
      const incidents = cases
        .filter((item) => String(item.student) === String(student._id) && inYear(item))
        .map((item) => ({
          id: item._id,
          date: item.occurredAt || item.createdAt,
          title: item.title,
          description: item.description || "",
          actionTaken: item.actionTaken || "",
          marksLost: Number(item.marksLost || 0),
          scoreAfter: item.scoreAfter == null ? null : Number(item.scoreAfter),
          staff: item.reportedBy?.fullName || "",
          notified: Boolean(item.parentNotifiedAt),
        }));
      const starting = startingDefault;
      const remaining = score ? Number(score.score) : starting - incidents.reduce((sum, item) => sum + item.marksLost, 0);
      const deducted = starting - remaining;
      return {
        student: { _id: student._id, fullName: student.fullName, studentCode: student.studentCode },
        className: student.classRoom?.name || "",
        starting,
        deducted,
        remaining,
        band: bandOf(remaining, term),
        incidents,
        remarks: incidents.map((item) => item.actionTaken).filter(Boolean).join(" "),
      };
    });

    const focus = studentId ? items : items.filter((item) => item.incidents.length || scoreFor(item.student._id));
    res.json({
      success: true,
      kind: "discipline",
      school: schoolBrief(school),
      academicYear,
      term: term?.term || termName,
      maxMarks: startingDefault,
      items: focus,
    });
  })
);

module.exports = router;
