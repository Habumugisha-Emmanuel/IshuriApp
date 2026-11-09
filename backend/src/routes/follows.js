const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ success: true, items: [] });
  })
);

router.post(
  "/:schoolId",
  asyncHandler(async () => {
    throw new ApiError(403, "Following schools is not available. Browse public school profiles without an account.");
  })
);

router.delete(
  "/:schoolId",
  asyncHandler(async () => {
    throw new ApiError(403, "Following schools is not available");
  })
);

module.exports = router;
