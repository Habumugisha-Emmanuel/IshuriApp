const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { StockItem, StockMovement } = require("../models");
const { authRequired, requireRoles, requireSchoolScope } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired, requireSchoolScope, requireRoles("school_admin"));

router.get(
  "/items",
  asyncHandler(async (req, res) => {
    const items = await StockItem.find({ school: req.user.school, isActive: true }).sort({ name: 1 });
    res.json({ success: true, items });
  })
);

router.post(
  "/items",
  asyncHandler(async (req, res) => {
    const item = await StockItem.create({ ...req.body, school: req.user.school });
    res.status(201).json({ success: true, item });
  })
);

router.patch(
  "/items/:id",
  asyncHandler(async (req, res) => {
    const item = await StockItem.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      req.body,
      { new: true }
    );
    res.json({ success: true, item });
  })
);

router.post(
  "/movements",
  asyncHandler(async (req, res) => {
    const { itemId, type, quantity, reason, reference } = req.body;
    const item = await StockItem.findOne({ _id: itemId, school: req.user.school });
    if (!item) throw new ApiError(404, "Stock item not found");
    const qty = Number(quantity);
    if (!qty || qty <= 0) throw new ApiError(400, "Quantity must be greater than 0");
    if (type === "out" && item.quantity < qty) throw new ApiError(400, "Not enough stock on hand");
    item.quantity += type === "in" ? qty : -qty;
    await item.save();
    const movement = await StockMovement.create({
      school: req.user.school,
      item: item._id,
      type,
      quantity: qty,
      reason,
      reference,
      recordedBy: req.user._id,
    });
    res.status(201).json({ success: true, item, movement });
  })
);

router.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const items = await StockMovement.find({ school: req.user.school })
      .populate("item", "name unit")
      .populate("recordedBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, items });
  })
);

module.exports = router;
