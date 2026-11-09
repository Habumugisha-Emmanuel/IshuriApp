const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { Event, Announcement, GalleryItem } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired, requireSchoolScope, requireRoles("school_admin"));

router.get(
  "/events",
  asyncHandler(async (req, res) => {
    const items = await Event.find({ school: req.user.school }).sort({ startsAt: -1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const item = await Event.create({ ...req.body, school: req.user.school, createdBy: req.user._id });
    res.status(201).json({ success: true, item });
  })
);

router.patch(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const item = await Event.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      req.body,
      { new: true }
    );
    if (!item) throw new ApiError(404, "Event not found");
    res.json({ success: true, item });
  })
);

router.delete(
  "/events/:id",
  asyncHandler(async (req, res) => {
    await Event.findOneAndDelete({ _id: req.params.id, school: req.user.school });
    res.json({ success: true });
  })
);

router.get(
  "/announcements",
  asyncHandler(async (req, res) => {
    const items = await Announcement.find({ school: req.user.school }).sort({ createdAt: -1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/announcements",
  asyncHandler(async (req, res) => {
    const item = await Announcement.create({ ...req.body, school: req.user.school, createdBy: req.user._id });
    res.status(201).json({ success: true, item });
  })
);

router.patch(
  "/announcements/:id",
  asyncHandler(async (req, res) => {
    const item = await Announcement.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      req.body,
      { new: true }
    );
    res.json({ success: true, item });
  })
);

router.delete(
  "/announcements/:id",
  asyncHandler(async (req, res) => {
    await Announcement.findOneAndDelete({ _id: req.params.id, school: req.user.school });
    res.json({ success: true });
  })
);

router.get(
  "/gallery",
  asyncHandler(async (req, res) => {
    const items = await GalleryItem.find({ school: req.user.school }).sort({ createdAt: -1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/gallery",
  asyncHandler(async (req, res) => {
    const item = await GalleryItem.create({ ...req.body, school: req.user.school, uploadedBy: req.user._id });
    res.status(201).json({ success: true, item });
  })
);

router.delete(
  "/gallery/:id",
  asyncHandler(async (req, res) => {
    await GalleryItem.findOneAndDelete({ _id: req.params.id, school: req.user.school });
    res.json({ success: true });
  })
);

module.exports = router;
