const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

module.exports = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ishuri",
  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  clientUrl: process.env.CLIENT_URL || "*",
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || "admin@ishuri.rw",
    password: process.env.SEED_ADMIN_PASSWORD || "IshuriAdmin@2026",
  },
  dsc: {
    baseUrl: process.env.DSC_API_BASE || "https://bulksms.digitalservicescenter.rw/api/v2",
    apiKey: process.env.DSC_API_KEY || "",
    username: process.env.DSC_USERNAME || "",
    password: process.env.DSC_PASSWORD || "",
    enabled: process.env.SMS_ENABLED === "true",
  },
  sms: {
    wholesaleRate: Number(process.env.SMS_WHOLESALE_RATE_RWF) || 6,
    retailRate: Number(process.env.SMS_RETAIL_RATE_RWF) || 11,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
};
