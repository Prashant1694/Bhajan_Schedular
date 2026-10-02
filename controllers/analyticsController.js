const { Sequelize } = require("sequelize");

const BhajanSubmission = require("../models/BhajanSubmission");
const MasterBhajan = require("../models/MasterBhajan");
const { getLocalDateStr, deityOrderKey, SPEED_ORDER } = require("../services/helpers");

exports.showDatabase = async (req, res) => {
  try {
    // Today as YYYY-MM-DD string using local timezone
    const todayStr = getLocalDateStr();

    // Fetch sessions whose date <= todayStr (shows Thursday's session immediately at 12:00 AM Thursday)
    const rawSubmissions = await BhajanSubmission.findAll({
      where: {
        session_date: { [Sequelize.Op.lte]: todayStr }
      },
      order: [
        ['session_date', 'DESC'],
        ['list_order', 'ASC'],
        ['created_at', 'ASC']
      ],
      raw: true
    });

    // Fetch active master bhajans to link details and music sheets in History
    const masterBhajans = await MasterBhajan.findAll({
      where: { is_active: true },
      attributes: ['id', 'title', 'sheet_filename']
    });

    const { cleanAndStemBhajanTitle } = require('../services/fuzzyMatcher');
    const exactMap = new Map();
    const stemmedMap = new Map();

    masterBhajans.forEach(mb => {
      const lower = String(mb.title || '').trim().toLowerCase();
      if (!exactMap.has(lower)) exactMap.set(lower, mb);
      const stemmed = cleanAndStemBhajanTitle(mb.title);
      if (!stemmedMap.has(stemmed)) stemmedMap.set(stemmed, mb);
    });

    const findMaster = (title) => {
      if (!title) return null;
      const lower = String(title).trim().toLowerCase();
      if (exactMap.has(lower)) return exactMap.get(lower);
      const stemmed = cleanAndStemBhajanTitle(title);
      if (stemmedMap.has(stemmed)) return stemmedMap.get(stemmed);
      return null;
    };

    // Group submissions by session_date
    const { deityOrderKey, SPEED_ORDER } = require('../services/helpers');
    const sessionsMap = new Map();

    rawSubmissions.forEach(s => {
      const match = findMaster(s.title);
      s.master_id = match ? match.id : null;
      s.sheet_filename = match ? (match.sheet_filename || null) : null;

      if (!sessionsMap.has(s.session_date)) {
        sessionsMap.set(s.session_date, []);
      }
      sessionsMap.get(s.session_date).push(s);
    });

    // Build sessions array with heading and sorted bhajans
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sessions = [];

    for (const [dateStr, bhajans] of sessionsMap) {
      // Sort within session: manual order first, then deity/speed/singer fallback
      bhajans.sort((a, b) => {
        if (a.list_order > 0 || b.list_order > 0) {
          if (a.list_order === 0) return 1;
          if (b.list_order === 0) return -1;
          return a.list_order - b.list_order;
        }
        const deityCompare = deityOrderKey(a.deity) - deityOrderKey(b.deity);
        if (deityCompare !== 0) return deityCompare;
        const speedCompare = (SPEED_ORDER[(a.speed || '').toLowerCase()] || 1) -
                             (SPEED_ORDER[(b.speed || '').toLowerCase()] || 1);
        if (speedCompare !== 0) return speedCompare;
        return (a.singer_name || '').toLowerCase().localeCompare((b.singer_name || '').toLowerCase());
      });

      // Heading: DD-MM-YYYY - DayName
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayName = DAY_NAMES[dateObj.getDay()];
      const heading = `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y} - ${dayName}`;

      sessions.push({ date: dateStr, heading, bhajans });
    }

    res.render('database', { sessions });
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};

exports.showAnalytics = async (req, res) => {
  try {
    const topBhajans = await BhajanSubmission.findAll({
      attributes: [
        "title",
        [Sequelize.fn("COUNT", Sequelize.col("title")), "count"]
      ],
      group: ["title"],
      order: [
        [Sequelize.fn("COUNT", Sequelize.col("title")), "DESC"]
      ],
      limit: 15,
      raw: true
    });

    res.render("analytics", { topBhajans });

  } catch (error) {
    res.status(500).send(error.message);
  }
};
