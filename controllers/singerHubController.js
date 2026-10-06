const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const Singer = require("../models/Singer");
const BhajanSubmission = require("../models/BhajanSubmission");
const BhajanReport = require("../models/BhajanReport");
const MasterBhajan = require("../models/MasterBhajan");
const SingerBookmark = require("../models/SingerBookmark");
const AdminUser = require("../models/AdminUser");
const { NINETY_DAYS_MS, resolveSingerForAdmin } = require("../middleware/singerAuth");
const { getLocalDateStr } = require("../services/helpers");

// In-memory account lockout tracker (5 attempts -> 15 min lock)
const SINGER_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_SINGER_PIN_FAILURES = 5;
const singerFailedAttempts = new Map();

function getSingerLockRemaining(singerId) {
  const id = Number(singerId);
  const rec = singerFailedAttempts.get(id);
  if (!rec || !rec.lockedUntil) return 0;
  if (Date.now() < rec.lockedUntil) {
    return Math.ceil((rec.lockedUntil - Date.now()) / 1000);
  }
  singerFailedAttempts.delete(id);
  return 0;
}

function recordSingerFail(singerId) {
  const id = Number(singerId);
  const now = Date.now();
  const rec = singerFailedAttempts.get(id) || { count: 0, firstFail: now };
  rec.count += 1;
  if (rec.count >= MAX_SINGER_PIN_FAILURES) {
    rec.lockedUntil = now + SINGER_LOCKOUT_MS;
  }
  singerFailedAttempts.set(id, rec);
  return rec;
}

function clearSingerFail(singerId) {
  singerFailedAttempts.delete(Number(singerId));
}

/**
 * Show the devotee login page
 */
exports.showLoginPage = async (req, res) => {
  try {
    const singers = await Singer.findAll({
      order: [["name", "ASC"]],
      attributes: ["id", "name", "gender", "pin"]
    });

    const redirectUrl = req.query.redirect || "/submit-form";
    const isExpired = req.query.expired === "true";

    res.render("singer-login", {
      pageTitle: "Singer Verification | Bhajan Planner",
      singers: singers.map(s => ({
        id: s.id,
        name: s.name,
        gender: s.gender,
        hasPin: Boolean(s.pin)
      })),
      redirectUrl,
      isExpired,
      pageCSS: null,
      pageJS: null
    });
  } catch (error) {
    console.error("Error loading singer login page:", error);
    res.status(500).send("Unable to load singer verification page.");
  }
};

/**
 * Check if selected singer already has a PIN
 */
exports.checkSingerPinStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid singer ID" });
    }
    const singer = await Singer.findByPk(id);
    if (!singer) {
      return res.status(404).json({ error: "Singer not found" });
    }
    res.json({
      hasPin: Boolean(singer.pin),
      name: singer.name,
      gender: singer.gender
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Singer authentication / PIN creation handler
 */
exports.login = async (req, res) => {
  try {
    const { singer_id, pin, redirect } = req.body;

    if (!singer_id) {
      return res.status(400).json({ error: "Please select your name from the list." });
    }

    const numericSingerId = parseInt(singer_id, 10);
    if (isNaN(numericSingerId) || numericSingerId <= 0) {
      return res.status(400).json({ error: "Invalid singer selection." });
    }

    // Check account lockout
    const lockSec = getSingerLockRemaining(numericSingerId);
    if (lockSec > 0) {
      const mins = Math.ceil(lockSec / 60);
      return res.status(429).json({
        error: `Account is temporarily locked due to 5 consecutive incorrect PIN attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} or contact a coordinator.`
      });
    }

    const cleanPin = (pin || "").toString().trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: "Please enter a valid 4-digit numeric PIN (e.g. 1234)." });
    }

    const singer = await Singer.findByPk(numericSingerId);
    if (!singer) {
      return res.status(404).json({ error: "Singer record not found." });
    }

    const isFirstTime = !singer.pin;
    let isMatch = false;

    if (isFirstTime) {
      // First time claiming this name: hash and store new 4-digit PIN!
      const hashed = await bcrypt.hash(cleanPin, 10);
      await singer.update({
        pin: hashed,
        pin_set_at: new Date(),
        last_login_at: new Date()
      });
      isMatch = true;
    } else {
      isMatch = await bcrypt.compare(cleanPin, singer.pin);
      if (!isMatch) {
        const failRec = recordSingerFail(singer.id);
        if (failRec.lockedUntil) {
          return res.status(429).json({
            error: `Account is now temporarily locked for 15 minutes due to 5 consecutive incorrect PIN attempts. Please contact a coordinator if you forgot your PIN.`
          });
        }
        const remaining = MAX_SINGER_PIN_FAILURES - failRec.count;
        return res.status(403).json({
          error: `Incorrect 4-digit PIN for ${singer.name}. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary lock)`
        });
      }
      await singer.update({ last_login_at: new Date() });
    }

    // PIN verified: clear any failed attempts
    clearSingerFail(singer.id);

    // Save existing visitorId AND admin credentials before session regeneration
    const existingVisitorId = req.session?.visitorId;
    const existingAdmin = req.session?.admin;
    const existingAdminUserId = req.session?.adminUserId;
    const showIntro = isFirstTime || !singer.last_login_at;
    const safeRedirect = redirect && redirect.startsWith("/") ? redirect : "/submit-form";

    // Regenerate session to eliminate session fixation risks
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regeneration failed:", err);
        return res.status(500).json({ error: "Login failed. Please try again." });
      }

      if (existingVisitorId) req.session.visitorId = existingVisitorId;
      if (existingAdmin) req.session.admin = existingAdmin;
      if (existingAdminUserId) req.session.adminUserId = existingAdminUserId;

      req.session.singer = {
        id: singer.id,
        name: singer.name,
        gender: singer.gender,
        preferred_scale: singer.preferred_scale || null,
        pinVerifiedAt: Date.now()
      };
      if (showIntro) {
        req.session.showHubWelcome = true;
      }

      // If user is also an admin, automatically associate this singer to their admin user record
      if (existingAdminUserId) {
        AdminUser.update({ singer_id: singer.id }, { where: { id: existingAdminUserId } }).catch(() => {});
      }

      req.session.save(() => {
        res.json({
          success: true,
          isFirstTime,
          showIntro,
          redirect: safeRedirect,
          singer: req.session.singer
        });
      });
    });
  } catch (error) {
    console.error("Singer login failed:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
};

/**
 * The Singer Hub Dashboard (Phase 2 - Schedule, Songbook & History)
 */
exports.showHub = async (req, res) => {
  try {
    const isAdmin = Boolean(req.session && (req.session.admin || req.session.adminUserId));
    let singerSession = req.session.singer;

    if (!singerSession && isAdmin) {
      const adminId = req.session.adminUserId || req.session.admin?.id;
      const displayName = req.session.admin?.display_name || req.session.admin?.displayName;
      const username = req.session.admin?.username;
      const resolved = await resolveSingerForAdmin(adminId, displayName, username);
      if (resolved) {
        req.session.singer = {
          id: resolved.id,
          name: resolved.name,
          gender: resolved.gender,
          preferred_scale: resolved.preferred_scale || null,
          pinVerifiedAt: Date.now(),
          isAdminLinked: true
        };
        singerSession = req.session.singer;
      }
    }

    if (!singerSession) {
      delete req.session.singer;
      return res.redirect("/singer/login?redirect=/my-hub");
    }

    const singer = await Singer.findByPk(singerSession.id);
    if (!singer) {
      delete req.session.singer;
      return res.redirect("/singer/login?redirect=/my-hub");
    }

    // Calculate days remaining in 90-day verification cycle (Admins are exempt)
    const verifiedAt = singerSession.pinVerifiedAt || Date.now();
    const elapsedMs = Date.now() - verifiedAt;
    const daysRemaining = isAdmin ? 90 : Math.max(0, Math.ceil((NINETY_DAYS_MS - elapsedMs) / (24 * 60 * 60 * 1000)));

    const todayStr = getLocalDateStr();

    // 1. Upcoming active submissions for this singer (Lead or Partner)
    const upcomingSubmissions = await BhajanSubmission.findAll({
      where: {
        [Op.or]: [
          { singer_name: singer.name },
          { partner_name: singer.name }
        ],
        session_date: { [Op.gte]: todayStr }
      },
      order: [["session_date", "ASC"], ["list_order", "ASC"]]
    });

    // 2. Complete past singing history
    const pastHistory = await BhajanSubmission.findAll({
      where: {
        [Op.or]: [
          { singer_name: singer.name },
          { partner_name: singer.name }
        ],
        session_date: { [Op.lt]: todayStr }
      },
      order: [["session_date", "DESC"]]
    });

    // Deity frequency summary
    const deitySummary = {};
    pastHistory.forEach(item => {
      const d = item.deity || "Other";
      deitySummary[d] = (deitySummary[d] || 0) + 1;
    });

    // 3. Personal Songbook & Repertoire
    const songbook = await SingerBookmark.findAll({
      where: { singer_id: singer.id },
      include: [{ model: MasterBhajan, as: "masterBhajan" }],
      order: [["created_at", "DESC"]]
    });

    // 4. Reported correction tickets for this singer
    const rawReports = await BhajanReport.findAll({
      where: {
        [Op.or]: [
          { singer_id: singer.id },
          { reporter_name: singer.name },
          { visitor_id: `singer_${singer.id}` }
        ]
      },
      order: [["created_at", "DESC"]]
    });

    const myReports = rawReports.map(r => {
      const p = r.toJSON();
      try {
        p.categories = JSON.parse(p.categories);
      } catch (_) {
        p.categories = [];
      }
      return p;
    });
    const myReportsCount = myReports.length;

    // Pop the welcome modal flag if present
    const showWelcome = Boolean(req.session.showHubWelcome);
    req.session.showHubWelcome = false;

    // If admin is viewing, load all singers for the quick-switch capability
    let allSingers = [];
    if (isAdmin) {
      allSingers = await Singer.findAll({
        attributes: ["id", "name", "gender"],
        order: [["name", "ASC"]]
      });
    }

    res.render("singer-hub", {
      pageTitle: `${singer.name} | Singer Hub`,
      singer,
      daysRemaining,
      upcomingSubmissions,
      pastHistory,
      deitySummary,
      songbook,
      myReports,
      myReportsCount,
      showWelcome,
      isAdmin,
      allSingers,
      pageCSS: null,
      pageJS: null
    });
  } catch (error) {
    console.error("Error loading Singer Hub:", error);
    res.status(500).send("Unable to load Singer Hub.");
  }
};

/**
 * Devotee Logout (Preserves admin session if logged in)
 */
exports.logout = (req, res) => {
  if (req.session) {
    delete req.session.singer;
    delete req.session.showHubWelcome;
    req.session.save(() => {
      if (req.xhr || req.headers?.accept?.includes("application/json")) {
        return res.json({ success: true, redirect: "/" });
      }
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Logging out...</title></head><body>
      <script>
        try {
          localStorage.removeItem('bp_singer_id');
          localStorage.removeItem('bp_singer_name');
          localStorage.removeItem('bp_singer_gender');
          localStorage.removeItem('bp_singer_login_time');
        } catch(_) {}
        if (window.top && window.top !== window.self) {
          window.top.location.href = '/?logged_out=' + Date.now();
        } else {
          window.location.href = '/?logged_out=' + Date.now();
        }
      </script></body></html>`);
    });
  } else {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Logging out...</title></head><body>
    <script>
      try {
        localStorage.removeItem('bp_singer_id');
        localStorage.removeItem('bp_singer_name');
        localStorage.removeItem('bp_singer_gender');
        localStorage.removeItem('bp_singer_login_time');
      } catch(_) {}
      if (window.top && window.top !== window.self) {
        window.top.location.href = '/?logged_out=' + Date.now();
      } else {
        window.location.href = '/?logged_out=' + Date.now();
      }
    </script></body></html>`);
  }
};

/**
 * Admin: Switch or link active Singer profile in session
 */
exports.adminSwitchSinger = async (req, res) => {
  try {
    const isAdmin = Boolean(req.session && (req.session.admin || req.session.adminUserId));
    if (!isAdmin) {
      return res.status(403).json({ error: "Unauthorized: Admin access required." });
    }

    const { singer_id, save_permanent } = req.body;
    if (!singer_id) {
      return res.status(400).json({ error: "Singer ID is required." });
    }

    const singer = await Singer.findByPk(singer_id);
    if (!singer) {
      return res.status(404).json({ error: "Singer record not found." });
    }

    req.session.singer = {
      id: singer.id,
      name: singer.name,
      gender: singer.gender,
      preferred_scale: singer.preferred_scale || null,
      pinVerifiedAt: Date.now(),
      isAdminLinked: true
    };

    if (save_permanent) {
      const adminId = req.session.adminUserId || req.session.admin?.id;
      if (adminId) {
        await AdminUser.update({ singer_id: singer.id }, { where: { id: adminId } });
      }
    }

    req.session.save(() => {
      res.json({
        success: true,
        message: `Switched active singer to ${singer.name}`,
        singer: req.session.singer
      });
    });
  } catch (error) {
    console.error("adminSwitchSinger error:", error);
    res.status(500).json({ error: error.message || "Failed to switch singer." });
  }
};

/**
 * Change 4-digit PIN
 */
exports.changePin = async (req, res) => {
  try {
    const singerSession = req.session.singer;
    if (!singerSession) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const { current_pin, new_pin } = req.body;
    const cleanCurrent = (current_pin || "").toString().trim();
    const cleanNew = (new_pin || "").toString().trim();

    if (!/^\d{4}$/.test(cleanNew)) {
      return res.status(400).json({ error: "New PIN must be exactly 4 digits." });
    }

    const singer = await Singer.findByPk(singerSession.id);
    if (!singer) {
      return res.status(404).json({ error: "Singer not found." });
    }

    if (singer.pin) {
      const isMatch = await bcrypt.compare(cleanCurrent, singer.pin);
      if (!isMatch) {
        return res.status(403).json({ error: "Incorrect current 4-digit PIN." });
      }
    }

    const hashed = await bcrypt.hash(cleanNew, 10);
    await singer.update({
      pin: hashed,
      pin_set_at: new Date()
    });

    // Reset 90-day verification timer
    req.session.singer.pinVerifiedAt = Date.now();

    res.json({ success: true, message: "Your 4-digit PIN has been updated successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to update PIN." });
  }
};

// -------------------------------------------------------------
// SONGBOOK / REPERTOIRE ENDPOINTS (PHASE 2)
// -------------------------------------------------------------

/**
 * Check if a bhajan is in current singer's songbook
 */
exports.checkSongbookStatus = async (req, res) => {
  try {
    const singerId = req.session?.singer?.id;
    const { masterId } = req.params;

    if (!singerId) {
      return res.json({ loggedIn: false, bookmarked: false });
    }

    const bookmark = await SingerBookmark.findOne({
      where: { singer_id: singerId, master_id: masterId }
    });

    res.json({
      loggedIn: true,
      bookmarked: Boolean(bookmark),
      bookmark: bookmark || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Toggle bookmark in personal songbook
 */
exports.toggleSongbook = async (req, res) => {
  try {
    const singerId = req.session.singer.id;
    const { master_id, custom_scale, notes } = req.body;

    if (!master_id) {
      return res.status(400).json({ error: "Master Bhajan ID is required." });
    }

    const master = await MasterBhajan.findByPk(master_id);
    if (!master) {
      return res.status(404).json({ error: "Bhajan not found." });
    }

    const existing = await SingerBookmark.findOne({
      where: { singer_id: singerId, master_id }
    });

    if (existing) {
      await existing.destroy();
      return res.json({
        success: true,
        bookmarked: false,
        message: `"${master.title}" removed from your Songbook.`
      });
    }

    const bookmark = await SingerBookmark.create({
      singer_id: singerId,
      master_id,
      custom_scale: custom_scale ? custom_scale.trim() : null,
      notes: notes ? notes.trim() : null
    });

    res.json({
      success: true,
      bookmarked: true,
      bookmark,
      message: `"${master.title}" saved to your Songbook!`
    });
  } catch (error) {
    console.error("Error toggling songbook:", error);
    res.status(500).json({ error: error.message || "Failed to update songbook." });
  }
};

/**
 * Update scale or notes in personal songbook
 */
exports.updateSongbookDetails = async (req, res) => {
  try {
    const singerId = req.session.singer.id;
    const { master_id, custom_scale, notes } = req.body;

    const bookmark = await SingerBookmark.findOne({
      where: { singer_id: singerId, master_id }
    });

    if (!bookmark) {
      return res.status(404).json({ error: "Songbook entry not found." });
    }

    await bookmark.update({
      custom_scale: custom_scale !== undefined ? custom_scale.trim() : bookmark.custom_scale,
      notes: notes !== undefined ? notes.trim() : bookmark.notes
    });

    res.json({
      success: true,
      bookmark,
      message: "Personal scale and practice notes saved!"
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to update details." });
  }
};

/**
 * Get full personal songbook list
 */
exports.getSongbookList = async (req, res) => {
  try {
    const singerId = req.session.singer.id;
    const bookmarks = await SingerBookmark.findAll({
      where: { singer_id: singerId },
      include: [{ model: MasterBhajan, as: "masterBhajan" }],
      order: [["created_at", "DESC"]]
    });

    res.json({ success: true, bookmarks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update singer preferred pitch / default vocal scale
 */
exports.updatePreferredScale = async (req, res) => {
  try {
    const singerId = req.session?.singer?.id;
    const { preferred_scale } = req.body;
    if (!singerId) return res.status(401).json({ error: "Unauthorized" });

    const singer = await Singer.findByPk(singerId);
    if (!singer) return res.status(404).json({ error: "Singer not found" });

    const cleanScale = preferred_scale ? preferred_scale.trim() : null;
    await singer.update({ preferred_scale: cleanScale });

    // Update in session as well
    if (req.session?.singer) {
      req.session.singer.preferred_scale = cleanScale;
    }

    res.json({
      success: true,
      preferred_scale: cleanScale,
      message: "Default singing pitch saved!"
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to update preferred scale." });
  }
};

