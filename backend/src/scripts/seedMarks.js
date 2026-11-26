const { Assessment, Mark, Student } = require("../models");

const NOTES = [
  "Steady work this term.",
  "Good effort, keep practising.",
  "Clear working, a few slips.",
  "Needs more practice on the last questions.",
  "Strong result.",
];

function scoreFor(studentId, assessmentId, maxScore) {
  const max = Number(maxScore) || 0;
  if (max <= 0) return 0;
  const text = `${studentId}:${assessmentId}`;
  let hash = 0;
  for (const char of text) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  const ratio = 0.48 + (hash % 45) / 100;
  return Math.min(max, Math.round(max * ratio));
}

async function seedMissingMarks({ schoolId } = {}) {
  const filter = schoolId ? { school: schoolId } : {};
  const assessments = await Assessment.find(filter);
  let created = 0;
  for (const assessment of assessments) {
    const students = await Student.find({
      school: assessment.school,
      classRoom: assessment.classRoom,
      isActive: true,
    });
    for (const student of students) {
      const exists = await Mark.findOne({ assessment: assessment._id, student: student._id });
      if (exists) continue;
      const text = `${student._id}:${assessment._id}`;
      let hash = 0;
      for (const char of text) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
      await Mark.create({
        school: assessment.school,
        assessment: assessment._id,
        student: student._id,
        score: scoreFor(student._id, assessment._id, assessment.maxScore),
        comment: NOTES[hash % NOTES.length],
      });
      created += 1;
    }
  }
  return created;
}

async function runStandalone() {
  const path = require("path");
  require("dotenv").config({ path: path.join(__dirname, "../../.env") });
  const { connectDb } = require("../config/db");
  const { School, ClassRoom, Subject } = require("../models");
  await connectDb();
  const created = await seedMissingMarks();
  const school = await School.findOne({ slug: "gs-nyarugenge" });
  const room = await ClassRoom.findOne({ school: school._id, name: "S6 PCM" });
  const maths = await Subject.findOne({ school: school._id, name: "Mathematics" });
  const assessment = await Assessment.findOne({ school: school._id, classRoom: room._id, subject: maths._id });
  const marks = await Mark.find({ assessment: assessment._id }).populate("student", "fullName");
  console.log(`Marks added: ${created}`);
  console.log(`Mathematics /${assessment.maxScore}: ${marks.map((mark) => `${mark.student.fullName} ${mark.score}`).sort().join("; ")}`);
  process.exit(0);
}

if (require.main === module) {
  runStandalone().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { seedMissingMarks };
