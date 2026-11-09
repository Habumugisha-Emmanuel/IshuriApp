const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { SubscriptionPlan, School } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");
const router = express.Router();

router.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const items = await SubscriptionPlan.find({ isActive: true }).sort({ monthlyPriceRwf: 1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/plans",
  authRequired,
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const item = await SubscriptionPlan.create(req.body);
    res.status(201).json({ success: true, item });
  })
);

router.post(
  "/assign",
  authRequired,
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const { schoolId, planId, months = 12 } = req.body;
    const plan = await SubscriptionPlan.findById(planId);
    const school = await School.findById(schoolId);
    if (!plan || !school) throw new ApiError(404, "Plan or school not found");
    const startsAt = new Date();
    const endsAt = new Date();
    endsAt.setMonth(endsAt.getMonth() + Number(months));
    school.subscription = { plan: plan._id, status: "active", startsAt, endsAt };
    await school.save();
    res.json({ success: true, school, plan });
  })
);

router.get(
  "/mine",
  authRequired,
  requireRoles("school_admin"),
  requireSchoolScope,
  asyncHandler(async (req, res) => {
    const school = await School.findById(req.user.school).populate("subscription.plan");
    res.json({ success: true, subscription: school.subscription, smsBalance: school.smsBalance });
  })
);

module.exports = router;
