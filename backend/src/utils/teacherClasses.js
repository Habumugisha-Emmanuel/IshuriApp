const { Staff, ClassRoom } = require("../models");

async function assignedClassIds(user) {
  if (!user || user.role !== "teacher") return null;
  const staff = await Staff.findOne({ school: user.school, user: user._id, isActive: { $ne: false } });
  if (!staff) return [];
  const classes = await ClassRoom.find({
    school: user.school,
    isActive: true,
    $or: [{ classTeacher: staff._id }, { "subjects.teacher": staff._id }],
  }).select("_id");
  return classes.map((item) => item._id);
}

module.exports = { assignedClassIds };
