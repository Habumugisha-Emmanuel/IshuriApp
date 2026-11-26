
const express = require("express");
const mongoose = require("mongoose");
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
  Student,
  StudentCharge,
  Mark,
  Assessment,
  DisciplineCase,
  DisciplineScore,
  DisciplineTerm,
  User,
  ChatThread,
  ChatMessage,
} = require("../models");
const { schoolBrief, kigaliYear } = require("../utils/schoolBrief");

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

function escapeCode(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const parentLookups = new Map();

function allowParentLookup(ip) {
  const now = Date.now();
  const recent = (parentLookups.get(ip) || []).filter((stamp) => now - stamp < 60000);
  if (recent.length >= 20) {
    parentLookups.set(ip, recent);
    return false;
  }
  recent.push(now);
  parentLookups.set(ip, recent);
  return true;
}

function presentCharge(row) {
  const due = Number(row.amountDue) || 0;
  const paid = Number(row.amountPaid) || 0;
  return {
    id: row._id,
    name: row.accountName,
    amountDue: due,
    amountPaid: paid,
    unpaid: Math.max(0, due - paid),
    settled: paid > 0,
    dueOn: row.dueOn || null,
    payments: (row.payments || [])
      .map((payment) => ({ amount: Number(payment.amount) || 0, paidOn: payment.paidOn || null }))
      .sort((a, b) => new Date(b.paidOn || 0) - new Date(a.paidOn || 0)),
  };
}

function oneDecimal(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function paperYear(item) {
  return String(item.academicYear || kigaliYear(item.date) || "");
}

function parentClassList(tests, people, markMap) {
  if (!tests.length) return { subjects: [], rows: [] };
  const groups = new Map();
  tests.forEach((test) => {
    const id = String(test.subject?._id || test.subject || "subject");
    const current = groups.get(id) || { subject: test.subject, tests: [] };
    current.tests.push(test);
    groups.set(id, current);
  });
  const subjects = [...groups.values()].map((group) => {
    const credits = Number(group.subject?.credits);
    const standard = Number.isInteger(credits) && credits >= 1 && credits <= 40 ? credits * 10 : 0;
    const sumMax = group.tests.reduce((sum, test) => sum + Number(test.maxScore || 0), 0);
    return { id: String(group.subject?._id || ""), name: group.subject?.name || "Subject", standard, sumMax, tests: group.tests };
  });
  const rows = people.map((person) => {
    const marks = subjects.map((group) => {
      const cells = group.tests.map((test) => {
        const found = markMap.get(`${test._id}:${person._id}`);
        const max = Number(test.maxScore || 0);
        return { raw: found ? Number(found.score || 0) : 0, max };
      });
      const percents = cells.filter((cell) => cell.max > 0).map((cell) => (cell.raw / cell.max) * 100);
      const percent = percents.length ? oneDecimal(percents.reduce((sum, value) => sum + value, 0) / percents.length) : 0;
      const final = group.standard && group.sumMax > 0
        ? oneDecimal(cells.reduce((sum, cell) => sum + (cell.max > 0 ? (cell.raw / cell.max) * ((cell.max / group.sumMax) * group.standard) : 0), 0))
        : null;
      return { id: group.id, final, standard: group.standard, percent };
    });
    const percents = [];
    tests.forEach((test) => {
      const max = Number(test.maxScore || 0);
      if (max <= 0) return;
      const found = markMap.get(`${test._id}:${person._id}`);
      percents.push(((found ? Number(found.score || 0) : 0) / max) * 100);
    });
    return {
      id: person._id,
      name: person.fullName,
      average: percents.length ? oneDecimal(percents.reduce((sum, value) => sum + value, 0) / percents.length) : 0,
      marks,
    };
  });
  const ordered = rows.slice().sort((a, b) => b.average - a.average || String(a.name).localeCompare(String(b.name)));
  let previous = null;
  let place = 0;
  ordered.forEach((row, index) => {
    if (previous == null || row.average !== previous) {
      place = index + 1;
      previous = row.average;
    }
    row.position = place;
  });
  ordered.sort((a, b) => a.position - b.position || String(a.name).localeCompare(String(b.name)));
  return { subjects: subjects.map(({ id, name, standard }) => ({ id, name, standard })), rows: ordered };
}

function disciplineTermKey(value) {
  const lower = String(value || "").trim().toLowerCase();
  if (lower === "1" || lower === "term 1") return "1";
  if (lower === "2" || lower === "term 2") return "2";
  if (lower === "3" || lower === "term 3") return "3";
  return "";
}

router.get(
  "/parent",
  asyncHandler(async (req, res) => {
    if (!allowParentLookup(req.ip || "local")) {
      throw new ApiError(429, "Wait a moment, then try the student code again.");
    }
    const code = String(req.query.code || "").trim();
    if (!code || code.length > 40) throw new ApiError(400, "Enter the student code.");
    const students = await Student.find({
      isActive: true,
      studentCode: new RegExp(`^${escapeCode(code)}$`, "i"),
    })
      .select("fullName studentCode classRoom academicYear photoUrl school")
      .populate("classRoom", "name")
      .limit(3);
    if (!students.length) throw new ApiError(404, "No student has this code.");
    if (students.length > 1) throw new ApiError(409, "This code matches more than one student.");
    const student = students[0];
    const school = await School.findById(student.school).select("name motto logoUrl type location email phone status");
    if (!school) throw new ApiError(404, "No student has this code.");
    const classId = student.classRoom?._id || student.classRoom;
    const year = /^\d{4}$/.test(String(student.academicYear || "")) ? String(student.academicYear) : String(new Date().getFullYear());
    const [charges, ownMarks, classPapers, classmates, events, announcements, scoreRows, termRows, cases] = await Promise.all([
      StudentCharge.find({ school: student.school, student: student._id }).sort({ dueOn: -1 }),
      Mark.find({ school: student.school, student: student._id }).populate({
        path: "assessment",
        select: "title type date maxScore term academicYear subject",
        populate: { path: "subject", select: "name" },
      }),
      classId ? Assessment.find({ school: student.school, classRoom: classId }).populate("subject", "name code credits").sort({ date: 1, title: 1 }) : [],
      classId ? Student.find({ school: student.school, classRoom: classId, isActive: true }).select("fullName").sort({ fullName: 1 }) : [],
      Event.find({ school: student.school, status: "published", isPublic: { $ne: false } }).sort({ startsAt: -1 }).limit(40),
      Announcement.find({ school: student.school, status: "published", isPublic: { $ne: false } }).sort({ createdAt: -1 }).limit(40),
      DisciplineScore.find({ school: student.school, student: student._id }),
      DisciplineTerm.find({ school: student.school }),
      DisciplineCase.find({ school: student.school, student: student._id }).sort({ occurredAt: -1 }).select("title description actionTaken marksLost scoreAfter status occurredAt category"),
    ]);
    const classMarks = classPapers.length
      ? await Mark.find({ school: student.school, assessment: { $in: classPapers.map((item) => item._id) } }).select("assessment student score attended absenceReason comment")
      : [];
    const markMap = new Map(classMarks.map((mark) => [`${mark.assessment}:${mark.student}`, mark]));
    const inYear = (item) => {
      const recorded = paperYear(item);
      return !recorded || recorded === year;
    };
    const midterm = {};
    ["1", "2", "3"].forEach((key) => {
      const chosen = classPapers.filter((item) => String(item.term || "1") === key && inYear(item) && item.type !== "exam");
      midterm[key] = parentClassList(chosen, classmates, markMap);
    });
    const ownByPaper = new Map(ownMarks.filter((row) => row.assessment).map((row) => [String(row.assessment._id), row]));
    const followUp = classPapers.filter(inYear).map((item) => {
      const saved = ownByPaper.get(String(item._id)) || markMap.get(`${item._id}:${student._id}`);
      const recorded = Boolean(saved);
      const missed = recorded && saved.attended === false;
      return {
        id: `${item._id}:${student._id}`,
        subject: item.subject?.name || "",
        title: item.title,
        kind: item.type === "exam" ? "exam" : "assessment",
        date: item.date || null,
        term: String(item.term || "1"),
        year: paperYear(item),
        maxScore: Number(item.maxScore) || 0,
        score: recorded ? Number(saved.score) : null,
        comment: recorded && !missed ? saved.comment || "" : "",
        status: !recorded ? "missing" : missed ? "absent" : "attended",
        reason: missed ? saved.absenceReason || "" : "",
      };
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0) || String(a.subject).localeCompare(String(b.subject)));
    const papers = ownMarks
      .filter((row) => row.assessment)
      .map((row) => ({
        id: row._id,
        title: row.assessment.title,
        subject: row.assessment.subject?.name || "",
        type: row.assessment.type,
        date: row.assessment.date || null,
        term: row.assessment.term || "1",
        year: paperYear(row.assessment),
        score: Number(row.score),
        maxScore: Number(row.assessment.maxScore) || 0,
        attended: row.attended !== false,
        reason: row.attended === false ? row.absenceReason || "" : "",
        comment: row.comment || "",
      }))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0) || String(a.subject).localeCompare(String(b.subject)));
    const maxFor = (key, academicYear) => {
      const found = termRows.find((item) => item.academicYear === academicYear && disciplineTermKey(item.term) === key);
      const max = Number(found?.maxMarks);
      return Number.isFinite(max) && max > 0 ? max : 40;
    };
    const years = [...new Set(scoreRows.map((row) => row.academicYear).filter(Boolean))].sort().reverse();
    const discipline = (years.length ? years : [year]).map((academicYear) => {
      const mine = scoreRows.filter((row) => row.academicYear === academicYear);
      const terms = {};
      ["1", "2", "3"].forEach((key) => {
        const hit = mine.find((row) => disciplineTermKey(row.term) === key);
        const max = maxFor(key, academicYear);
        terms[key] = { score: hit ? Number(hit.score) : null, max };
      });
      const recorded = ["1", "2", "3"].filter((key) => terms[key].score != null);
      const average = recorded.length
        ? oneDecimal(recorded.reduce((sum, key) => sum + (terms[key].score / terms[key].max) * 40, 0) / recorded.length)
        : null;
      const percent = average == null ? null : oneDecimal((average / 40) * 100);
      return { year: academicYear, terms, average, percent, reached: percent == null ? null : percent >= 50 };
    });
    const now = new Date();
    const brief = schoolBrief(school);
    res.json({
      success: true,
      year,
      student: {
        id: student._id,
        fullName: student.fullName,
        studentCode: student.studentCode,
        className: student.classRoom?.name || "",
        academicYear: student.academicYear || year,
        photoUrl: student.photoUrl || "",
      },
      school: { ...brief, location: school.location || {} },
      fees: charges.filter((row) => row.accountGroup === "fee").map(presentCharge),
      materials: charges.filter((row) => row.accountGroup === "material").map(presentCharge),
      midterm,
      followUp,
      discipline,
      cases: cases.map((item) => ({
        id: item._id,
        title: item.title,
        description: item.description || "",
        actionTaken: item.actionTaken || "",
        marksLost: Number(item.marksLost) || 0,
        scoreAfter: item.scoreAfter == null ? null : Number(item.scoreAfter),
        status: item.status,
        occurredAt: item.occurredAt,
        category: item.category || "",
      })),
      assessments: papers.filter((row) => row.type !== "exam"),
      examinations: papers.filter((row) => row.type === "exam"),
      events: events.map((item) => ({
        id: item._id,
        title: item.title,
        venue: item.venue || "",
        description: item.description || "",
        startsAt: item.startsAt,
        endsAt: item.endsAt || null,
      })),
      announcements: announcements
        .filter((item) => !item.expiresAt || item.expiresAt >= now)
        .map((item) => ({
          id: item._id,
          title: item.title,
          body: item.body,
          createdAt: item.createdAt,
        })),
      circle: await parentCircle(student),
    });
  })
);

const parentChatHits = new Map();
const parentTypingHits = new Map();

function allowParentTyping(ip) {
  const now = Date.now();
  const recent = (parentTypingHits.get(ip) || []).filter((stamp) => now - stamp < 60000);
  if (recent.length >= 90) {
    parentTypingHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  parentTypingHits.set(ip, recent);
  return true;
}

function allowParentChat(ip) {
  const now = Date.now();
  const recent = (parentChatHits.get(ip) || []).filter((stamp) => now - stamp < 60000);
  if (recent.length >= 80) {
    parentChatHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  parentChatHits.set(ip, recent);
  return true;
}

async function parentByCode(code) {
  const value = String(code || "").trim();
  if (!value || value.length > 40) throw new ApiError(400, "Enter the student code.");
  const students = await Student.find({
    isActive: true,
    studentCode: new RegExp(`^${escapeCode(value)}$`, "i"),
  }).select("fullName studentCode school classRoom academicYear").limit(2);
  if (!students.length) throw new ApiError(404, "No student has this code.");
  if (students.length > 1) throw new ApiError(409, "This code matches more than one student.");
  return students[0];
}

async function ensureFamilyThread(student) {
  const staff = await User.find({
    school: student.school,
    isActive: { $ne: false },
    role: { $in: ["school_admin", "teacher", "dos", "discipline", "accountant"] },
  }).select("_id");
  if (!staff.length) throw new ApiError(404, "This school has no staff to message yet.");
  const key = `family:${student._id}`;
  const members = staff.map((person) => person._id);
  let thread = await ChatThread.findOne({ memberKey: key });
  if (!thread) {
    try {
      thread = await ChatThread.create({
        memberKey: key,
        kind: "family",
        title: student.fullName,
        school: student.school,
        student: student._id,
        members,
        lastAt: new Date(),
      });
    } catch (err) {
      if (err && err.code === 11000) thread = await ChatThread.findOne({ memberKey: key });
      else throw err;
    }
  } else if (thread) {
    thread.members = members;
    thread.kind = "family";
    thread.title = student.fullName;
    thread.student = student._id;
    await thread.save();
  }
  return thread;
}

const FAMILY_TYPING_MS = 4500;
const FAMILY_ACTIVE_MS = 70000;

function familyRoom(thread, staff) {
  const now = Date.now();
  const typing = (thread?.typing || [])
    .filter((row) => row.user && row.at && now - new Date(row.at).getTime() < FAMILY_TYPING_MS)
    .map((row) => {
      const person = staff.find((user) => String(user._id) === String(row.user));
      return person ? { id: String(person._id), name: person.fullName } : null;
    })
    .filter(Boolean);
  const activeCount = staff.filter((user) => user.lastSeenAt && now - new Date(user.lastSeenAt).getTime() < FAMILY_ACTIVE_MS).length;
  return { typing, activeCount, offlineCount: Math.max(staff.length - activeCount, 0) };
}

async function parentCircle(student) {
  const classId = student.classRoom && (student.classRoom._id || student.classRoom);
  const classmates = classId
    ? await Student.find({
        school: student.school,
        classRoom: classId,
        isActive: true,
        ...(student.academicYear ? { academicYear: student.academicYear } : {}),
      }).select("fullName photoUrl").sort({ fullName: 1 }).limit(80)
    : [{ _id: student._id, fullName: student.fullName }];
  const threads = classmates.length
    ? await ChatThread.find({ memberKey: { $in: classmates.map((row) => `family:${row._id}`) } }).select("memberKey guestSeenAt")
    : [];
  const seenAt = new Map(threads.map((thread) => [thread.memberKey, thread.guestSeenAt]));
  const now = Date.now();
  const students = classmates.map((row) => {
    const seen = seenAt.get(`family:${row._id}`);
    const mine = String(row._id) === String(student._id);
    return {
      id: row._id,
      name: row.fullName,
      photoUrl: row.photoUrl || "",
      mine,
      active: mine || Boolean(seen && now - new Date(seen).getTime() < FAMILY_ACTIVE_MS),
    };
  });
  const staff = await familyStaff(student.school);
  return {
    students,
    staff: staff
      .map((person) => ({
        id: person._id,
        name: person.fullName,
        role: person.role,
        active: Boolean(person.lastSeenAt && now - new Date(person.lastSeenAt).getTime() < FAMILY_ACTIVE_MS),
      }))
      .sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name)),
  };
}

async function familyStaff(schoolId) {
  return User.find({
    school: schoolId,
    isActive: { $ne: false },
    role: { $in: ["school_admin", "teacher", "dos", "discipline", "accountant"] },
  }).select("fullName role lastSeenAt");
}

function presentFamilyMessage(message, viewerId) {
  const staff = Boolean(message.sender);
  const guestId = message.guestStudent && (message.guestStudent._id || message.guestStudent);
  const mine = guestId ? String(guestId) === String(viewerId) : !staff;
  return {
    id: message._id,
    body: message.unsent ? "" : message.body,
    unsent: Boolean(message.unsent),
    mine,
    senderName: mine ? "" : (staff ? message.sender?.fullName || "" : message.guestName || ""),
    senderRole: staff ? message.sender?.role || "" : (message.guestName && !mine ? "parent" : ""),
    createdAt: message.createdAt,
  };
}

async function openParentChannel(student, target, creating) {
  const value = String(target || "general").trim();
  if (!value || value === "general") {
    const key = `family:${student._id}`;
    const thread = creating ? await ensureFamilyThread(student) : await ChatThread.findOne({ memberKey: key });
    return { mode: "general", thread, label: "General" };
  }
  const splitAt = value.indexOf(":");
  const kind = splitAt >= 0 ? value.slice(0, splitAt) : "";
  const id = splitAt >= 0 ? value.slice(splitAt + 1) : "";
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Choose a conversation");
  if (kind === "staff") {
    const person = await User.findOne({
      _id: id,
      school: student.school,
      isActive: { $ne: false },
      role: { $in: ["school_admin", "teacher", "dos", "discipline", "accountant"] },
    }).select("fullName role");
    if (!person) throw new ApiError(404, "That conversation is not available");
    const key = `family:${student._id}:with:${person._id}`;
    let thread = await ChatThread.findOne({ memberKey: key });
    if (!thread && creating) {
      try {
        thread = await ChatThread.create({
          memberKey: key,
          kind: "family",
          title: student.fullName,
          school: student.school,
          student: student._id,
          withUser: person._id,
          members: [person._id],
          lastAt: new Date(),
        });
      } catch (err) {
        if (err && err.code === 11000) thread = await ChatThread.findOne({ memberKey: key });
        else throw err;
      }
    }
    return { mode: "staff", thread, person, label: person.fullName };
  }
  if (kind === "student") {
    if (String(id) === String(student._id)) throw new ApiError(400, "Choose a conversation");
    const classId = student.classRoom && (student.classRoom._id || student.classRoom);
    const other = await Student.findOne({
      _id: id,
      school: student.school,
      isActive: true,
      ...(classId ? { classRoom: classId } : {}),
      ...(student.academicYear ? { academicYear: student.academicYear } : {}),
    }).select("fullName");
    if (!other) throw new ApiError(404, "That conversation is not available");
    const pair = [String(student._id), String(other._id)].sort();
    const key = `pair:${pair[0]}:${pair[1]}`;
    let thread = await ChatThread.findOne({ memberKey: key });
    if (!thread && creating) {
      try {
        thread = await ChatThread.create({
          memberKey: key,
          kind: "family",
          title: other.fullName,
          school: student.school,
          student: student._id,
          members: [],
          lastAt: new Date(),
        });
      } catch (err) {
        if (err && err.code === 11000) thread = await ChatThread.findOne({ memberKey: key });
        else throw err;
      }
    }
    return { mode: "student", thread, person: other, label: other.fullName };
  }
  throw new ApiError(400, "Choose a conversation");
}

function channelTyping(channel, student) {
  if (!channel.thread) return [];
  const now = Date.now();
  if (channel.mode === "student") {
    const typer = channel.thread.guestTypingStudent;
    const fresh = channel.thread.guestTypingAt && now - new Date(channel.thread.guestTypingAt).getTime() < FAMILY_TYPING_MS;
    if (typer && String(typer) !== String(student._id) && fresh) {
      return [{ id: String(typer), name: channel.person?.fullName || "" }];
    }
    return [];
  }
  return null;
}

router.get(
  "/parent/chat",
  asyncHandler(async (req, res) => {
    if (!allowParentChat(req.ip || "local")) throw new ApiError(429, "Wait a moment, then try the student code again.");
    const student = await parentByCode(req.query.code);
    const channel = await openParentChannel(student, req.query.with, false);
    const thread = channel.thread;
    const staff = channel.mode === "general" ? await familyStaff(student.school) : [];
    const room = familyRoom(thread, staff);
    const rows = thread
      ? await ChatMessage.find({ thread: thread._id }).sort({ createdAt: 1 }).limit(300).populate("sender", "fullName role")
      : [];
    await ChatThread.updateOne({ memberKey: `family:${student._id}` }, { $set: { guestSeenAt: new Date() } });
    if (thread) {
      if (channel.mode === "student") {
        await ChatMessage.updateMany(
          { thread: thread._id, guestStudent: { $ne: student._id }, status: "sent" },
          { $set: { status: "read", readAt: new Date() } }
        );
      } else {
        await ChatMessage.updateMany(
          { thread: thread._id, sender: { $ne: null }, status: "sent" },
          { $set: { status: "read", readAt: new Date() } }
        );
        if (thread.lastSender) {
          thread.lastStatus = "read";
          await thread.save();
        }
      }
    }
    const directTyping = channelTyping(channel, student);
    res.json({
      success: true,
      title: channel.label,
      mode: channel.mode,
      items: rows.map((row) => presentFamilyMessage(row, student._id)),
      typing: directTyping || room.typing,
      activeCount: room.activeCount,
      offlineCount: room.offlineCount,
      circle: await parentCircle(student),
    });
  })
);

router.post(
  "/parent/chat/typing",
  asyncHandler(async (req, res) => {
    if (!allowParentTyping(req.ip || "local")) throw new ApiError(429, "Wait a moment, then try the student code again.");
    const student = await parentByCode(req.body?.code || req.query.code);
    const channel = await openParentChannel(student, req.body?.with || req.query.with, false);
    if (channel.thread) {
      channel.thread.guestTypingAt = new Date();
      channel.thread.guestTypingStudent = student._id;
      await channel.thread.save();
    }
    res.json({ success: true });
  })
);

router.post(
  "/parent/chat",
  asyncHandler(async (req, res) => {
    if (!allowParentChat(req.ip || "local")) throw new ApiError(429, "Wait a moment, then try the student code again.");
    const student = await parentByCode(req.body?.code || req.query.code);
    const body = String(req.body?.body || "").trim();
    if (!body) throw new ApiError(400, "Write a message");
    if (body.length > 2000) throw new ApiError(400, "Keep the message under 2000 characters");
    const channel = await openParentChannel(student, req.body?.with || req.query.with, true);
    const thread = channel.thread;
    const message = await ChatMessage.create({
      thread: thread._id,
      guestName: student.fullName,
      guestStudent: student._id,
      body,
      kind: "text",
      status: "sent",
    });
    thread.lastBody = body.replace(/\s+/g, " ").slice(0, 180);
    thread.lastAt = message.createdAt;
    thread.lastSender = null;
    thread.lastStatus = "sent";
    thread.guestTypingAt = null;
    thread.guestTypingStudent = null;
    await thread.save();
    res.status(201).json({ success: true, message: presentFamilyMessage(message, student._id) });
  })
);

module.exports = router;
