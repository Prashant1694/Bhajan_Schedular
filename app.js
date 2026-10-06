// ============================================================
// BHAJAN SCHEDULER - Node.js + Express + SQLite
// Sri Sathya Sai Seva Organisation - Gandhinagar
// Native App Shell & Persistent Tabs v3.5
// ============================================================

require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  console.error("FATAL: In production, SESSION_SECRET environment variable must be set with at least 32 characters.");
  process.exit(1);
}

const express = require('express');
const expressLayouts = require("express-ejs-layouts");
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sequelize = require('./config/database');

const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'Sessions',
  checkExpirationInterval: 15 * 60 * 1000, // Automatically prune expired sessions every 15 min
  expiration: 90 * 24 * 60 * 60 * 1000     // 90 days persistent devotee session duration
});

// Ensure session table exists in SQLite
sessionStore.sync();

const { securityHeaders, blockCrossSiteWrites, generalWriteLimit, sanitizeInputs } = require("./middleware/security");
const { doubleCsrfProtection, generateToken } = require("./middleware/csrfProtection");
const {initializeDatabase} = require("./services/databaseInitializer");

// ============================================================
// EXPRESS APP SETUP
// ============================================================

const app = express();
const PORT = process.env.PORT || 8000;
// configure layout
app.use(expressLayouts);
app.set("layout", "layouts/main")
// Configure EJS Templating Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.set("trust proxy", 1);
app.disable("x-powered-by");

// Request ID tracking
app.use((req, res, next) => {
  const reqId = req.headers["x-request-id"] || crypto.randomUUID();
  req.id = reqId;
  res.setHeader("X-Request-Id", reqId);
  res.locals.requestId = reqId;
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  next();
});

app.use(cookieParser(process.env.SESSION_SECRET || "bhajan-planner-session-secret-gandhinagar-2026"));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "same-origin" }
}));

app.use(securityHeaders);
// Reject oversized payloads before they can consume server resources.
app.use(express.urlencoded({ extended: true, limit: "100kb", parameterLimit: 100 }));
app.use(express.json({ limit: "100kb" }));
app.use(sanitizeInputs);
app.use(blockCrossSiteWrites);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/activity/")) return next();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return generalWriteLimit(req, res, next);
  next();
});

// Static Files
app.use(express.static("public"));

// Official Music Sheets PDF Storage
app.use("/sheets", express.static(path.join(__dirname, "public", "sheets")));

// Submission and admin pages contain time-sensitive data. Do not allow Chrome
// to restore an old form from its back/forward cache when navigating back.
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Session Setup with persistent SQLite storage (no MemoryStore leak)
app.use(session({
  secret: process.env.SESSION_SECRET || 'bhajan-planner-session-secret-gandhinagar-2026',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 90 * 24 * 60 * 60 * 1000 // 90-day persistent session
  }
}));

app.use(doubleCsrfProtection);

const { trackActivity } = require("./middleware/activityTracker");
app.use(trackActivity);

const { attachSinger } = require("./middleware/singerAuth");
app.use(attachSinger);

const BhajanReport = require("./models/BhajanReport");

const ADMIN_PATH_PREFIXES = [
  "/admin",           // /admin, /admin/*, /admin/admin-users/*
  "/admin-login",
  "/forgot-password", // login-recovery flow shares the admin visual language
  "/master-bank",
  "/admin/reports",
];

const { getCachedMissingCount } = require("./services/helpers");

app.use(async (req, res, next) => {
  try {
    res.locals.csrfToken = typeof req.csrfToken === "function" ? req.csrfToken() : generateToken(req, res);
  } catch (_) {
    res.locals.csrfToken = "";
  }
  res.locals.currentAdmin = req.session.admin || null;
  res.locals.page = "";
  res.locals.pageTitle = "Bhajan Planner";
  res.locals.pageCSS = null;
  res.locals.pageJS = null;
  res.locals.showLoader = false;
  // Embed mode: page is rendered inside the app shell iframe — suppress chrome
  res.locals._embed = req.query._embed === '1' || req.query.embed === '1' || req.headers['sec-fetch-dest'] === 'iframe';
  res.locals.isAdminPage = ADMIN_PATH_PREFIXES.some((prefix) =>
    req.path === prefix || req.path.startsWith(prefix + "/")
  );
  if (res.locals.isAdminPage && req.session && req.session.admin) {
    try {
      res.locals.missingCount = await getCachedMissingCount();
      res.locals.pendingReportCount = await BhajanReport.count({ where: { status: "pending" } });
    } catch (_) {
      res.locals.missingCount = 0;
      res.locals.pendingReportCount = 0;
    }
  } else {
    res.locals.missingCount = 0;
    res.locals.pendingReportCount = 0;
  }
  next();
});
const homeRoutes = require("./routes/home");
const plannerRoutes = require("./routes/planner");
const apiRoutes = require("./routes/api");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const masterBankRoutes = require("./routes/masterBank");
const analyticsRoutes = require("./routes/analytics");
const singerRoutes = require("./routes/singer");
const adminUserRoutes = require("./routes/adminUsers");
const notificationRoutes = require("./routes/notifications");
const bulletinRoutes = require("./routes/bulletin");
const diwaliRoutes = require("./routes/diwali");
const reportsRoutes = require("./routes/reports");
const singerHubRoutes = require("./routes/singerHub");

app.use("/", homeRoutes);
app.use("/", plannerRoutes);
app.use("/", apiRoutes);
app.use("/", authRoutes);
app.use("/", adminRoutes);
app.use("/", masterBankRoutes);
app.use("/", analyticsRoutes);
app.use("/", singerRoutes);
app.use("/", adminUserRoutes);
app.use("/", notificationRoutes);
app.use("/", bulletinRoutes);
app.use("/", diwaliRoutes);
app.use("/", reportsRoutes);
app.use("/", singerHubRoutes);

// CSRF token error handler
app.use((error, req, res, next) => {
  if (error && (error.code === "EBADCSRFTOKEN" || error.message === "invalid csrf token")) {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes("json")) || req.path.startsWith("/api/");
    if (isJson) {
      return res.status(403).json({ error: "Invalid or missing CSRF token. Please refresh the page and try again." });
    }
    return res.status(403).send("Security token expired or invalid. Please refresh the page and try again.");
  }
  next(error);
});

// Do not expose stack traces or database details to visitors.
app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).send("Request payload is too large.");
  }
  console.error(`[${req.id || 'NO-REQ-ID'}] Unhandled request error:`, error);
  const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes("json")) || req.path.startsWith("/api/");
  if (isJson) {
    return res.status(500).json({ error: "Something went wrong. Please try again later." });
  }
  res.status(500).send("Something went wrong. Please try again later.");
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(
        `🕉️ Sai Ram! Bhajan Scheduler is running on http://localhost:${PORT}`,
      );

      console.log(`📋 Submit Form: http://localhost:${PORT}/submit-form`);

      console.log(`📊 Plan View: http://localhost:${PORT}/plan-view`);

      console.log(`🛠️ Admin Dashboard: http://localhost:${PORT}/admin`);
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);

    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
