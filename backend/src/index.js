const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const env = require("./config/env");
const { connectDb } = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth");
const publicRoutes = require("./routes/public");
const schoolRoutes = require("./routes/schools");
const staffRoutes = require("./routes/staff");
const academicRoutes = require("./routes/academics");
const studentRoutes = require("./routes/students");
const markRoutes = require("./routes/marks");
const disciplineRoutes = require("./routes/discipline");
const contentRoutes = require("./routes/content");
const smsRoutes = require("./routes/sms");
const subscriptionRoutes = require("./routes/subscriptions");
const adRoutes = require("./routes/ads");
const followRoutes = require("./routes/follows");
const uploadRoutes = require("./routes/uploads");
const adminRoutes = require("./routes/admin");
const chatRoutes = require("./routes/chat");

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.clientUrl === "*" ? true : env.clientUrl }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", env.uploadDir))
);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    name: "IshuriApp API",
    time: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/academics", academicRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/marks", markRoutes);
app.use("/api/discipline", disciplineRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/ads", adRoutes);
app.use("/api/follows", followRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);

app.use(notFound);
app.use(errorHandler);

connectDb()
  .then(() => {
    app.listen(env.port, "0.0.0.0", () => {
      const cloudinary = require("./services/cloudinary");
      console.log(`IshuriApp API listening on http://localhost:${env.port}`);
      console.log(`Cloudinary: ${cloudinary.configured() ? "ready" : "missing credentials"}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start", err);
    process.exit(1);
  });
