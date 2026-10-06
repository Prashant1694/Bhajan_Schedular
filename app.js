// ============================================================
// BHAJAN SCHEDULER - Node.js + Express + SQLite
// Sri Sathya Sai Seva Organisation - Gandhinagar
// Native App Shell & Persistent Tabs v3.5
// ============================================================

require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const express = require('express');
const expressLayouts = require("express-ejs-layouts");
const path = require('path');
const crypto = require('crypto');
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

// Do not expose stack traces or database details to visitors.
app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).send("Request payload is too large.");
  }
  console.error("Unhandled request error:", error);
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
