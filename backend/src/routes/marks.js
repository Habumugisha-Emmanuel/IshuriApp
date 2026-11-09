const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { Assessment, Mark, Student, School, Staff, Subject, ClassRoom } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const smsWallet = require("../services/smsWallet");
const { schoolBrief, termAliases } = require("../utils/schoolBrief");

const router = express.Router();
router.use(authRequired, requireSchoolScope);

function marksParentMessage({ school, student, score, total, subject, assessment, comment }) {
  const note = String(comment || "").trim();
  const decision = note
    ? ` Ndetse nk'umwarimu wa ${student} dufatanije kurera kubamenyesha umwanzuro ufatwa n'umwarimu n'urwego rw' amanota y'umunyeshuri : ${note} !`
    : "";
  return `Mwiriwe neza Bubyeyi dufatanije kurera, turabamenyesha ko umwana wanyu ${student}, wiga mu ishuri rya ${school}, yabonye amanota ${score}/${total} mu isomo rya ${subject}, mu isuzuma rya ${assessment}.${decision} Mukomeze kumushyigikira kugira ngo arusheho gutera imbere mu myigire ye murakoze ! Best regards, IshuriApp.`;
}

router.get(
  "/classes/:classRoom/history",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const classroom = await ClassRoom.findOne({ _id: req.params.classRoom, school: req.user.school });
    if (!classroom) throw new ApiError(404, "Class not found");
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
        select: "title subject maxScore term academicYear date",
        populate: { path: "subject", select: "name" },
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
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const filter = { school: req.user.school };
    if (req.query.classRoom) filter.classRoom = req.query.classRoom;
    if (req.query.subject) filter.subject = req.query.subject;
    const items = await Assessment.find(filter)
      .populate("subject", "name")
      .populate("classRoom", "name")
      .sort({ date: -1 });
    res.json({ success: true, items });
  })
);

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
  return assessment;
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
    assessment.subject = subject._id;
    if (req.body.date) {
      const date = new Date(req.body.date);
      if (Number.isNaN(date.getTime())) throw new ApiError(400, "Set the assessment date as year-month-day, for example 2026-10-16");
      assessment.date = date;
    }
    assessment.title = title;
    assessment.maxScore = maxScore;
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

router.post(
  "/assessments",
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school);
    if (!school.hasMarksSystem()) throw new ApiError(400, "Universities do not record class marks");
    const classroom = await ClassRoom.findOne({ _id: req.body.classRoom, school: school._id, isActive: true });
    if (!classroom) throw new ApiError(400, "Choose a class in this school");
    const subject = await subjectOnClass(school._id, classroom, req.body.subject);
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
    const entries = req.body.marks || [];
    const saved = [];
    for (const entry of entries) {
      const mark = await Mark.findOneAndUpdate(
        { assessment: assessment._id, student: entry.studentId },
        {
          school: req.user.school,
          assessment: assessment._id,
          student: entry.studentId,
          score: entry.score,
          comment: entry.comment,
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
  requireRoles("school_admin", "teacher"),
  asyncHandler(async (req, res) => {
    const items = await Mark.find({ assessment: req.params.id, school: req.user.school }).populate(
      "student",
      "fullName studentCode guardians"
    );
    res.json({ success: true, items });
  })
);

router.post(
  "/assessments/:id/notify-parents",
  requireRoles("school_admin", "teacher"),
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
  requireRoles("school_admin", "teacher"),
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
      const message = `${school.name}: Term ${term} results for ${student.fullName} — ${scores.join("; ")}. Please follow up. - IshuriApp`;
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
  requireRoles("school_admin", "teacher"),
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
