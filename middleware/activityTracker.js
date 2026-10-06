const crypto = require("crypto");
const { Sequelize } = require("sequelize");
const ActivityLog = require("../models/ActivityLog");
const UserPresence = require("../models/UserPresence");

// Automatic Log Retention Cleanup Routine (Runs every 12 hours)
// Purges logs older than 30 days and presence records older than 7 days
setInterval(async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await ActivityLog.destroy({
      where: {
        created_at: { [Sequelize.Op.lt]: thirtyDaysAgo }
      }
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await UserPresence.destroy({
      where: {
        last_seen_at: { [Sequelize.Op.lt]: sevenDaysAgo }
      }
    });
  } catch (err) {
    // Silent background cleanup error handling
  }
}, 12 * 60 * 60 * 1000);

function getSectionName(urlPath) {
  if (urlPath === "/" || urlPath.startsWith("/submit-form")) return "Submit Form";
  if (urlPath.startsWith("/master-bank")) return "Master Bhajan Bank";
  if (urlPath.startsWith("/plan-view") || urlPath.startsWith("/live")) return "Live Plan & Share";
  if (urlPath.startsWith("/my-hub") || urlPath.startsWith("/singer/hub")) return "Singer Hub";
  if (urlPath.startsWith("/singer/login")) return "Singer Login";
  if (urlPath.startsWith("/admin/activity-logs")) return "Activity Monitor";
  if (urlPath.startsWith("/admin/admin-users")) return "Admin Management";
  if (urlPath.startsWith("/admin/singers") || urlPath.startsWith("/admin/singer-dictionary")) return "Singer Directory";
  if (urlPath.startsWith("/admin/rules")) return "Deity Rules";
  if (urlPath.startsWith("/admin/analytics")) return "Analytics";
  if (urlPath.startsWith("/admin/missing-bhajans")) return "Missing Catcher";
  if (urlPath.startsWith("/admin")) return "Admin Dashboard";
  if (urlPath.startsWith("/api/singer/songbook")) return "Singer Repertoire";
  if (urlPath.startsWith("/api")) return "API System";
  return "General";
}

function getActionDetails(req, section, username, userType) {
  const path = req.path;
  const method = req.method;
  const body = req.body || {};

  if (method === "POST") {
    if (path.includes("submit-form") || path.includes("submit")) {
      const bhajan = body.bhajan_name || body.bhajanName || "Bhajan";
      const deity = body.deity ? ` for ${body.deity}` : "";
      return {
        action: "SUBMIT_BHAJAN",
        details: `${username} submitted "${bhajan}"${deity}`
      };
    }
    if (path.includes("/api/singer/login") || path.includes("/login")) {
      return {
        action: "USER_LOGIN",
        details: `${username} logged in successfully`
      };
    }
    if (path.includes("/singer/logout") || path.includes("/logout")) {
      return {
        action: "USER_LOGOUT",
        details: `${username} logged out`
      };
    }
    if (path.includes("/api/singer/songbook/toggle") || path.includes("/api/singer/songbook")) {
      return {
        action: "UPDATE_SONGBOOK",
        details: `${username} updated their saved repertoire`
      };
    }
    if (path.includes("/api/singer/profile/scale")) {
      return {
        action: "UPDATE_SCALE",
        details: `${username} set preferred pitch scale to ${body.preferred_scale || 'default'}`
      };
    }
    if (path.includes("/api/singer/change-pin")) {
      return {
        action: "CHANGE_PIN",
        details: `${username} updated their security PIN`
      };
    }
    if (path.includes("reorder")) {
      return {
        action: "REORDER_SESSION",
        details: `${username} rearranged bhajan lineup order`
      };
    }
    if (path.includes("toggle-lock")) {
      return {
        action: "TOGGLE_LOCK",
        details: `${username} toggled session lineup lock`
      };
    }
    if (path.includes("update-rules")) {
      return {
        action: "UPDATE_RULES",
        details: `${username} updated deity allocation & session rules`
      };
    }
    if (path.includes("add-singer")) {
      return {
        action: "ADD_SINGER",
        details: `${username} added new singer "${body.name || ''}"`
      };
    }
    if (path.includes("edit-singer") || path.includes("singers/")) {
      return {
        action: "EDIT_SINGER",
        details: `${username} edited singer profile`
      };
    }
    if (path.includes("master")) {
      return {
        action: "MODIFY_MASTER_BANK",
        details: `${username} updated Master Bhajan Bank entry`
      };
    }
    return {
      action: `POST_${path.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 25).toUpperCase()}`,
      details: `${username} performed action on ${section}`
    };
  }

  // GET Requests
  return {
    action: `VIEW_${section.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase()}`,
    details: `${username} visited ${section}`
  };
}

const trackActivity = async (req, res, next) => {
  try {
    const path = req.path || "";
    // Filter out static assets, service worker, telemetry polls, unread badge counters
    if (
      path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/i) ||
      path.startsWith("/css/") ||
      path.startsWith("/js/") ||
      path.startsWith("/api/activity/") ||
      path.startsWith("/api/notifications/") ||
      path.startsWith("/socket.io/") ||
      path.includes("/pin-status")
    ) {
      return next();
    }

    if (!req.session) return next();
    if (!req.session.visitorId) {
      req.session.visitorId = "sess_" + crypto.randomBytes(8).toString("hex");
    }

    const sessionId = req.session.visitorId;
    let userType = "guest";
    let adminId = null;
    let username = "Guest Devotee";

    // 1. Check Admin Session
    if (req.session.admin) {
      const admin = req.session.admin;
      userType = (admin.role === "super_admin" || admin.role === "SUPER_ADMIN") ? "super_admin" : "admin";
      adminId = admin.id;
      const titleStr = admin.title ? ` (${admin.title})` : "";
      username = (admin.display_name || admin.username || "Admin") + titleStr;
    }
    // 2. Check Singer Session
    else if (req.session.singer && req.session.singer.name) {
      userType = "singer";
      username = req.session.singer.name;
    }
    // 3. Check Form submission body if anonymous but submitted by named singer
    else if (req.body && req.body.singer_name && typeof req.body.singer_name === "string" && req.body.singer_name.trim().length > 1) {
      userType = "singer";
      username = req.body.singer_name.trim();
    }

    // Skip high-frequency read pings if not changing pages
    const section = getSectionName(path);
    const { action, details } = getActionDetails(req, section, username, userType);

    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "127.0.0.1";
    const userAgent = (req.headers["user-agent"] || "").slice(0, 250);

    // Update Live Presence
    await UserPresence.upsert({
      session_id: sessionId,
      admin_id: adminId,
      username: username,
      user_type: userType,
      current_page: req.originalUrl || path,
      last_section: section,
      ip_address: ip,
      last_seen_at: new Date()
    });

    // Create Activity Log
    await ActivityLog.create({
      session_id: sessionId,
      user_type: userType,
      admin_id: adminId,
      username: username,
      action: action,
      section: section,
      page_url: req.originalUrl || path,
      method: req.method,
      ip_address: ip,
      user_agent: userAgent,
      duration_seconds: 0,
      details: details
    });
  } catch (err) {
    // Non-blocking logging
  }

  next();
};

module.exports = {
  trackActivity,
  getSectionName
};

