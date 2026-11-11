const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { authRequired } = require("../middleware/auth");
const { singleFile } = require("../middleware/upload");
const cloudinary = require("../services/cloudinary");

const router = express.Router();
router.use(authRequired);

router.post(
  "/",
  singleFile("file"),
  asyncHandler(async (req, res) => {
    if (!cloudinary.configured()) {
      throw new ApiError(500, "Cloudinary is not configured on the server");
    }
    if (!req.file) throw new ApiError(400, "Choose a photo or short video");
    const folder = String(req.query.folder || "general").replace(/[^a-z0-9_-]/gi, "");
    const result = await cloudinary.uploadBuffer(req.file, folder || "general");
    res.status(201).json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
    });
  })
);

module.exports = router;
