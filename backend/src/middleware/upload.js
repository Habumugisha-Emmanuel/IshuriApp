const multer = require("multer");
const ApiError = require("../utils/ApiError");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "").toLowerCase();
    const okMime = /^(image|video)\//.test(mime) || mime === "application/octet-stream";
    const okName = /\.(jpe?g|png|gif|webp|heic|heif|mp4|mov|m4v|webm|avi)$/i.test(name);
    if (okMime || okName) return cb(null, true);
    cb(new ApiError(400, "Only image and video uploads are allowed"));
  },
});

function singleFile(field = "file") {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "File is too large. Use an image or a clip under 40MB."));
        }
        return next(new ApiError(400, err.message));
      }
      return next(err);
    });
  };
}

module.exports = { upload, singleFile };
