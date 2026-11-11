const cloudinary = require("cloudinary").v2;
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

function configured() {
  return Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);
}

if (configured()) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

function uploadBuffer(file, folder = "general") {
  if (!configured()) {
    throw new ApiError(500, "Cloudinary is not configured");
  }
  if (!file?.buffer) throw new ApiError(400, "No file received");

  const mime = String(file.mimetype || "");
  const name = String(file.originalname || "");
  const looksVideo = mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi)$/i.test(name);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `ishuri/${folder}`,
        resource_type: looksVideo ? "video" : "auto",
        overwrite: false,
        timeout: 120000,
      },
      (err, result) => {
        if (err) {
          return reject(new ApiError(502, err.message || "Cloudinary upload failed"));
        }
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });
}

module.exports = { uploadBuffer, configured };
