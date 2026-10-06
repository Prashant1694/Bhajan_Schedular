const { getLatestBulletins, CATEGORY_INFO } = require("./bulletinController");
const BhajanSubmission = require("../models/BhajanSubmission");
const SessionPermission = require("../models/SessionPermission");
const { getThursdaySubmissionStatus, getLocalDateStr, isSessionActiveOrUpcoming } = require("../services/helpers");
const { Sequelize } = require("sequelize");

exports.home = async (req, res) => {
  const isIframe = req.query._embed === "1" || 
                   req.query.embed === "1" || 
                   req.headers["sec-fetch-dest"] === "iframe" ||
                   (Boolean(req.headers["referer"]) && req.headers["referer"].includes("_embed=1"));

  // If not embed mode and not standalone, serve the Native App Shell with persistent tabs
  if (!isIframe && req.query.standalone !== "1") {
    const isAuthAdmin = Boolean(req.session && (req.session.admin || req.session.adminUserId));
    let initialRoute = (req.query.route || req.query.url || '').trim();
    let initialTab = (req.query.tab || '').trim();

    if (initialRoute) {
      if (!initialRoute.startsWith('/')) initialRoute = '/' + initialRoute;
      const lower = initialRoute.toLowerCase();
      if (lower.startsWith('/admin-login') || lower.startsWith('/forgot-password')) {
        return res.redirect(initialRoute);
      } else if (lower.startsWith('/submit-form')) {
        initialTab = 'singer';
      } else if (lower.startsWith('/master-bank') || lower.startsWith('/bhajan/')) {
        initialTab = 'bank';
      } else if (lower.startsWith('/plan-view')) {
        initialTab = 'plan';
      } else if (lower.startsWith('/my-hub') || lower.startsWith('/singer/')) {
        initialTab = 'hub';
      } else if (lower.startsWith('/admin')) {
        if (!isAuthAdmin) {
          return res.redirect('/admin-login');
        }
        initialTab = 'admin';
      } else {
        initialTab = 'home';
      }
    } else if (!initialTab) {
      initialTab = 'home';
    }

    if (initialTab === 'admin' && !isAuthAdmin) {
      return res.redirect('/admin-login');
    }

    return res.render("app-shell", {
      layout: false,
      pageTitle: "Bhajan Planner",
      initialTab,
      initialRoute: initialRoute || null,
      currentAdmin: req.session?.admin || null,
      currentSinger: req.session?.singer || null
    });
  }

  let bulletins = [];
  try {
    bulletins = await getLatestBulletins(5);
  } catch (err) {
    console.error("Failed to load bulletins for home page:", err.message);
  }

  let upcomingSessions = [];
  try {
    const todayStr = getLocalDateStr();
    const thuStatus = getThursdaySubmissionStatus();

    // 1. Fetch upcoming special / festival sessions
    const specialSessions = await SessionPermission.findAll({
      where: { date: { [Sequelize.Op.gte]: todayStr } },
      order: [["date", "ASC"]],
      limit: 3
    });

    const sessionDatesMap = new Map();

    // Add active / upcoming special sessions
    for (const sp of specialSessions) {
      if (isSessionActiveOrUpcoming(sp.date, sp.description)) {
        const isToday = (sp.date === todayStr);
        sessionDatesMap.set(sp.date, {
          date: sp.date,
          type: sp.type || "special",
          label: sp.description || (sp.type === "festival" ? "Festival Bhajan" : "Special Session"),
          tag: sp.type === "festival" ? "🎉 Festival" : "✨ Special",
          isOpen: true,
          opensAt8pmToday: false,
          isToday,
          isLiveNow: isToday
        });
      }
    }

    // 2. Add Thursday session
    // If today is Thursday and live plan active (before 8:30 PM):
    if (thuStatus.isThursdayLiveActive) {
      if (!sessionDatesMap.has(thuStatus.todayStr)) {
        sessionDatesMap.set(thuStatus.todayStr, {
          date: thuStatus.todayStr,
          type: "regular",
          label: "Thursday Mandir Bhajan",
          tag: "🪔 Mandir Bhajan",
          isOpen: false,
          isClosedForSubmissions: true,
          opensAt8pmToday: false,
          isToday: true,
          isLiveNow: true
        });
      }
    }

    // Add upcoming Thursday (the one open for submissions or opening at 8 PM)
    const upcomingThuDate = thuStatus.openThursday || thuStatus.nextThursdayDate;
    if (upcomingThuDate && !sessionDatesMap.has(upcomingThuDate)) {
      sessionDatesMap.set(upcomingThuDate, {
        date: upcomingThuDate,
        type: "regular",
        label: "Thursday Mandir Bhajan",
        tag: "🪔 Regular Session",
        isOpen: !thuStatus.opensAt8pmToday,
        opensAt8pmToday: thuStatus.opensAt8pmToday,
        isToday: false,
        isLiveNow: false
      });
    }

    // 3. For each session in map, format date and fetch submission counts
    const sortedEntries = Array.from(sessionDatesMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    for (const s of sortedEntries) {
      const count = await BhajanSubmission.count({
        where: { session_date: s.date }
      });

      let formattedDate = s.date;
      try {
        const [y, m, d] = s.date.split("-").map(Number);
        const dObj = new Date(y, m - 1, d);
        formattedDate = dObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      } catch (_) {}

      upcomingSessions.push({
        ...s,
        formattedDate,
        submissionCount: count
      });
    }
  } catch (err) {
    console.error("Failed to compute upcoming sessions for dashboard:", err.message);
  }

  const upcomingSession = upcomingSessions[0] || null;

  res.render("dashboard", {
    showLoader: true,
    bulletins,
    CATEGORY_INFO,
    upcomingSession,
    upcomingSessions
  });
};