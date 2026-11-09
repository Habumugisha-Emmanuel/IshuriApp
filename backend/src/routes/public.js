const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { paginate, pageMeta } = require("../utils/paginate");
const {
  School,
  Staff,
  Event,
  Announcement,
  GalleryItem,
  PlatformAd,
  ClassRoom,
} = require("../models");

const router = express.Router();

function publicSchoolFilter(extra = {}) {
  return { status: "approved", ...extra };
}

router.get(
  "/schools",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query);
    const filter = publicSchoolFilter();
    if (req.query.q) {
      const q = String(req.query.q).trim();
      filter.$or = [
        { name: new RegExp(q, "i") },
        { motto: new RegExp(q, "i") },
        { "location.district": new RegExp(q, "i") },
        { "location.province": new RegExp(q, "i") },
        { programs: new RegExp(q, "i") },
      ];
    }
    if (req.query.type) filter.type = req.query.type;
    if (req.query.province) filter["location.province"] = req.query.province;
    if (req.query.district) filter["location.district"] = req.query.district;
    if (req.query.featured === "true") filter.isFeatured = true;

    const sort =
      req.query.sort === "rank"
        ? { nationalRank: 1, name: 1 }
        : req.query.sort === "followers"
          ? { followersCount: -1 }
          : { isFeatured: -1, name: 1 };

    const [items, total] = await Promise.all([
      School.find(filter).sort(sort).skip(skip).limit(limit).select("-reviewNotes -rejectionReason"),
      School.countDocuments(filter),
    ]);
    res.json({ success: true, items, meta: pageMeta(total, page, limit) });
  })
);

router.get(
  "/schools/:idOrSlug",
  asyncHandler(async (req, res) => {
    const { idOrSlug } = req.params;
    const school = await School.findOne(
      /^[a-f0-9]{24}$/i.test(idOrSlug)
        ? { _id: idOrSlug, status: "approved" }
        : { slug: idOrSlug, status: "approved" }
    );
    if (!school) return res.status(404).json({ success: false, message: "School not found" });

    const [staffRows, rooms, events, announcements, gallery] = await Promise.all([
      Staff.find({ school: school._id, visibility: "public", isActive: true })
        .populate("subjects", "name code")
        .populate("classes", "name academicYear")
        .lean(),
      ClassRoom.find({ school: school._id, isActive: { $ne: false } })
        .select("name academicYear classTeacher subjects")
        .populate("subjects.subject", "name")
        .lean(),
      Event.find({ school: school._id, isPublic: true, status: "published" }).sort({ startsAt: -1 }).limit(12),
      Announcement.find({ school: school._id, isPublic: true, status: "published" }).sort({ createdAt: -1 }).limit(12),
      GalleryItem.find({ school: school._id, isPublic: true }).sort({ createdAt: -1 }).limit(24),
    ]);
    const staff = staffRows.map((member) => {
      const id = String(member._id);
      const managedClasses = rooms
        .filter((room) => String(room.classTeacher) === id)
        .map((room) => ({ name: room.name, academicYear: room.academicYear }));
      const teaching = rooms.flatMap((room) => (room.subjects || [])
        .filter((row) => String(row.teacher) === id)
        .map((row) => ({ subject: row.subject?.name || "Subject", className: room.name })));
      return { ...member, managedClasses, teaching };
    });

    res.json({
      success: true,
      school,
      staff,
      events,
      announcements,
      gallery,
    });
  })
);

router.get(
  "/rankings",
  asyncHandler(async (req, res) => {
    const filter = publicSchoolFilter({ nationalRank: { $ne: null } });
    if (req.query.type) filter.type = req.query.type;
    const items = await School.find(filter)
      .sort({ nationalRank: 1, name: 1 })
      .limit(100)
      .select("name slug type logoUrl location nationalRank performanceSummary studentCount");
    res.json({ success: true, items });
  })
);

router.get(
  "/events",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query);
    const filter = { isPublic: true, status: "published" };
    if (req.query.category) filter.category = req.query.category;
    const [items, total] = await Promise.all([
      Event.find(filter).populate("school", "name slug logoUrl type location").sort({ startsAt: 1 }).skip(skip).limit(limit),
      Event.countDocuments(filter),
    ]);
    res.json({ success: true, items, meta: pageMeta(total, page, limit) });
  })
);

router.get(
  "/ads",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const items = await PlatformAd.find({
      isActive: true,
      $and: [
        { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .populate("school", "name slug logoUrl")
      .sort({ createdAt: -1 })
      .limit(20);
    await PlatformAd.updateMany({ _id: { $in: items.map((i) => i._id) } }, { $inc: { impressions: 1 } });
    res.json({ success: true, items });
  })
);

router.post(
  "/ads/:id/click",
  asyncHandler(async (req, res) => {
    await PlatformAd.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } });
    res.json({ success: true });
  })
);

router.get(
  "/districts",
  asyncHandler(async (req, res) => {
    const districts = await School.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: { province: "$location.province", district: "$location.district" }, count: { $sum: 1 } } },
      { $sort: { "_id.province": 1, "_id.district": 1 } },
    ]);
    res.json({ success: true, items: districts });
  })
);

module.exports = router;
