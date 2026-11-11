
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
  SchoolReaction,
} = require("../models");

const ApiError = require("../utils/ApiError");

const router = express.Router();

function publicSchoolFilter(extra = {}) {
  return { status: "approved", ...extra };
}

function visitorKey(value) {
  const visitor = String(value || "").trim();
  return /^[a-zA-Z0-9-]{16,64}$/.test(visitor) ? visitor : "";
}

function scoreOf(school, mine) {
  const ratingCount = school.ratingCount || 0;
  const ratingSum = school.ratingSum || 0;

  return {
    ratingAverage: ratingCount
      ? Math.round((ratingSum / ratingCount) * 10) / 10
      : 0,
    ratingCount,
    likeCount: Math.max(0, school.likeCount || 0),
    myStars: mine?.stars || 0,
    myLike: Boolean(mine?.liked),
  };
}

function presentSchool(school, mine) {
  return { ...school.toObject(), ...scoreOf(school, mine) };
}

// GET ALL APPROVED SCHOOLS
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
        { "location.sector": new RegExp(q, "i") },
        { "location.address": new RegExp(q, "i") },
        { programs: new RegExp(q, "i") },
      ];
    }

    if (req.query.type) filter.type = req.query.type;
    if (req.query.province) filter["location.province"] = req.query.province;
    if (req.query.district) filter["location.district"] = req.query.district;
    if (req.query.sector) filter["location.sector"] = req.query.sector;
    if (req.query.address) filter["location.address"] = req.query.address;

    if (req.query.featured === "true") {
      filter.isFeatured = true;
    }

    const sort =
      req.query.sort === "rank"
        ? { nationalRank: 1, name: 1 }
        : req.query.sort === "followers"
          ? { followersCount: -1 }
          : { isFeatured: -1, name: 1 };

    const [items, total] = await Promise.all([
      School.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select("-reviewNotes -rejectionReason"),

      School.countDocuments(filter),
    ]);

    const visitor = visitorKey(req.query.visitor);

    const mine = visitor
      ? await SchoolReaction.find({
          visitor,
          school: { $in: items.map((school) => school._id) },
        })
      : [];

    const bySchool = new Map(
      mine.map((row) => [String(row.school), row])
    );

    res.json({
      success: true,
      items: items.map((school) =>
        presentSchool(school, bySchool.get(String(school._id)))
      ),
      meta: pageMeta(total, page, limit),
    });
  })
);

// GET SINGLE SCHOOL WITH PUBLIC INFORMATION
router.get(
  "/schools/:idOrSlug",
  asyncHandler(async (req, res) => {
    const { idOrSlug } = req.params;

    const school = await School.findOne(
      /^[a-f0-9]{24}$/i.test(idOrSlug)
        ? { _id: idOrSlug, status: "approved" }
        : { slug: idOrSlug, status: "approved" }
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    const [staffRows, rooms, events, announcements, gallery] =
      await Promise.all([
        Staff.find({
          school: school._id,
          visibility: "public",
          isActive: true,
        })
          .populate("subjects", "name code")
          .populate("classes", "name academicYear")
          .lean(),

        ClassRoom.find({
          school: school._id,
          isActive: { $ne: false },
        })
          .select("name academicYear classTeacher subjects")
          .populate("subjects.subject", "name")
          .lean(),

        Event.find({
          school: school._id,
          isPublic: true,
          status: "published",
        })
          .sort({ startsAt: -1 })
          .limit(12),

        Announcement.find({
          school: school._id,
          isPublic: true,
          status: "published",
        })
          .sort({ createdAt: -1 })
          .limit(12),

        GalleryItem.find({
          school: school._id,
          isPublic: true,
        })
          .sort({ createdAt: -1 })
          .limit(24),
      ]);

    const staff = staffRows.map((member) => {
      const id = String(member._id);

      const managedClasses = rooms
        .filter((room) => String(room.classTeacher) === id)
        .map((room) => ({
          name: room.name,
          academicYear: room.academicYear,
        }));

      const teaching = rooms.flatMap((room) =>
        (room.subjects || [])
          .filter((row) => String(row.teacher) === id)
          .map((row) => ({
            subject: row.subject?.name || "Subject",
            className: room.name,
          }))
      );

      return {
        ...member,
        managedClasses,
        teaching,
      };
    });

    const visitor = visitorKey(req.query.visitor);

    const mine = visitor
      ? await SchoolReaction.findOne({
          school: school._id,
          visitor,
        })
      : null;

    res.json({
      success: true,
      school: presentSchool(school, mine),
      staff,
      events,
      announcements,
      gallery,
    });
  })
);

// ADD OR UPDATE SCHOOL RATING AND LIKE
router.post(
  "/schools/:idOrSlug/reaction",
  asyncHandler(async (req, res) => {
    const visitor = visitorKey(req.body?.visitor);

    if (!visitor) {
      throw new ApiError(400, "Choose 1 to 5 stars");
    }

    const { idOrSlug } = req.params;

    const school = await School.findOne(
      /^[a-f0-9]{24}$/i.test(idOrSlug)
        ? { _id: idOrSlug, status: "approved" }
        : { slug: idOrSlug, status: "approved" }
    );

    if (!school) {
      throw new ApiError(404, "School not found");
    }

    const existing = await SchoolReaction.findOne({
      school: school._id,
      visitor,
    });

    const next = {
      stars: existing?.stars || null,
      liked: Boolean(existing?.liked),
    };

    const inc = {};

    if (req.body?.stars !== undefined) {
      const stars = Number(req.body.stars);

      if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        throw new ApiError(400, "Choose 1 to 5 stars");
      }

      if (!next.stars) {
        inc.ratingSum = stars;
        inc.ratingCount = 1;
      } else if (next.stars !== stars) {
        inc.ratingSum = stars - next.stars;
      }

      next.stars = stars;
    }

    if (req.body?.liked !== undefined) {
      const liked = Boolean(req.body.liked);

      if (liked !== next.liked) {
        inc.likeCount = liked ? 1 : -1;
      }

      next.liked = liked;
    }

    await SchoolReaction.findOneAndUpdate(
      { school: school._id, visitor },
      {
        $set: {
          stars: next.stars,
          liked: next.liked,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    const updated = Object.keys(inc).length
      ? await School.findByIdAndUpdate(
          school._id,
          { $inc: inc },
          { new: true }
        )
      : school;

    if (
      (updated.likeCount || 0) < 0 ||
      (updated.ratingSum || 0) < 0
    ) {
      await School.updateOne(
        { _id: school._id },
        {
          $max: {
            likeCount: 0,
            ratingSum: 0,
            ratingCount: 0,
          },
        }
      );
    }

    const fresh = await School.findById(school._id);

    res.json({
      success: true,
      score: scoreOf(fresh, next),
    });
  })
);

// SCHOOL RANKINGS
router.get(
  "/rankings",
  asyncHandler(async (req, res) => {
    const filter = publicSchoolFilter({
      nationalRank: { $ne: null },
    });

    if (req.query.type) {
      filter.type = req.query.type;
    }

    const items = await School.find(filter)
      .sort({ nationalRank: 1, name: 1 })
      .limit(100)
      .select(
        "name slug type logoUrl location nationalRank performanceSummary studentCount"
      );

    res.json({
      success: true,
      items,
    });
  })
);

// PUBLIC EVENTS
router.get(
  "/events",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query);

    const filter = {
      isPublic: true,
      status: "published",
    };

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const [items, total] = await Promise.all([
      Event.find(filter)
        .populate("school", "name slug logoUrl type location")
        .sort({ startsAt: 1 })
        .skip(skip)
        .limit(limit),

      Event.countDocuments(filter),
    ]);

    res.json({
      success: true,
      items,
      meta: pageMeta(total, page, limit),
    });
  })
);

// PUBLIC ADVERTISEMENTS
router.get(
  "/ads",
  asyncHandler(async (req, res) => {
    const now = new Date();

    const items = await PlatformAd.find({
      isActive: true,
      $and: [
        {
          $or: [
            { startsAt: { $exists: false } },
            { startsAt: null },
            { startsAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { endsAt: { $exists: false } },
            { endsAt: null },
            { endsAt: { $gte: now } },
          ],
        },
      ],
    })
      .populate("school", "name slug logoUrl")
      .sort({ createdAt: -1 })
      .limit(20);

    await PlatformAd.updateMany(
      { _id: { $in: items.map((i) => i._id) } },
      { $inc: { impressions: 1 } }
    );

    res.json({
      success: true,
      items,
    });
  })
);

// RECORD AD CLICK
router.post(
  "/ads/:id/click",
  asyncHandler(async (req, res) => {
    await PlatformAd.findByIdAndUpdate(
      req.params.id,
      { $inc: { clicks: 1 } }
    );

    res.json({
      success: true,
    });
  })
);

// PUBLIC SCHOOL GALLERY
router.get(
  "/gallery",
  asyncHandler(async (req, res) => {
    const schools = await School.find({
      status: "approved",
    }).select("_id");

    const items = await GalleryItem.find({
      isPublic: true,
      school: {
        $in: schools.map((school) => school._id),
      },
    })
      .populate("school", "name slug")
      .sort({ createdAt: -1 })
      .limit(24);

    res.json({
      success: true,
      items,
    });
  })
);

// DISTRICTS AND LOCATIONS
router.get(
  "/districts",
  asyncHandler(async (req, res) => {
    const districts = await School.aggregate([
      {
        $match: {
          status: "approved",
        },
      },
      {
        $group: {
          _id: {
            province: "$location.province",
            district: "$location.district",
            sector: "$location.sector",
            address: "$location.address",
          },
          count: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          "_id.province": 1,
          "_id.district": 1,
          "_id.sector": 1,
          "_id.address": 1,
        },
      },
    ]);

    res.json({
      success: true,
      items: districts,
    });
  })
);

module.exports = router;
