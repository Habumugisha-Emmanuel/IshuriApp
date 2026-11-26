const mongoose = require("mongoose");

const disciplinePhraseSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    kind: { type: String, enum: ["title", "happened"], default: "title" },
    text: { type: String, required: true, trim: true, maxlength: 160 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

disciplinePhraseSchema.index({ school: 1, kind: 1, text: 1 }, { unique: true });

const DisciplinePhrase = mongoose.model("DisciplinePhrase", disciplinePhraseSchema);
DisciplinePhrase.syncIndexes().catch((err) => console.log(`DISCIPLINE PHRASE INDEX: ${err.message}`));

module.exports = DisciplinePhrase;
