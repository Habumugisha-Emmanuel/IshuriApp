const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    name: { type: String, required: true, trim: true },
    phone: String,
    note: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vendorSchema.index({ school: 1, name: 1 });

module.exports = mongoose.model("Vendor", vendorSchema);
