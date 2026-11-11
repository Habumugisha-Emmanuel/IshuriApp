const mongoose = require("mongoose");

const schoolReactionSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    visitor: { type: String, required: true, trim: true },
    stars: { type: Number, min: 1, max: 5 },
    liked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

schoolReactionSchema.index({ school: 1, visitor: 1 }, { unique: true });

module.exports = mongoose.model("SchoolReaction", schoolReactionSchema);
