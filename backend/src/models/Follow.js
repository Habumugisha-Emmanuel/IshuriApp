const mongoose = require("mongoose");

const followSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  },
  { timestamps: true }
);

followSchema.index({ user: 1, school: 1 }, { unique: true });

module.exports = mongoose.model("Follow", followSchema);
