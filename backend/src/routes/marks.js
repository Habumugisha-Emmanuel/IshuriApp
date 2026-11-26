const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { Assessment, Mark, Student, School, Staff, Subject, ClassRoom, MonthlyNotice } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const smsWallet = require("../services/smsWallet");
const { schoolBrief, termAliases } = require("../utils/schoolBrief");
const { fitSms } = require("../utils/phone");

const router = express.Router();
router.use(authRequired, requireSchoolScope);

function marksParentMessage({ school, student, score, total, subject, assessment, comment }) {
  const note = String(comment || "").trim();
  const core = `${school}: ${student} ${score}/${total} ${subject}.`;
  return fitSms(note ? `${core} ${note}` : `${core} ${assessment}.`);
}

router.get(
  "/classes/:classRoom/history",
  requireRoles("school_admin", "teacher", "dos"),
  asyncHandler(async (req, res) => {
    const classroom = await ClassRoom.findOne({ _id: req.params.classRoom, school: req.user.school });
    if (!classroom) throw new ApiError(404, "Class not found");
    if (req.user.role === "teacher") {
      const staff = await Staff.findOne({ school: req.user.school, user: req.user._id, isActive: { $ne: false } });
      const mine = new Set((classroom.subjects || []).filter((row) => String(row.teacher || "") === String(staff?._id || "")).map((row) => String(row.subject)));
      if (!mine.size) throw new ApiError(403, "Only the teacher assigned to this subject in this class can change these marks.");
      const marks = await Mark.find({
        school: req.user.school,
        student: { $in: (await Student.find({ school: req.user.school, classRoom: classroom._id, isActive: true }).select("_id")).map((student) => student._id) },
      }).populate({
        path: "assessment",
        select: "title subject classRoom maxScore term academicYear date",
        populate: { path: "subject", select: "name credits" },
      });
      const students = await Student.find({ school: req.user.school, classRoom: classroom._id, isActive: true }).sort({ fullName: 1 });
      const items = students.map((student) => ({
        student: { _id: student._id, fullName: student.fullName, studentCode: student.studentCode },
        marks: marks.filter((mark) => String(mark.student) === String(student._id) && mark.assessment && mine.has(String(mark.assessment.subject?._id || mark.assessment.subject))),
      }));
      return res.json({ success: true, items });
    }
    const students = await Student.find({
      school: req.user.school,
      classRoom: classroom._id,
      isActive: true,
    }).sort({ fullName: 1 });
    const marks = await Mark.find({
      school: req.user.school,
      student: { $in: students.map((student) => student._id) },
    })
      .populate({
        path: "assessment",
        select: "title subject classRoom maxScore term academicYear date",
        populate: { path: "subject", select: "name credits" },
      })
      .sort({ createdAt: -1 });
    const items = students.map((student) => ({
      student: { _id: student._id, fullName: student.fullName, studentCode: student.studentCode },
      marks: marks.filter((mark) => String(mark.student) === String(student._id) && mark.assessment),
    }));
    res.json({ success: true, items });
  })
);

router.get(
  "/assessments",
  requireRoles("school_admin", "teacher", "dos"),
  asyncHandler(async (req, res) => {
    const filter = { school: req.user.school };
    if (req.query.classRoom) filter.classRoom = req.query.classRoom;
    if (req.query.subject) filter.subject = req.query.subject;
    const pairs = await teacherSubjectFilter(req);
    if (pairs) {
      if (!pairs.length) return res.json({ success: true, items: [] });
      filter.$or = pairs;
    }
    const items = await Assessment.find(filter)
      .populate("subject", "name credits")
      .populate("classRoom", "name")
      .populate("teacher", "fullName")
      .sort({ date: -1 });
    res.json({ success: true, items });
  })
);

async function assertCanChangeMarks(req, classroom, subjectId) {
  if (req.user.role !== "teacher") return;
  const staff = await Staff.findOne({ school: req.user.school, user: req.user._id, isActive: { $ne: false } });
  const owns = (classroom?.subjects || []).some((item) => String(item.subject?._id || item.subject) === String(subjectId) && String(item.teacher || "") === String(staff?._id || ""));
  if (!staff || !owns) {
    throw new ApiError(403, "Only the teacher assigned to this subject in this class can change these marks.");
  }
}

async function teacherSubjectFilter(req) {
  if (req.user.role !== "teacher") return null;
  const staff = await Staff.findOne({ school: req.user.school, user: req.user._id, isActive: { $ne: false } });
  if (!staff) return [];
  const rooms = await ClassRoom.find({ school: req.user.school, isActive: true, "subjects.teacher": staff._id });
  const pairs = [];
  rooms.forEach((room) => {
    (room.subjects || []).forEach((row) => {
      if (String(row.teacher || "") === String(staff._id)) pairs.push({ classRoom: room._id, subject: row.subject });
    });
  });
  return pairs;
}

async function subjectOnClass(schoolId, classroom, subjectId) {
  if (!classroom.subjects?.length) throw new ApiError(400, "Add the subjects to this class before creating an assessment");
  const subject = await Subject.findOne({ _id: subjectId, school: schoolId, isActive: { $ne: false } });
  if (!subject) throw new ApiError(400, "Choose a subject that belongs to this class");
  const onClass = classroom.subjects.some((row) => String(row.subject?._id || row.subject) === String(subject._id));
  if (!onClass) throw new ApiError(400, `${subject.name} is not a subject of ${classroom.name}`);
  return subject;
}

async function loadOwnedAssessment(req, id) {
  const assessment = await Assessment.findOne({ _id: id, school: req.user.school });
  if (!assessment) throw new ApiError(404, "Assessment not found");
  const classroom = await ClassRoom.findOne({ _id: assessment.classRoom, school: req.user.school, isActive: true });
  await assertCanChangeMarks(req, classroom, assessment.subject);
  return assessment;
}

function readRanges(value, { commentOptional = false } = {}) {
  if (!Array.isArray(value)) return [];
  if (value.length > 20) throw new ApiError(400, "Save up to 20 ranges.");
  return value.map((row) => {
    const from = Number(row.from);
    const to = Number(row.to);
    const comment = String(row.comment || "").trim();
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new ApiError(400, "Marks ranges must be numbers");
    if (from < 0 || to < 0) throw new ApiError(400, "A mark cannot be negative or above the total.");
    if (from > to) throw new ApiError(400, "The lower mark cannot be above the higher mark.");
    if (!comment && !commentOptional) throw new ApiError(400, "Enter a comment for each range.");
    return { from, to, comment };
  });
}

function commentForScore(score, ranges) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "";
  const match = (ranges || []).find((row) => value >= Number(row.from) && value <= Number(row.to));
  return match ? String(match.comment || "") : "";
}

router.patch(
  "/assessments/:id",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const assessment = await loadOwnedAssessment(req, req.params.id);
    const title = String(req.body.title || "").trim();
    const maxScore = Number(req.body.maxScore);
    if (!title) throw new ApiError(400, "Enter the assessment title");
    if (!Number.isFinite(maxScore) || maxScore <= 0) throw new ApiError(400, "Set the mark the assessment is over, for example 100");
    if (req.body.classRoom) {
      const classroom = await ClassRoom.findOne({ _id: req.body.classRoom, school: req.user.school, isActive: true });
      if (!classroom) throw new ApiError(400, "Choose a class in this school");
      assessment.classRoom = classroom._id;
    }
    const classroom = await ClassRoom.findOne({ _id: assessment.classRoom, school: req.user.school, isActive: true });
    if (!classroom) throw new ApiError(400, "Choose a class in this school");
    const subject = await subjectOnClass(req.user.school, classroom, req.body.subject || assessment.subject);
    await assertCanChangeMarks(req, classroom, subject._id);
    assessment.subject = subject._id;
    if (req.body.date) {
      const date = new Date(req.body.date);
      if (Number.isNaN(date.getTime())) throw new ApiError(400, "Set the assessment date as year-month-day, for example 2026-10-16");
      assessment.date = date;
    }
    assessment.title = title;
    assessment.maxScore = maxScore;
    if (req.body.term !== undefined) assessment.term = storedTerm(req.body.term);
    if (req.body.type === "exam" || req.body.type === "test") assessment.type = req.body.type;
    if (Array.isArray(req.body.ranges)) {
      const ranges = readRanges(req.body.ranges, { commentOptional: assessment.type === "exam" });
      if (ranges.some((row) => row.from > assessment.maxScore || row.to > assessment.maxScore)) {
        throw new ApiError(400, "A mark cannot be negative or above the total.");
      }
      assessment.ranges = ranges;
    }
    await assessment.save();
    res.json({ success: true, assessment, message: "Assessment updated" });
  })
);

router.delete(
  "/assessments/:id",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const assessment = await loadOwnedAssessment(req, req.params.id);
    await Mark.deleteMany({ assessment: assessment._id, school: req.user.school });
    await assessment.deleteOne();
    res.json({ success: true, message: "Assessment deleted" });
  })
);

function kigaliDay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function stampQuery(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function withinDates(value, from, to) {
  if (!from && !to) return true;
  const day = kigaliDay(value);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function matchesYear(item, year) {
  if (!/^\d{4}$/.test(String(year || ""))) return true;
  const recorded = String(item.academicYear || kigaliDay(item.date).slice(0, 4));
  return recorded === String(year);
}

function storedTerm(value) {
  const term = String(value || "1").trim().toLowerCase();
  if (term === "2" || term === "term 2") return "2";
  if (term === "3" || term === "term 3") return "3";
  if (term === "annual" || term === "year") return "annual";
  return "1";
}

function readAssessmentItem(body) {
  const title = String(body.title || "").trim();
  const maxScore = Number(body.maxScore);
  if (!title) throw new ApiError(400, "Enter the assessment title");
  if (!Number.isFinite(maxScore) || maxScore <= 0) throw new ApiError(400, "Set the mark the assessment is over, for example 100");
  const date = new Date(body.date);
  if (!body.date || Number.isNaN(date.getTime())) throw new ApiError(400, "Set the assessment date as year-month-day, for example 2026-10-16");
  const type = body.type === "exam" ? "exam" : "test";
  return { title, maxScore, date, type };
}

router.post(
  "/assessments/batch",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    if (!school.hasMarksSystem()) throw new ApiError(400, "Universities do not record class marks");
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) throw new ApiError(400, "Add at least one assessment for this subject first.");
    if (items.length > 40) throw new ApiError(400, "Save up to 40 assessments at a time. You can add more after these are saved.");
    const prepared = items.map(readAssessmentItem);
    const classroom = await ClassRoom.findOne({ _id: req.body.classRoom, school: school._id, isActive: true });
    if (!classroom) throw new ApiError(400, "Choose a class in this school");
    const subject = await subjectOnClass(school._id, classroom, req.body.subject);
    await assertCanChangeMarks(req, classroom, subject._id);
    const staff = await Staff.findOne({ school: school._id, user: req.user._id });
    if (!staff && !req.body.teacher) throw new ApiError(400, "This account has no staff profile for assessments");
    const teacher = req.body.teacher || staff?._id;
    const created = [];
    for (const item of prepared) {
      created.push(await Assessment.create({
        ...item,
        school: school._id,
        classRoom: classroom._id,
        subject: subject._id,
        teacher,
        term: storedTerm(req.body.term),
        academicYear: String(req.body.academicYear || new Date().getFullYear()),
        type: item.type === "exam" ? "exam" : "test",
      }));
    }
    res.status(201).json({ success: true, items: created });
  })
);

router.post(
  "/assessments",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    if (!school.hasMarksSystem()) throw new ApiError(400, "Universities do not record class marks");
    const classroom = await ClassRoom.findOne({ _id: req.body.classRoom, school: school._id, isActive: true });
    if (!classroom) throw new ApiError(400, "Choose a class in this school");
    const subject = await subjectOnClass(school._id, classroom, req.body.subject);
    await assertCanChangeMarks(req, classroom, subject._id);
    const staff = await Staff.findOne({ school: school._id, user: req.user._id });
    if (!staff && !req.body.teacher) throw new ApiError(400, "This account has no staff profile for assessments");
    const assessment = await Assessment.create({
      ...req.body,
      school: school._id,
      classRoom: classroom._id,
      subject: subject._id,
      teacher: req.body.teacher || staff?._id,
    });
    res.status(201).json({ success: true, assessment });
  })
);

router.post(
  "/assessments/:id/marks",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const assessment = await Assessment.findOne({ _id: req.params.id, school: req.user.school });
    if (!assessment) throw new ApiError(404, "Assessment not found");
    const ownedRoom = await ClassRoom.findOne({ _id: assessment.classRoom, school: req.user.school, isActive: true });
    await assertCanChangeMarks(req, ownedRoom, assessment.subject);
    const entries = req.body.marks || [];
    const maxScore = Number(assessment.maxScore);
    const saved = [];
    for (const entry of entries) {
      const attended = !(entry.attended === false || entry.attended === "no" || entry.attended === "false");
      const absenceReason = attended ? "" : String(entry.absenceReason || "").trim().slice(0, 160);
      if (!attended && !absenceReason) throw new ApiError(400, "Enter the reason this student did not attend.");
      const score = attended ? Number(entry.score) : 0;
      if (!Number.isFinite(score) || score < 0 || score > maxScore) {
        throw new ApiError(400, "A mark cannot be negative or above the total.");
      }
      const mark = await Mark.findOneAndUpdate(
        { assessment: assessment._id, student: entry.studentId },
        {
          school: req.user.school,
          assessment: assessment._id,
          student: entry.studentId,
          score,
          comment: attended ? (String(entry.comment || "").trim() || commentForScore(entry.score, assessment.ranges)) : "",
          attended,
          absenceReason,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(mark);
    }
    res.json({ success: true, items: saved });
  })
);

router.get(
  "/assessments/:id/marks",
  requireRoles("school_admin", "teacher", "dos"),
  asyncHandler(async (req, res) => {
    const assessment = await Assessment.findOne({ _id: req.params.id, school: req.user.school });
    if (!assessment) throw new ApiError(404, "Assessment not found");
    const classroom = await ClassRoom.findOne({ _id: assessment.classRoom, school: req.user.school });
    await assertCanChangeMarks(req, classroom, assessment.subject);
    const items = await Mark.find({ assessment: req.params.id, school: req.user.school }).populate(
      "student",
      "fullName studentCode guardians"
    );
    res.json({ success: true, items });
  })
);

router.post(
  "/assessments/:id/notify-parents",
  requireRoles("dos"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    const assessment = await Assessment.findOne({ _id: req.params.id, school: school._id })
      .populate("subject", "name")
      .populate("classRoom", "name");
    if (!assessment) throw new ApiError(404, "Assessment not found");
    const marks = await Mark.find({ assessment: assessment._id }).populate("student");
    if (!marks.length) throw new ApiError(400, "Record marks before notifying parents");

    const results = [];
    for (const mark of marks) {
      if (!mark.student || mark.student.isActive === false) continue;
      const guardian =
        (mark.student.guardians || []).find((g) => g.isPrimary) || mark.student.guardians?.[0];
      if (!guardian?.phone) {
        results.push({ student: mark.student.fullName, skipped: true, reason: "No parent phone" });
        continue;
      }
      const message = marksParentMessage({
        school: school.name,
        student: mark.student.fullName,
        score: mark.score,
        total: assessment.maxScore,
        subject: assessment.subject?.name || "Subject",
        assessment: assessment.title,
        comment: mark.comment,
      });
      try {
        const sent = await smsWallet.sendFromSchool({
          school,
          phones: [guardian.phone],
          message,
          createdBy: req.user._id,
          category: "marks",
        });
        mark.notifiedAt = new Date();
        await mark.save();
        results.push({ student: mark.student.fullName, phone: guardian.phone, ...sent.result });
      } catch (err) {
        console.log(`SMS NOT SENT: ${mark.student.fullName} ${err.message}`);
        results.push({ student: mark.student.fullName, skipped: true, reason: err.message });
      }
    }
    assessment.parentsNotifiedAt = new Date();
    await assessment.save();
    const sentCount = results.filter((row) => !row.skipped).length;
    const missed = results.filter((row) => row.skipped);
    res.json({
      success: true,
      results,
      smsBalance: school.smsBalance,
      message: missed.length
        ? `Sent ${sentCount}. Not sent: ${missed.map((row) => `${row.student} (${row.reason})`).join("; ")}`
        : `Sent to ${sentCount} parent${sentCount === 1 ? "" : "s"}.`,
    });
  })
);

router.post(
  "/periodic-notify",
  requireRoles("dos"),
  asyncHandler(async (req, res) => {
    const { classRoom, term, academicYear } = req.body;
    const school = await School.findById(req.user.school);
    const assessments = await Assessment.find({
      school: school._id,
      classRoom,
      term,
      academicYear,
    }).populate("subject", "name");
    const students = await Student.find({ school: school._id, classRoom, isActive: true });
    const results = [];
    for (const student of students) {
      const guardian = student.guardians.find((g) => g.isPrimary) || student.guardians[0];
      if (!guardian?.phone) continue;
      const scores = [];
      for (const assessment of assessments) {
        const mark = await Mark.findOne({ assessment: assessment._id, student: student._id });
        if (mark) scores.push(`${assessment.subject.name}: ${mark.score}/${assessment.maxScore}`);
      }
      if (!scores.length) continue;
      const message = fitSms(`${school.name}: ${student.fullName} Term ${term} ${scores.join(", ")}.`);
      const sent = await smsWallet.sendFromSchool({
        school,
        phones: [guardian.phone],
        message,
        createdBy: req.user._id,
        category: "results",
      });
      results.push({ student: student.fullName, ...sent.result });
    }
    res.json({ success: true, results, smsBalance: school.smsBalance });
  })
);

function monthBounds(yearValue, monthValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, "Enter the year.");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new ApiError(400, "Choose the month.");
  return { year, month, start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

function oneDecimal(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function gsmText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,:/'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectAcronym(subject) {
  const stored = String(subject?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (stored) return stored.slice(0, 6);
  const plain = gsmText(subject?.name || "Sub").replace(/[^A-Za-z0-9]/g, "");
  return (plain.slice(0, 3) || "SUB").toUpperCase();
}

function monthlyParentMessage({ name, className, school, average, position, classSize }) {
  const student = gsmText(name) || "Student";
  const room = gsmText(className) || "Class";
  const place = gsmText(school) || "School";
  const avg = String(Math.round(Number(average) || 0));
  return fitSms(`${place}: ${student} (${room}) ${position}/${classSize}, ${avg}/100.`);
}

function classMarkSheet(room, tests, people, markMap, notifiedAt) {
  const bySubject = new Map();
  tests.forEach((test) => {
    const subjectId = String(test.subject?._id || "subject");
    const current = bySubject.get(subjectId) || { subject: test.subject, teacher: test.teacher?.fullName || "", tests: [] };
    if (!current.teacher && test.teacher?.fullName) current.teacher = test.teacher.fullName;
    current.tests.push(test);
    bySubject.set(subjectId, current);
  });
  const subjects = [...bySubject.values()].map((group) => {
    const credits = Number(group.subject?.credits);
    const standard = Number.isInteger(credits) && credits >= 1 && credits <= 40 ? credits * 10 : 0;
    const sumMax = group.tests.reduce((sum, test) => sum + Number(test.maxScore || 0), 0);
    const rows = people.map((student) => {
      const cells = group.tests.map((test) => {
        const found = markMap.get(`${test._id}:${student._id}`);
        const entered = Boolean(found);
        const max = Number(test.maxScore || 0);
        const raw = entered ? Number(found.score || 0) : 0;
        const share = sumMax > 0 ? (max / sumMax) * standard : 0;
        const onTotal = max > 0 && standard ? oneDecimal((raw / max) * share) : 0;
        return { raw, entered, onTotal };
      });
      const final = standard ? oneDecimal(cells.reduce((sum, cell) => sum + cell.onTotal, 0)) : null;
      return { id: student._id, name: student.fullName, cells, final };
    });
    return {
      subject: { _id: group.subject?._id, name: group.subject?.name || "Subject", code: subjectAcronym(group.subject), credits: group.subject?.credits || 0 },
      teacher: group.teacher,
      standard,
      tests: group.tests.map((test) => ({ _id: test._id, title: test.title, maxScore: test.maxScore, date: test.date, term: test.term, type: test.type })),
      rows,
    };
  });
  const ranking = people.map((student) => {
    const percents = [];
    tests.forEach((test) => {
      const max = Number(test.maxScore || 0);
      if (max <= 0) return;
      const found = markMap.get(`${test._id}:${student._id}`);
      const raw = found ? Number(found.score || 0) : 0;
      percents.push((raw / max) * 100);
    });
    const average = percents.length ? oneDecimal(percents.reduce((sum, value) => sum + value, 0) / percents.length) : 0;
    const subjectMarks = subjects.filter((group) => group.standard).map((group) => {
      const row = group.rows.find((item) => String(item.id) === String(student._id));
      return { id: group.subject._id, code: group.subject.code, final: row?.final || 0, standard: group.standard };
    });
    return { id: student._id, name: student.fullName, average, marks: subjectMarks };
  });
  const byAverage = ranking.slice().sort((a, b) => b.average - a.average || a.name.localeCompare(b.name));
  let previousAverage = null;
  let place = 0;
  byAverage.forEach((row, index) => {
    if (previousAverage == null || row.average !== previousAverage) {
      place = index + 1;
      previousAverage = row.average;
    }
    row.position = place;
  });
  ranking.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return {
    classRoom: { _id: room._id, name: room.name },
    notifiedAt: notifiedAt || null,
    subjects,
    ranking,
  };
}

async function combinedSheets(schoolId, scope, term, range = {}) {
  const chosen = storedTerm(term);
  const query = { school: schoolId, type: { $ne: "exam" } };
  if (chosen !== "annual") query.term = chosen;
  const assessments = await Assessment.find(query)
    .populate("subject", "name code credits")
    .populate("classRoom", "name")
    .populate("teacher", "fullName")
    .sort({ date: 1, title: 1 });
  const chosenTests = assessments.filter((item) => matchesYear(item, range.year) && withinDates(item.date, range.from, range.to));
  const classes = await ClassRoom.find({ school: schoolId, isActive: true }).sort({ name: 1 });
  const students = await Student.find({ school: schoolId, isActive: true }).sort({ fullName: 1 });
  const marks = await Mark.find({ school: schoolId, assessment: { $in: chosenTests.map((item) => item._id) } });
  const markMap = new Map(marks.map((mark) => [`${mark.assessment}:${mark.student}`, mark]));
  return classes.map((room) => {
    const tests = chosenTests.filter((item) => String(item.classRoom?._id || item.classRoom) === String(room._id));
    const people = students.filter((student) => String(student.classRoom) === String(room._id));
    return classMarkSheet(room, tests, people, markMap, null);
  });
}
async function monthlySheets(schoolId, year, month, range = {}) {
  const { start, end } = monthBounds(year, month);
  const found = await Assessment.find({ school: schoolId, date: { $gte: start, $lt: end }, type: { $ne: "exam" } })
    .populate("subject", "name code credits")
    .populate("classRoom", "name")
    .populate("teacher", "fullName")
    .sort({ date: 1, title: 1 });
  const assessments = found.filter((item) => withinDates(item.date, range.from, range.to));
  const classes = await ClassRoom.find({ school: schoolId, isActive: true }).sort({ name: 1 });
  const notices = await MonthlyNotice.find({ school: schoolId, year, month });
  const noticeByClass = new Map(notices.map((row) => [String(row.classRoom), row.sentAt]));
  const students = await Student.find({ school: schoolId, isActive: true }).sort({ fullName: 1 });
  const marks = await Mark.find({ school: schoolId, assessment: { $in: assessments.map((item) => item._id) } });
  const markMap = new Map(marks.map((mark) => [`${mark.assessment}:${mark.student}`, mark]));
  return classes.map((room) => {
    const tests = assessments.filter((item) => String(item.classRoom?._id || item.classRoom) === String(room._id));
    const people = students.filter((student) => String(student.classRoom) === String(room._id));
    return classMarkSheet(room, tests, people, markMap, noticeByClass.get(String(room._id)) || null);
  });
}

router.get(
  "/follow",
  requireRoles("school_admin", "teacher", "dos"),
  asyncHandler(async (req, res) => {
    const filter = { school: req.user.school };
    const pairs = await teacherSubjectFilter(req);
    if (pairs) {
      if (!pairs.length) return res.json({ success: true, rows: [] });
      filter.$or = pairs;
    }
    const classId = String(req.query.classRoom || "").trim();
    if (/^[a-f0-9]{24}$/i.test(classId)) filter.classRoom = classId;
    if (req.query.kind === "exam") filter.type = "exam";
    if (req.query.kind === "assessment") filter.type = { $ne: "exam" };
    const found = await Assessment.find(filter)
      .populate("subject", "name")
      .populate("classRoom", "name")
      .populate("teacher", "fullName")
      .sort({ date: -1, title: 1 });
    const chosen = found.filter((item) => matchesYear(item, String(req.query.year || "").trim()) && withinDates(item.date, stampQuery(req.query.from), stampQuery(req.query.to)));
    const roomIds = [...new Set(chosen.map((item) => String(item.classRoom?._id || item.classRoom)).filter(Boolean))];
    const students = roomIds.length
      ? await Student.find({ school: req.user.school, isActive: true, classRoom: { $in: roomIds } }).select("fullName classRoom").sort({ fullName: 1 })
      : [];
    const marks = chosen.length
      ? await Mark.find({ school: req.user.school, assessment: { $in: chosen.map((item) => item._id) } }).select("assessment student attended absenceReason")
      : [];
    const markMap = new Map(marks.map((mark) => [`${mark.assessment}:${mark.student}`, mark]));
    const rows = [];
    chosen.forEach((assessment) => {
      const roomId = String(assessment.classRoom?._id || assessment.classRoom);
      students.filter((student) => String(student.classRoom) === roomId).forEach((student) => {
        const mark = markMap.get(`${assessment._id}:${student._id}`);
        const recorded = Boolean(mark);
        const missed = recorded && mark.attended === false;
        rows.push({
          id: `${assessment._id}:${student._id}`,
          student: student.fullName,
          className: assessment.classRoom?.name || "",
          subject: assessment.subject?.name || "",
          title: assessment.title,
          kind: assessment.type === "exam" ? "exam" : "assessment",
          date: assessment.date,
          teacher: assessment.teacher?.fullName || "",
          status: !recorded ? "missing" : missed ? "absent" : "attended",
          reason: missed ? String(mark.absenceReason || "") : "",
        });
      });
    });
    res.json({ success: true, rows });
  })
);

router.get(
  "/combined",
  requireRoles("dos", "school_admin"),
  asyncHandler(async (req, res) => {
    const scope = req.query.scope === "midterm" ? "midterm" : "term";
    const term = storedTerm(req.query.term);
    const classes = await combinedSheets(req.user.school, scope, term, {
      year: String(req.query.year || "").trim(),
      from: stampQuery(req.query.from),
      to: stampQuery(req.query.to),
    });
    res.json({ success: true, scope, term, classes });
  })
);

router.get(
  "/monthly",
  requireRoles("dos"),
  asyncHandler(async (req, res) => {
    const { year, month } = monthBounds(req.query.year, req.query.month);
    const classes = await monthlySheets(req.user.school, year, month, {
      from: stampQuery(req.query.from),
      to: stampQuery(req.query.to),
    });
    res.json({ success: true, year, month, classes });
  })
);

router.post(
  "/monthly-notify",
  requireRoles("dos"),
  asyncHandler(async (req, res) => {
    const { year, month } = monthBounds(req.body.year, req.body.month);
    const school = await School.findById(req.user.school);
    if (!school) throw new ApiError(404, "School not found");
    const sheets = await monthlySheets(school._id, year, month);
    const ready = sheets.filter((sheet) => sheet.subjects.length);
    if (!ready.length) throw new ApiError(400, "No assessments in this month.");
    const results = [];
    let sentCount = 0;
    for (const sheet of ready) {
      if (sheet.notifiedAt) {
        results.push({ classRoom: sheet.classRoom.name, skipped: true, reason: "Parents were already notified for this month." });
        continue;
      }
      const students = await Student.find({ school: school._id, classRoom: sheet.classRoom._id, isActive: true });
      let classSent = 0;
      for (const student of students) {
        const guardian = (student.guardians || []).find((item) => item.isPrimary) || student.guardians?.[0];
        if (!guardian?.phone) {
          results.push({ classRoom: sheet.classRoom.name, student: student.fullName, skipped: true, reason: "No parent phone" });
          continue;
        }
        const row = (sheet.ranking || []).find((item) => String(item.id) === String(student._id));
        if (!row) continue;
        try {
          await smsWallet.sendFromSchool({
            school,
            phones: [guardian.phone],
            message: monthlyParentMessage({
              name: student.fullName,
              className: sheet.classRoom.name,
              school: school.name,
              average: row.average,
              position: row.position,
              classSize: sheet.ranking.length,
            }),
            createdBy: req.user._id,
            category: "results",
          });
          classSent += 1;
          sentCount += 1;
          results.push({ classRoom: sheet.classRoom.name, student: student.fullName });
        } catch (err) {
          results.push({ classRoom: sheet.classRoom.name, student: student.fullName, skipped: true, reason: err.message });
        }
      }
      if (classSent > 0) {
        try {
          await MonthlyNotice.create({ school: school._id, classRoom: sheet.classRoom._id, year, month, sentBy: req.user._id });
        } catch (err) {
          if (err?.code !== 11000) throw err;
        }
      }
    }
    const missed = results.filter((row) => row.skipped);
    res.json({
      success: true,
      results,
      smsBalance: school.smsBalance,
      message: missed.length
        ? `Sent ${sentCount}. Not sent: ${missed.map((row) => `${row.student || row.classRoom} (${row.reason})`).join("; ")}`
        : `Sent to ${sentCount} parent${sentCount === 1 ? "" : "s"}.`,
    });
  })
);

function gradeOf(percent) {
  if (percent >= 80) return { letter: "A", label: "Excellent" };
  if (percent >= 70) return { letter: "B", label: "Very good" };
  if (percent >= 60) return { letter: "C", label: "Good" };
  if (percent >= 50) return { letter: "D", label: "Average" };
  return { letter: "E", label: "Needs support" };
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

router.get(
  "/report",
  requireRoles("school_admin", "teacher", "dos"),
  asyncHandler(async (req, res) => {
    const academicYear = String(req.query.academicYear || "").trim();
    const term = String(req.query.term || "").trim();
    if (!academicYear || !term) throw new ApiError(400, "Choose the academic year and the term.");
    const school = await School.findById(req.user.school);
    if (!school) throw new ApiError(404, "School not found");

    let classroomId = String(req.query.classRoom || "").trim();
    const studentId = String(req.query.student || "").trim();
    if (studentId) {
      const student = await Student.findOne({ _id: studentId, school: school._id, isActive: true });
      if (!student) throw new ApiError(404, "Student not found");
      classroomId = String(student.classRoom || "");
    }
    if (!classroomId) throw new ApiError(400, "Choose a class or a student.");

    const classroom = await ClassRoom.findOne({ _id: classroomId, school: school._id });
    if (!classroom) throw new ApiError(404, "Class not found");

    const aliases = termAliases(term);
    const assessments = await Assessment.find({
      school: school._id,
      classRoom: classroom._id,
      academicYear,
      term: { $in: aliases },
      type: { $ne: "exam" },
    }).populate("subject", "name");
    const students = await Student.find({ school: school._id, classRoom: classroom._id, isActive: true }).sort({ fullName: 1 });
    const marks = assessments.length
      ? await Mark.find({ school: school._id, assessment: { $in: assessments.map((item) => item._id) } })
      : [];
    const assessmentById = new Map(assessments.map((item) => [String(item._id), item]));

    const built = students.map((student) => {
      const rows = marks
        .filter((mark) => String(mark.student) === String(student._id) && assessmentById.has(String(mark.assessment)))
        .map((mark) => {
          const assessment = assessmentById.get(String(mark.assessment));
          const maxScore = Number(assessment.maxScore || 100);
          const score = Number(mark.score || 0);
          const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
          const grade = gradeOf(percent);
          return {
            id: mark._id,
            subject: assessment.subject?.name || "Subject",
            title: assessment.title,
            date: assessment.date || mark.createdAt,
            score,
            maxScore,
            percent: round1(percent),
            grade: grade.letter,
            level: grade.label,
            comment: mark.comment || "",
          };
        })
        .sort((a, b) => String(a.subject).localeCompare(String(b.subject)) || String(a.title).localeCompare(String(b.title)));
      const totalScore = rows.reduce((sum, row) => sum + row.score, 0);
      const totalMax = rows.reduce((sum, row) => sum + row.maxScore, 0);
      const averagePercent = totalMax > 0 ? round1((totalScore / totalMax) * 100) : null;
      return {
        student: { _id: student._id, fullName: student.fullName, studentCode: student.studentCode },
        rows,
        totalScore,
        totalMax,
        averagePercent,
        grade: averagePercent == null ? null : gradeOf(averagePercent),
      };
    });

    const ranked = built
      .filter((item) => item.averagePercent != null)
      .sort((a, b) => b.averagePercent - a.averagePercent || a.student.fullName.localeCompare(b.student.fullName));
    let previous = null;
    ranked.forEach((item, index) => {
      if (previous == null || item.averagePercent !== previous) {
        item.position = index + 1;
        previous = item.averagePercent;
      } else {
        item.position = ranked[index - 1].position;
      }
    });
    built.forEach((item) => {
      if (item.position == null) item.position = null;
      item.classSize = ranked.length;
    });

    const focus = studentId ? built.filter((item) => String(item.student._id) === studentId) : built.filter((item) => item.rows.length);
    res.json({
      success: true,
      kind: "academic",
      school: schoolBrief(school),
      classRoom: { _id: classroom._id, name: classroom.name },
      academicYear,
      term,
      gradeScale: "A 80–100 · B 70–79 · C 60–69 · D 50–59 · E below 50",
      items: focus,
    });
  })
);

router.get(
  "/my-child",
  requireRoles("parent"),
  asyncHandler(async (req, res) => {
    const students = await Student.find({ "guardians.user": req.user._id }).populate("classRoom", "name");
    const studentIds = students.map((s) => s._id);
    const marks = await Mark.find({ student: { $in: studentIds } })
      .populate({ path: "assessment", populate: { path: "subject", select: "name" } })
      .sort({ createdAt: -1 });
    res.json({ success: true, students, marks });
  })
);

module.exports = router;
