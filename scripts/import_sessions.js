const { initializeDatabase } = require("../services/databaseInitializer");
const BhajanSubmission = require("../models/BhajanSubmission");
const MasterBhajan = require("../models/MasterBhajan");
const Singer = require("../models/Singer");
const { normalizeName } = require("../services/helpers");
const { Sequelize } = require("sequelize");

const DEITY_KEYWORDS = [
  { deity: "Ganesha", keywords: ["gajanana", "ganesha", "ganapathi", "vigneshwara", "vignesh", "gajananam", "ganayaka", "gajavadana", "gauri ganesh", "gauri sutaya", "vighna", "gananatha", "ganapati"] },
  { deity: "Guru", keywords: ["guru", "gurunatha", "gurudeva", "subrahmanya", "sharavanabhava", "sadguru", "aruna ramana"] },
  { deity: "Mata", keywords: ["devi", "mata", "jagadeeshwari", "amba", "durga", "bhawani", "janani", "amritanandamayi", "shakti", "raj rajeshwari", "parvati", "jaganmohini", "sharade", "gouri", "gauri", "triputa"] },
  { deity: "Sai", keywords: ["sai", "baba", "parthi", "sathya", "puttaparthi", "shirdi", "partishwara", "sayeesha"] },
  { deity: "Shiva", keywords: ["shiva", "shankara", "shambho", "hara", "bholenath", "nataraja", "mahadeva", "shankaram", "pashupati", "neelakantha", "lingam", "tatsat", "arunachal"] },
  { deity: "Krishna", keywords: ["krishna", "gopal", "govinda", "radhey", "radhe", "madhav", "giridhari", "murlidhar", "kanna", "nandalal", "nanda", "kanhaiya", "radhika", "keshava", "muralidhara"] },
  { deity: "Rama", keywords: ["rama", "raghu", "raghupathi", "ramachandra", "dasharatha", "ayodhya", "janaki", "raghuveer"] },
  { deity: "Narayana", keywords: ["narayana", "hari", "vishnu", "govinda", "madhava", "vasudevaya", "vasudeva"] },
  { deity: "Vitthala", keywords: ["vitthala", "vithala", "panduranga", "pandhari"] },
  { deity: "Hanuman", keywords: ["hanuman", "maruti", "anjaneya", "aanjaneya", "ram duta", "vanara"] }
];

function normalizeDeity(deity) {
  if (!deity) return "SarvaDharma";
  const d = deity.trim();
  if (["Devi", "Durga", "Mata"].includes(d)) return "Mata";
  if (["Anjaneya", "Maruti", "Hanuman"].includes(d)) return "Hanuman";
  if (["Vittala", "Vitthala", "Panduranga"].includes(d)) return "Vitthala";
  if (["Subrahmanya"].includes(d)) return "Guru";
  if (["Ganesha", "Guru", "Mata", "SarvaDharma", "Sai", "Shiva", "Krishna", "Rama", "Narayana", "Vitthala", "Hanuman"].includes(d)) {
    return d;
  }
  return "SarvaDharma";
}

function inferDeity(title) {
  const lower = title.toLowerCase();
  for (const item of DEITY_KEYWORDS) {
    for (const kw of item.keywords) {
      if (lower.includes(kw)) {
        return item.deity;
      }
    }
  }
  return "SarvaDharma";
}

function parseDateString(str) {
  // Looks for YYYY-MM-DD or DD/MM/YYYY
  const isoMatch = str.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const slashMatch = str.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
  }
  return null;
}

async function parseBatchSessions(fullText) {
  await initializeDatabase();

  // Pre-load all existing singers once so we can normalise-match without
  // hammering the DB inside the per-bhajan loop.
  const existingSingers = await Singer.findAll({ attributes: ['id', 'name', 'gender'], raw: true });

  /**
   * Resolve a raw singer name string to an existing Singer record (or create
   * a new one). Uses case-insensitive / whitespace-normalised comparison to
   * avoid creating duplicates.
   */
  async function resolveSinger(rawName) {
    if (!rawName || !rawName.trim()) return null;
    const norm = normalizeName(rawName);
    let found = existingSingers.find(s => normalizeName(s.name) === norm);
    if (!found) {
      const created = await Singer.create({ name: rawName.trim(), gender: null });
      found = { id: created.id, name: created.name, gender: created.gender };
      existingSingers.push(found); // keep cache up to date
    }
    return found;
  }

  // Split text into sessions by lines starting with 'Bhajan Plan –' or dates
  const rawSections = fullText.split(/(?=(?:Bhajan Plan\s*[-–—]\s*|\b\d{2}\/\d{2}\/\d{4}))/gi);

  let totalSessions = 0;
  let totalBhajans = 0;

  const sessionSummary = [];
  for (const section of rawSections) {
    const lines = section.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) continue;

    const firstLine = lines[0];
    const sessionDate = parseDateString(firstLine);
    if (!sessionDate) continue;

    totalSessions++;

    // Clear existing entries for this date to prevent duplicate rows
    await BhajanSubmission.destroy({ where: { session_date: sessionDate } });

    console.log(`\n========================================`);
    console.log(`🗓️ Processing Session: ${sessionDate}`);

    let listOrder = 0;
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i];
      if (!line || !/^\d+[\.\)]/.test(line)) continue;

      let singerName = "Group / Devotee";
      let partnerName = null;
      let title = "";
      let deity = "SarvaDharma";
      let scale = "Not specified";
      let speed = "medium";

      // Check if line matches Plan View format:
      // "1) Nisarg Chaudhari (Prashant Bhatt) – [Ganesha] Sharanam Sharanam Pahi Gajanana – Scale: 1.5P, Speed: Not specified"
      if (line.includes("[") && line.includes("]")) {
        // Match: 1) Singer (Partner) – [Deity] Title – Scale: X, Speed: Y
        const planMatch = line.match(/^\d+[\.\)]\s*(.*?)\s*[-–—]\s*\[(.*?)\]\s*(.*?)(?:\s*[-–—]\s*(.*))?$/);
        if (planMatch) {
          let rawSinger = planMatch[1].trim();
          deity = normalizeDeity(planMatch[2].trim());
          title = planMatch[3].trim();
          let rawDetails = planMatch[4] ? planMatch[4].trim() : "";

          // Extract partner from singer e.g. "Nisarg Chaudhari (Prashant Bhatt)"
          const partnerMatch = rawSinger.match(/^(.*?)\s*\((.*?)\)$/);
          if (partnerMatch) {
            singerName = partnerMatch[1].trim();
            partnerName = partnerMatch[2].trim();
          } else {
            singerName = rawSinger;
          }

          // Extract scale & speed e.g. "Scale: 1.5P, Speed: Slow"
          if (rawDetails) {
            const scaleMatch = rawDetails.match(/Scale:\s*([^,]+)/i);
            if (scaleMatch) scale = scaleMatch[1].trim();

            const speedMatch = rawDetails.match(/Speed:\s*(.*)/i);
            if (speedMatch) speed = speedMatch[1].trim().toLowerCase();
          }
        }
      } else {
        // Standard text format
        line = line.replace(/^\d+[\.\)]\s*/, "").trim();
        line = line.replace(/^[GL]\s*[-–—]\s*/i, "").trim();

        let parts = line.split(/\s*[-–—]\s*/);
        title = parts[0].trim();

        if (parts.length > 1) {
          let extra = parts.slice(1).join(" - ").trim();
          if (extra.includes(",")) {
            singerName = extra.trim();
          } else {
            scale = extra;
          }
        }

        if (title.includes(":") && !title.toLowerCase().startsWith("http")) {
          const colonParts = title.split(":");
          if (colonParts[0].trim().length < 30) {
            singerName = colonParts[0].trim();
            title = colonParts.slice(1).join(":").trim();
          }
        }

        const cleanTitle = title.replace(/\s*\(\d+.*?\)/g, "").replace(/\(.*?\)/g, "").trim();
        let masterMatch = await MasterBhajan.findOne({
          where: {
            is_active: true,
            title: { [Sequelize.Op.like]: `%${cleanTitle}%` }
          }
        });

        deity = normalizeDeity(masterMatch ? masterMatch.deity : inferDeity(cleanTitle));
        speed = masterMatch && masterMatch.tempo ? masterMatch.tempo.toLowerCase() : "medium";
      }

      // Resolve singer against existing dictionary (avoids duplicates)
      await resolveSinger(singerName);
      if (partnerName) await resolveSinger(partnerName);

      listOrder++;

      await BhajanSubmission.create({
        session_date: sessionDate,
        singer_name: singerName,
        partner_name: partnerName,
        title: title,
        deity: deity,
        scale: scale,
        speed: speed,
        list_order: listOrder
      });

      console.log(`  [${listOrder}] ${singerName}${partnerName ? ` & ${partnerName}` : ''} | ${deity} | "${title}" | Scale: ${scale} | Speed: ${speed}`);
      totalBhajans++;
    }

    sessionSummary.push({ date: sessionDate, count: listOrder });
  }

  console.log(`\n========================================`);
  console.log(`✅ Complete! Processed ${totalSessions} session(s) and ${totalBhajans} bhajan(s).`);

  return { totalSessions, totalBhajans, sessionSummary };
}

module.exports = { parseBatchSessions };

