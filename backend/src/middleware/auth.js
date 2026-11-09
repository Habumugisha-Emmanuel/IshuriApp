const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { User } = require("../models");

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, school: user.school ? user.school.toString() : null },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new ApiError(401, "Authentication required");
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) throw new ApiError(401, "Account is inactive or missing");
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, "Invalid or expired session"));
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  jwt.verify(token, env.jwtSecret, async (err, payload) => {
    if (err) return next();
    const user = await User.findById(payload.id);
    if (user && user.isActive) req.user = user;
    next();
  });
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, "Authentication required"));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "You do not have permission for this action"));
    }
    next();
  };
}

function requireSchoolScope(req, res, next) {
  if (req.user.role === "super_admin") return next();
  if (!req.user.school) return next(new ApiError(403, "No school is attached to this account"));
  req.schoolId = req.user.school.toString();
  next();
}

module.exports = { signToken, authRequired, optionalAuth, requireRoles, requireSchoolScope };
