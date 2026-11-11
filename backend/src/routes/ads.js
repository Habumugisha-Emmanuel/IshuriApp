const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { PlatformAd } = require("../models");
const { authRequired, requireRoles } = require("../middleware/auth");

const CATEGORIES = ["internship", "new_school", "event", "opportunity", "sponsor", "other"];

function text(value) {
  const cleaned = String(value || "").trim();
  return cleaned || undefined;
}

function adPayload(body) {
  const title = text(body.title);
  if (!title) throw new ApiError(400, "Title is required");
  const category = String(body.category || "other")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!CATEGORIES.includes(category)) {
    throw new ApiError(400, `Category must be one of: ${CATEGORIES.join(", ")}`);
  }
  return {
    title,
    body: text(body.body),
    imageUrl: text(body.imageUrl),
    videoUrl: text(body.videoUrl),
    ctaLabel: text(body.ctaLabel),
    ctaUrl: text(body.ctaUrl),
    category,
  };
}

const router = express.Router();
router.use(authRequired, requireRoles("super_admin"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await PlatformAd.find().populate("school", "name").sort({ createdAt: -1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const item = await PlatformAd.create({ ...adPayload(req.body), createdBy: req.user._id });
    res.status(201).json({ success: true, item });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await PlatformAd.findById(req.params.id);
    if (!item) throw new ApiError(404, "Ad not found");

    const keys = Object.keys(req.body || {});
    if (keys.length === 1 && keys[0] === "isActive") {
      item.isActive = Boolean(req.body.isActive);
      await item.save();
      return res.json({ success: true, item });
    }

    const payload = adPayload(req.body);
    item.title = payload.title;
    item.body = payload.body || "";
    item.imageUrl = payload.imageUrl || "";
    item.videoUrl = payload.videoUrl || "";
    item.ctaLabel = payload.ctaLabel || "";
    item.ctaUrl = payload.ctaUrl || "";
    item.category = payload.category;
    await item.save();
    res.json({ success: true, item });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await PlatformAd.findByIdAndDelete(req.params.id);
    if (!item) throw new ApiError(404, "Ad not found");
    res.json({ success: true });
  })
);

module.exports = router;
