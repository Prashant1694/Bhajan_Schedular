const path = require("path");
const { Sequelize } = require("sequelize");

const BhajanSubmission = require("../models/BhajanSubmission");
const SessionPermission = require("../models/SessionPermission");
const SessionMeta = require("../models/SessionMeta");
const DeityRule = require("../models/DeityRule");
const Singer = require("../models/Singer");
const MasterBhajan = require("../models/MasterBhajan");

const {
    getNextThursday,
    getThursdaySubmissionStatus,
    getLocalDateStr,
    deityOrderKey,
    SPEED_ORDER,
    normalizeName
} = require("../services/helpers");

const {
    generateSubmitFormHtml,
    generateErrorHtml,
    generatePlanViewHtml,
    generateDatePickerHtml,
    escapeHtml
} = require("../templates");

const normalizeBhajanTitle = (title) =>
  String(title || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

// Helper to fetch available dates across planner endpoints
const getAvailableDates = async () => {
  const todayStr = getLocalDateStr();
  const status = getThursdaySubmissionStatus();
  
  const specialDays = await SessionPermission.findAll({
    where: { date: { [Sequelize.Op.gt]: todayStr } },
    order: [['date', 'ASC']]
  });
  
  const dates = new Map();
  if (status.openThursday) {
    dates.set(status.openThursday, { label: 'Next Thursday', desc: 'Regular Session' });
  }
  specialDays.forEach(p => {
    const label = p.type === 'festival' ? 'Festival' : 'Special';
    dates.set(p.date, { label: label, desc: p.description || '' });
  });
  return { dates, status };
};

exports.showSubmitForm = async (req, res) => {
    
  try {
    const isAdmin = req.query.admin === 'true' || !!(req.session && req.session.admin);
    const showSuccess = req.query.success === 'true';
    let sessionDate = req.query.session_date;

    const renderSelectionScreen = async (msg) => {
      const { dates: availableDates } = await getAvailableDates();
      const sortedDates = Array.from(availableDates.keys()).sort();
      let optionsHtml = '';
      const adminParam = isAdmin ? '&admin=true' : '';
      sortedDates.forEach(date => {
        const info = availableDates.get(date);
        const type = info.label;
        const descText = info.desc ? ` - ${info.desc}` : '';
        const displayLabel = `${type} (${date})${descText}`;
        let btnStyle = 'margin-bottom:10px; width:100%; display:block; text-decoration:none;';
        if (type === 'Festival') btnStyle += ' background: #ff922b; border:none; color:white;';
        else if (type === 'Special') btnStyle += ' background: #4dabf7; border:none; color:white;';
        else btnStyle += ' background: linear-gradient(135deg, #ff9933 0%, #ff7700 100%); color:white;';
        optionsHtml += `<a href="/submit-form?session_date=${date}${adminParam}" class="button" style="${btnStyle}">${displayLabel}</a>`;
      });
      const homeUrl = isAdmin ? '/admin' : '/';
      const themeHeadScript = `<script>(function(){try{var t=localStorage.getItem('bp-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();</script>`;
      const themeToggleBtn = `<button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" aria-pressed="false" data-tooltip="Switch to Dark"><span class="icon-moon">🌙</span><span class="icon-sun">☀️</span></button>`;
      return res.send(`<!DOCTYPE html><html><head><title>Select Session</title><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/css/style.css">${themeHeadScript}</head><body>${themeToggleBtn}<div class="container" style="text-align:center; padding:40px; max-width:500px;"><h2 style="color:var(--saffron); margin-bottom:20px;">🗓️ Select Session</h2><p style="color:var(--ink-soft); margin-bottom:20px;">${msg}</p><div style="background:var(--surface); padding:20px; border-radius:12px; border:1px solid var(--border);"><div style="display:flex; flex-direction:column; gap:10px;">${optionsHtml}</div></div><div style="margin-top:25px;"><a href="${homeUrl}" class="button secondary">${homeText}</a></div></div><script src="/js/script.js"></script></body></html>`);
    };

    // If no date provided, check if we should show selection screen or 8pm notice
    const { dates: availableDates, status: thuStatus } = await getAvailableDates();

    if (!sessionDate) {
      if (!isAdmin && thuStatus.opensAt8pmToday) {
        const msg = `Today's Thursday session is locked.<br>Submissions for next Thursday (<strong>${thuStatus.nextThursdayDate}</strong>) will open today at 8:00 PM.`;
        if (availableDates.size > 0) {
          return renderSelectionScreen(`${msg}<br><br>You can submit for available Special/Festival sessions below:`);
        } else {
          const homeUrl = isAdmin ? '/admin' : '/';
          const homeText = isAdmin ? '🏠 Return to Dashboard' : '🏠 Return Home';
          const themeHeadScript = `<script>(function(){try{var t=localStorage.getItem('bp-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();</script>`;
          const themeToggleBtn = `<button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" aria-pressed="false" data-tooltip="Switch to Dark"><span class="icon-moon">🌙</span><span class="icon-sun">☀️</span></button>`;
          return res.send(`<!DOCTYPE html><html><head><title>Submissions Opening at 8:00 PM</title><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/css/style.css">${themeHeadScript}</head><body>${themeToggleBtn}<div class="container" style="text-align:center; padding:40px; max-width:500px;"><h2 style="color:var(--saffron); margin-bottom:20px;">🔒 Submissions Opening at 8:00 PM</h2><p style="color:var(--ink-soft); margin-bottom:25px; line-height:1.6;">${msg}</p><div><a href="${homeUrl}" class="button secondary">${homeText}</a></div></div><script src="/js/script.js"></script></body></html>`);
        }
      }

      if (availableDates.size > 1) {
        return renderSelectionScreen("Please select a session to submit your bhajan:");
      }
      sessionDate = thuStatus.openThursday || thuStatus.nextThursdayDate;
    }

    const todayStr = getLocalDateStr();
    const isPastOrToday = todayStr >= sessionDate;
    const meta = await SessionMeta.findByPk(sessionDate);
    const isManuallyLocked = meta && meta.is_locked;
    const isNextThuUnopened = !isAdmin && sessionDate === thuStatus.nextThursdayDate && thuStatus.opensAt8pmToday;

    if (!isAdmin && (isManuallyLocked || isPastOrToday)) {
      // Session has already locked and moved — redirect directly to history tab
      return res.redirect("/database");
    }

    if (!isAdmin && isNextThuUnopened) {
      const reasonMsg = `Submissions for next Thursday (<strong>${sessionDate}</strong>) will open today at 8:00 PM.`;
      return renderSelectionScreen(`${reasonMsg}<br>Please select an available upcoming session:`);
    }

    // Check Permissions: Allow if Thursday OR Admin OR Explicitly Permitted
    const [sYear, sMonth, sDay] = sessionDate.split('-').map(Number);
    const dayOfWeek = new Date(sYear, sMonth - 1, sDay).getDay();
    const isThursday = dayOfWeek === 4;
    const permission = await SessionPermission.findByPk(sessionDate);

    if (!isAdmin && !isThursday && !permission) {
      return renderSelectionScreen(`Bhajan submission for <strong>${sessionDate}</strong> is not enabled.<br>Please select an available session:`);
    }

    const isSpecialOrFestival = !!permission;
    
    // Load rules specifically for this session
    let rules = await DeityRule.findAll({ where: { session_date: sessionDate } });
    if (rules.length === 0) rules = await DeityRule.findAll({ where: { session_date: 'default' } });

    // Fetch existing submissions
    const results = await BhajanSubmission.findAll({
      where: { session_date: sessionDate }
    });
    
    // Build base deityStatus dynamically
    const deityStatus = {};
    const ALL_DEITIES = ["Ganesha", "Guru", "Mata", "SarvaDharma", "Sai", "Shiva", "Krishna", "Rama", "Narayana", "Vitthala", "Hanuman"];
    ALL_DEITIES.forEach(d => {
      const rule = rules.find(r => r.deity_name === d) || { min_required: 0, max_allowed: 2 };
      deityStatus[d] = {
        taken: false, count: 0, by: "", bhajan: "", scale: "", speed: "",
        mandatory: rule.min_required > 0, minReq: rule.min_required, maxAllowed: rule.max_allowed
      };
    });

    results.forEach(bhajan => {
      if (deityStatus[bhajan.deity]) {
        deityStatus[bhajan.deity].taken = true;
        deityStatus[bhajan.deity].by = bhajan.singer_name;
        deityStatus[bhajan.deity].bhajan = bhajan.title;
        deityStatus[bhajan.deity].scale = bhajan.scale || "Not specified";
        deityStatus[bhajan.deity].speed = bhajan.speed;
        deityStatus[bhajan.deity].count += 1;
      }
    });
    
    const mandatoryFilled = Object.values(deityStatus).filter(d => d.mandatory && d.count >= 1).length;
    const totalMandatory = Object.values(deityStatus).filter(d => d.mandatory).length;
      
    const optionalFilled = Object.values(deityStatus).filter(d => !d.mandatory && d.count >= 1).length;
    const totalOptional = Object.values(deityStatus).filter(d => !d.mandatory && d.maxAllowed > 0).length;
    
    // Generate deity cards HTML
    const generateCardHtml = (deity) => {
      const status = deityStatus[deity];
      let cardClass, statusBadge, onclick;
      const countClass = `count-${Math.min(status.count, 3)}`;
      
      if (status.maxAllowed === 0) {
        return `<div class="deity-card disabled ${countClass}" style="opacity:0.4; pointer-events:none;"><div class="deity-name">${deity}</div><span class="badge badge-taken" style="background:#e03131;">Blocked</span></div>`;
      }

      const isFull = status.count >= status.maxAllowed;
      const bhajanText = `${status.count} Bhajan${status.count === 1 ? '' : 's'}`;

      if (isFull) {
        cardClass = `deity-card taken ${countClass}`;
        statusBadge = `<span class="badge badge-taken">✓ ${status.count} Taken</span>`;
        onclick = `onclick="showDetails('${deity}', '${status.by.replace(/'/g, "\\'")}', '${status.bhajan.replace(/'/g, "\\'")}', '${status.scale}', '${status.speed}')" style="cursor:pointer;"`;
      } else {
        cardClass = `deity-card available ${countClass}`;
        statusBadge = `<span class="badge badge-available">${bhajanText}</span>`;
        onclick = "";
      }
      
      let mandatoryLabel = status.mandatory ? `<div class="rule-warning" style="color:#ff9933; font-size:11px; margin-top:6px; font-weight:700;">⭐ Required (${status.minReq})</div>` : '';

      return `
        <div class="${cardClass}" data-deity="${deity}" ${onclick}>
          <div class="deity-name">${deity}</div>
          ${statusBadge}
          ${mandatoryLabel}
        </div>
      `;
    };

    const ganeshaCardHtml = generateCardHtml("Ganesha");
    const otherDeities = ["Guru", "Mata", "SarvaDharma", "Sai", "Shiva", "Krishna", "Rama", "Narayana", "Vitthala"];
    let otherDeitiesHtml = "";
    otherDeities.forEach(d => otherDeitiesHtml += generateCardHtml(d));
    let hanumanCard = generateCardHtml("Hanuman").replace('deity-card', 'deity-card hanuman-card');
    
    // Send HTML response
    const submissionRowsHtml = results
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((submission, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(submission.singer_name)}</td>
          <td>${escapeHtml(submission.deity)}</td>
          <td>${escapeHtml(submission.title)}</td>
          <td>${escapeHtml(submission.speed || "Not specified")}</td>
          <td>${escapeHtml(submission.scale || "Not specified")}</td>
        </tr>
      `)
      .join("");

    res.send(generateSubmitFormHtml(sessionDate, mandatoryFilled, totalMandatory, optionalFilled, totalOptional, ganeshaCardHtml, otherDeitiesHtml, hanumanCard, isAdmin, showSuccess, submissionRowsHtml, results.length));
    
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  };
};

  exports.submitForm = async (req, res) => {
  try {
    const { session_date, singer_name, gender, locked_gender, partner_name, deity, title, speed, scale, raga, level, language, admin, master_bhajan_id } = req.body;
    const isAdmin = admin === 'true' || !!(req.session && req.session.admin);
    
    if (!session_date || !singer_name || !deity || !title) {
      return res.status(400).send('<h1>Error</h1><p>Missing required fields.</p><a class="button" href="javascript:history.back()">Go Back</a>');
    }

    // Dropdown selection enforcement: Must be selected from the master bhajan database
    if (!master_bhajan_id) {
      return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/style.css"><title>Cannot submit bhajan without selecting from dropdown</title></head><body><div class="container" style="max-width:560px; padding:32px; text-align:center;"><h2>⚠️ Selection Required</h2><p>Cannot submit bhajan without selecting from dropdown. Manual entry without selecting a suggested bhajan is not allowed.</p><a class="button secondary" href="javascript:history.back()">Go Back</a></div></body></html>`);
    }

    const masterBhajan = await MasterBhajan.findByPk(master_bhajan_id);
    if (!masterBhajan) {
      return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/style.css"><title>Invalid Bhajan Selection</title></head><body><div class="container" style="max-width:560px; padding:32px; text-align:center;"><h2>⚠️ Invalid Bhajan</h2><p>Cannot submit bhajan without selecting from dropdown. The selected bhajan was not found in the master list.</p><a class="button secondary" href="javascript:history.back()">Go Back</a></div></body></html>`);
    }

    // Verify title matches canonical master bhajan title
    if (normalizeBhajanTitle(masterBhajan.title) !== normalizeBhajanTitle(title)) {
      return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/style.css"><title>Invalid Bhajan Selection</title></head><body><div class="container" style="max-width:560px; padding:32px; text-align:center;"><h2>⚠️ Invalid Bhajan</h2><p>Cannot submit bhajan without selecting from dropdown. Title does not match the selected suggestion.</p><a class="button secondary" href="javascript:history.back()">Go Back</a></div></body></html>`);
    }

    const DEITY_ALIASES = {
      Vitthala: ["Vitthala", "Vittala"],
      Mata: ["Mata", "Devi"],
      Hanuman: ["Hanuman", "Anjaneya"]
    };
    const DEITY_TITLE_MATCHERS = {
      Vitthala: /vitt?hala|vithoba|pandurang/i,
      Hanuman: /hanuman|anjaneya|maruthi|maruti|pavana suta|bajrang/i
    };
    const aliases = DEITY_ALIASES[deity] || [deity];
    const titleMatcher = DEITY_TITLE_MATCHERS[deity];
    const deityMatches = aliases.includes(masterBhajan.deity) || (titleMatcher && titleMatcher.test(masterBhajan.title));
    if (!deityMatches) {
      return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/style.css"><title>Invalid Bhajan Selection</title></head><body><div class="container" style="max-width:560px; padding:32px; text-align:center;"><h2>⚠️ Invalid Bhajan</h2><p>Cannot submit bhajan without selecting from dropdown. The selected bhajan does not belong to ${escapeHtml(deity)}.</p><a class="button secondary" href="javascript:history.back()">Go Back</a></div></body></html>`);
    }
    
    const todayStr = getLocalDateStr();
    const thuStatus = getThursdaySubmissionStatus();
    const isPastOrToday = todayStr >= session_date;
    const meta = await SessionMeta.findByPk(session_date);
    const isManuallyLocked = meta && meta.is_locked;
    const isNextThuUnopened = !isAdmin && session_date === thuStatus.nextThursdayDate && thuStatus.opensAt8pmToday;

    if (!isAdmin && (isManuallyLocked || isPastOrToday || isNextThuUnopened)) {
      let reasonMsg = "";
      if (isManuallyLocked) {
        reasonMsg = "This session has been locked by the coordinator.";
      } else if (isNextThuUnopened) {
        reasonMsg = `Submissions for next Thursday (${session_date}) will open today at 8:00 PM.`;
      } else {
        reasonMsg = `Submissions for session (${session_date}) closed on the night before at 11:59 PM. Submissions for this session are now locked.`;
      }
      return res.status(403).send(`<h1>Locked</h1><p>${reasonMsg}</p><a class="button" href="${isAdmin ? '/admin' : '/'}">${isAdmin ? 'Return to Dashboard' : 'Go Home'}</a>`);
    }

    // Fetch all submissions for this date to check rules
    const allSubmissions = await BhajanSubmission.findAll({ where: { session_date } });

    // A title may be used only once in a session, regardless of deity or
    // singer. Normalize spaces and casing so minor typing differences cannot
    // create a duplicate entry.
    const duplicateBhajan = allSubmissions.find(
      (submission) => normalizeBhajanTitle(submission.title) === normalizeBhajanTitle(title)
    );
    if (duplicateBhajan) {
      const adminParam = isAdmin ? '&admin=true' : '';
      return res.status(409).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/style.css"><title>Bhajan Already Added</title></head><body><div class="container" style="max-width:560px; padding:32px; text-align:center;"><h2>Bhajan Already Added</h2><p><strong>${escapeHtml(duplicateBhajan.title)}</strong> has already been submitted for this session by <strong>${escapeHtml(duplicateBhajan.singer_name)}</strong>.</p><a class="button secondary" href="/submit-form?session_date=${encodeURIComponent(session_date)}${adminParam}">Go back to the form</a></div></body></html>`);
    }

    // Check if special/festival
    const permission = await SessionPermission.findByPk(session_date);
    const isSpecialOrFestival = !!permission;
    
    // Load rules specifically for this session
    let rules = await DeityRule.findAll({ where: { session_date } });
    if (rules.length === 0) rules = await DeityRule.findAll({ where: { session_date: 'default' } });
    
    const ruleForDeity = rules.find(r => r.deity_name === deity) || { max_allowed: 2 };
    const maxAllowed = ruleForDeity.max_allowed;

    if (!isAdmin) {
      if (maxAllowed === 0) {
        return res.send(generateErrorHtml(deity, { singer_name: "Admin", title: "Blocked for this session", created_at: new Date() }, session_date));
      }

      // Check existing count for requested deity against maxAllowed
      const existingEntries = allSubmissions.filter(s => s.deity === deity);
      if (existingEntries.length >= maxAllowed) {
        return res.send(generateErrorHtml(deity, existingEntries[existingEntries.length - 1], session_date));
      }
    }
    
    // Save a singer's gender the first time it is supplied. Once recorded,
    // always use that stored value rather than trusting a changed form value.
    //
    // Normalize the submitted name to avoid creating duplicate singer records
    // when the name differs only in case or spacing (e.g. 'Prashant Bhatt' vs
    // ' Prashant  Bhatt'). We look for an existing record first using a
    // case-insensitive SQL LIKE on the trimmed name, and only create a new
    // row if no match is found.
    const submittedGender = gender || locked_gender;
    const normalizedInputName = normalizeName(singer_name);

    // Try to find an existing singer whose normalized name matches
    const allSingers = await Singer.findAll({ attributes: ['id', 'name', 'gender'] });
    let singer = allSingers.find(s => normalizeName(s.name) === normalizedInputName) || null;

    if (!singer) {
      // No existing singer found — create a new record using the trimmed submitted name
      singer = await Singer.create({
        name: singer_name.trim(),
        gender: submittedGender || null
      });
    } else if (!singer.gender && submittedGender) {
      await singer.update({ gender: submittedGender });
      singer.gender = submittedGender;
    }
    const resolvedGender = singer.gender || submittedGender || null;

    // Save submission
    const newSubmission = await BhajanSubmission.create({
      session_date,
      singer_name,
      gender: resolvedGender,
      partner_name: partner_name || null,
      title,
      deity,
      scale: scale || "Not specified",
      speed,
      raga,
      level,
      language
    });

    // ── Partner notification ───────────────────────────────────
    // If a partner was specified, send a personalized notification
    // to the partner's registered devices (if any).
    if (partner_name && partner_name.trim()) {
      try {
        const notificationService = require("../services/notificationService");
        const partnerNormalized = normalizeName(partner_name);
        const allSingers = await Singer.findAll({ attributes: ['id', 'name'] });
        const partnerSinger = allSingers.find(s => normalizeName(s.name) === partnerNormalized);

        if (partnerSinger) {
          // Format day and date for notification (e.g. Thursday, 3 September)
          let dateText = session_date;
          try {
            const [y, m, d] = session_date.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
            const dateFormatted = dateObj.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long"
            });
            dateText = `${dayName}, ${dateFormatted}`;
          } catch (e) {}

          await notificationService.createPersonalized({
            type: "partner_bhajan",
            title: "🔔 Bhajan Added With You",
            body: `${singer_name} added "${title}" with you as partner for ${dateText}. Tap to view.`,
            link: `/session-link?session_date=${session_date}`,
            eventKey: `partner_bhajan:${newSubmission.id}`,
            singerId: partnerSinger.id
          });
        }
      } catch (notifErr) {
        // Non-critical — don't fail the submission
        console.error("Partner notification failed:", notifErr.message);
      }
    }
    
    // Success response
    const adminQuery = isAdmin ? '&admin=true' : '';
    res.redirect(`/submit-form?session_date=${session_date}&success=true${adminQuery}`);
    
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
       return res.send(generateErrorHtml(req.body.deity, { 
         singer_name: "Another devotee", 
         title: "Unknown", 
         created_at: new Date() 
       }, req.body.session_date));
    }
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};

exports.planView = async (req, res) => {
try {
    const sessionDate = req.query.session_date;
    
    if (!sessionDate) {
      // Show date picker
      const today = getNextThursday();
      return res.send(generateDatePickerHtml(today));
    }
    
    // Fetch and display plan
    const results = await BhajanSubmission.findAll({
      where: { session_date: sessionDate }
    });
    
    const sorted = results.sort((a, b) => {
      // 1. Manual Drag-and-Drop sequence overrides everything else
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
      
      return a.singer_name.toLowerCase().localeCompare(b.singer_name.toLowerCase());
    });
    
    let rowsHtml = "";
    let whatsappLines = [];
    
    if (sorted.length === 0) {
      rowsHtml = '<tr><td colspan="7" style="text-align:center;">No bhajans found for this date.</td></tr>';
      whatsappLines.push("No bhajans found for this date.");
    } else {
      sorted.forEach((item, index) => {
        rowsHtml += `
          <tr>
            <td data-label="#">${index + 1}</td>
            <td data-label="Singer"><strong>${escapeHtml(item.singer_name)}</strong></td>
            <td data-label="Partner">${escapeHtml(item.partner_name || "-")}</td>
            <td data-label="Bhajan">${escapeHtml(item.title)}</td>
            <td data-label="Deity"><span class="deity-pill">${escapeHtml(item.deity)}</span></td>
            <td data-label="Scale">${escapeHtml(item.scale || "-")}</td>
            <td data-label="Speed">${escapeHtml(item.speed)}</td>
          </tr>
        `;
        
        let line = `${index + 1}) ${item.singer_name}`;
        if (item.partner_name) line += ` (${item.partner_name})`;
        line += ` – [${item.deity}] ${item.title} – Scale: ${item.scale || "N/A"}, Speed: ${item.speed ? item.speed.charAt(0).toUpperCase() + item.speed.slice(1) : "N/A"}`;
        whatsappLines.push(line);
      });
    }
    
    const headerLine = `Bhajan Plan – ${sessionDate}`;
    const whatsappText = headerLine + "\n" + whatsappLines.join("\n");
    const whatsappEncoded = encodeURIComponent(whatsappText);
    
    const html = generatePlanViewHtml(sessionDate, rowsHtml, whatsappText, whatsappEncoded);
    res.send(html);
    
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};
exports.submitApi = async (req, res) => {

try {
    const { session_date, singer_name, partner_name, bhajans } = req.body;
    
    for (const bhajan of bhajans) {
      await BhajanSubmission.create({
        session_date,
        singer_name,
        partner_name,
        title: bhajan.title,
        deity: bhajan.deity,
        scale: bhajan.scale,
        speed: bhajan.speed
      });
    }
    
    res.json({
      status: "ok",
      message: "Bhajans saved to database.",
      total_bhajans_received: bhajans.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.getPlan = async (req,res)=>{
    try {
    const { session_date } = req.params;
    
    const results = await BhajanSubmission.findAll({
      where: { session_date }
    });
    
    const sorted = results.sort((a, b) => {
      // 1. Manual Drag-and-Drop sequence overrides everything else
      if (a.list_order > 0 || b.list_order > 0) {
        if (a.list_order === 0) return 1; 
        if (b.list_order === 0) return -1;
        return a.list_order - b.list_order;
      }
      
      // 2. Default fallback sorting
      const deityCompare = deityOrderKey(a.deity) - deityOrderKey(b.deity);
      if (deityCompare !== 0) return deityCompare;
      
      const speedCompare = (SPEED_ORDER[(a.speed || '').toLowerCase()] || 1) - 
                           (SPEED_ORDER[(b.speed || '').toLowerCase()] || 1);
      if (speedCompare !== 0) return speedCompare;
      
      return a.singer_name.toLowerCase().localeCompare(b.singer_name.toLowerCase());
    });
    
    const plan = sorted.map((item, index) => ({
      order: index + 1,
      session_date: item.session_date,
      singer: item.singer_name,
      partner: item.partner_name,
      title: item.title,
      deity: item.deity,
      scale: item.scale,
      speed: item.speed
    }));
    
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Smart session redirection (routes to submit-form if open, history if moved/closed) ──
exports.sessionLink = async (req, res) => {
  try {
    const { getLocalDateStr } = require("../services/helpers");
    const SessionMeta = require("../models/SessionMeta");
    const SessionPermission = require("../models/SessionPermission");

    let sessionDate = req.query.session_date || req.query.date;

    const { dates: availableDates, status: thuStatus } = await getAvailableDates();

    if (!sessionDate) {
      sessionDate = thuStatus.openThursday;
    }

    if (!sessionDate) {
      return res.redirect("/database");
    }

    const todayStr = getLocalDateStr();
    const isPastOrToday = todayStr >= sessionDate;
    const meta = await SessionMeta.findByPk(sessionDate);
    const isManuallyLocked = meta && meta.is_locked;
    const isNextThuUnopened = sessionDate === thuStatus.nextThursdayDate && thuStatus.opensAt8pmToday;

    // Check if date is a Thursday or has explicit admin permission
    const [sYear, sMonth, sDay] = sessionDate.split('-').map(Number);
    const dayOfWeek = new Date(sYear, sMonth - 1, sDay).getDay();
    const isThursday = dayOfWeek === 4;
    const permission = await SessionPermission.findByPk(sessionDate);

    // If session submissions are closed/locked/past or not enabled, direct to History tab
    if (isPastOrToday || isManuallyLocked || isNextThuUnopened || (!isThursday && !permission)) {
      return res.redirect("/database");
    }

    // Submissions are open — direct to submit-form for this session
    return res.redirect(`/submit-form?session_date=${sessionDate}`);
  } catch (error) {
    console.error("sessionLink error:", error);
    res.redirect("/database");
  }
};
