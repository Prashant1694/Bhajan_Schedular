function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateSubmitFormHtml(
  sessionDate,
  mandatoryFilled,
  totalMandatory,
  optionalFilled,
  totalOptional,
  ganeshaCardHtml,
  otherDeitiesHtml,
  hanumanCard,
  isAdmin,
  showSuccess = false,
  submissionRowsHtml = "",
  submissionCount = 0,
) {
  const isAdminBool = isAdmin === true || isAdmin === 'true';
  const dateAttr = isAdminBool
    ? ""
    : 'readonly style="cursor:not-allowed; background:#f8f9fa;"';
  const dateNotice = isAdminBool
    ? `<div style="background:#fff3cd; border:1px solid #ffe066; color:#856404; padding:10px 14px; border-radius:8px; font-size:12.5px; margin-top:8px; line-height:1.5;">
        🔐 <strong>Admin Mode:</strong> You can select any date and manage bhajans at any time.
       </div>`
    : `<div style="background:#e7f5ff; border:1px solid #a5d8ff; color:#1864ab; padding:10px 14px; border-radius:8px; font-size:12.5px; margin-top:8px; line-height:1.5;">
        ⏰ <strong>Submission Deadline:</strong> Submissions for <strong>${sessionDate}</strong> close on <strong>the night before at 11:59 PM</strong>. At 12:00 AM on the session date, submissions automatically lock and move to the History tab.
       </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bhajan Scheduler - Sai Centre Gandhinagar</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container">
    
    <div class="header">
      <a href="${isAdminBool ? '/admin' : '/'}" class="home-btn" title="${isAdminBool ? 'Back to Dashboard' : 'Return to Homepage'}">${isAdminBool ? '🏠 Dashboard' : '🏠 Home'}</a>
      <h1>📋 Bhajan Scheduler</h1>
      <p>Sri Sathya Sai Seva Organisation - Gandhinagar</p>
    </div>
    
    <div id="scheduler" class="tab-content active">
      <div class="progress-section">
        <div class="progress-label">
          <span><strong>Session Progress</strong></span>
          <span>${mandatoryFilled}/${totalMandatory} Mandatory | ${optionalFilled}/${totalOptional} Optional</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${totalMandatory > 0 ? (mandatoryFilled / totalMandatory) * 100 : 100}%"></div>
        </div>
      </div>
      
      <form method="post" action="/submit-form" id="bhajanForm">
        <input type="hidden" name="admin" value="${isAdminBool}" />
        <div class="form-group">
          <label>📅 Bhajan Session Date</label>
          <input type="date" name="session_date" value="${sessionDate}" required ${dateAttr} />
          ${dateNotice}
        </div>
        
        <div class="bhajan-details" style="display:block; margin-top:0; background: #E1F5FE; border: 2px solid #81D4FA;">
          <div class="form-row cols-3">
            <div class="form-group">
              <label>Singer Name <span class="required">*</span></label>
              <div class="singer-autocomplete">
                <input type="text" name="singer_name" id="singerName" required placeholder="Enter your full name" autocomplete="off" aria-autocomplete="list" aria-controls="singerSuggestions" aria-expanded="false" />
                <div id="singerSuggestions" class="bhajan-suggestions" role="listbox" aria-label="Singer suggestions"></div>
              </div>
              <datalist id="singerList"></datalist>
            </div>
            
            <div class="form-group">
              <label>Partner Name</label>
              <input type="text" list="singerList" name="partner_name" id="partnerName" placeholder="Optional" autocomplete="off" />
            </div>

            <div class="form-group">
              <label>Gender <span class="required">*</span></label>
              <select name="gender" id="gender" required>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              <input type="hidden" name="locked_gender" id="lockedGender" />
            </div>
          </div>
        </div>
        
        <div style="font-size:17px; font-weight:700; color:#343a40; margin:24px 0 12px; display:flex; align-items:center; gap:8px;">
          ✨ Choose Deity <span class="required">*</span>
        </div>
        <div style="font-size:12px; color:#868e96; margin-bottom:16px; font-style:italic;">
          Tile color shows submission count • Tap available tile to select • Tap taken tile to view details
        </div>
        
        <div class="deity-grid ganesha-row">
          ${ganeshaCardHtml}
        </div>
        
        <div class="deity-grid other-deities-grid">
          ${otherDeitiesHtml}
        </div>
        
        <div class="deity-grid ganesha-row">
          ${hanumanCard}
        </div>
        
        <input type="hidden" name="deity" id="selectedDeity" />
        
        <div class="bhajan-details" id="bhajanDetails">
          <h3 style="font-size:18px; color:#e65100; margin-bottom:15px; font-weight:700; border-bottom:1px solid rgba(0,0,0,0.1); padding-bottom:10px;">
            🎶 Details for <span id="deityDisplay">---</span>
          </h3>
          
          <div class="form-row">
            <div class="form-group" style="flex: 2;">
              <label>Bhajan Title <span class="required">*</span></label>
              <div class="bhajan-autocomplete">
                <input type="hidden" name="master_bhajan_id" id="selectedMasterBhajanId" />
                <input name="title" id="bhajanTitleInput" required placeholder="Select Deity to search..." autocomplete="off" aria-autocomplete="list" aria-controls="bhajanSuggestions" aria-expanded="false" />
                <div id="bhajanSuggestions" class="bhajan-suggestions" role="listbox" aria-label="Bhajan suggestions"></div>
              </div>
              
              <div id="masterDataBadge" style="display:none; color:#28a745; font-size:12px; margin-top:4px; font-weight:600;">
                ✅ Master DB Synced <span id="badgeDetails"></span>
              </div>
              
              <div id="cooldownWarning" style="display:none; color:#d32f2f; background:#ffebee; padding:8px; border-radius:6px; font-size:12px; margin-top:8px; font-weight:500;"></div>
            </div>
            
            <div class="form-group" style="flex: 1;">
              <label>Speed / Tempo</label>
              <input type="text" name="speed" id="speedInput" readonly placeholder="Auto-filled..." style="background-color: #e9ecef; cursor: not-allowed; color: #495057; border: 1px solid #ced4da;" />
            </div>
          </div>
          
          <div class="form-row">
             <div class="form-group" style="flex: 1;">
                <label>🎵 Scale / Shruti</label>
                <input type="text" name="scale" id="scaleInput" placeholder="e.g., 1.5P or C#" />
                <div id="scaleSuggestionsContainer" style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                  <div id="singerPrevScaleBadge" style="display:none; color:#1971c2; background:#e7f5ff; border:1px solid #a5d8ff; padding:4px 8px; border-radius:6px; font-size:11.5px; font-weight:500;">
                    👤 <strong>Your Previous Scale:</strong> <span id="singerPrevScaleVal"></span>
                  </div>
                  <div id="genderCommonScaleBadge" style="display:none; color:#d9480f; background:#fff4e6; border:1px solid #ffd8a8; padding:4px 8px; border-radius:6px; font-size:11.5px; font-weight:500;">
                    👥 <strong>Most Common <span id="genderCommonScaleLabel">Male</span> Scale:</strong> <span id="genderCommonScaleVal"></span>
                  </div>
                </div>
             </div>
            <div class="form-group" style="flex: 1;">
               <label>🎼 Raag</label>
               <input type="text" name="raga" id="ragaInput" readonly placeholder="Auto-filled..." style="background-color: #e9ecef; cursor: not-allowed; color: #495057; border: 1px solid #ced4da;" />
            </div>
          </div>

          <input type="hidden" name="level" id="hiddenLevel" />
          <input type="hidden" name="language" id="hiddenLanguage" />
          
          <button type="button" id="preSubmitBtn" class="submit-btn">Submit Form</button>
        </div>
      </form>

      <section class="submitted-bhajans" aria-labelledby="submittedBhajansHeading">
        <div class="submitted-bhajans-heading">
          <div>
            <h3 id="submittedBhajansHeading">Bhajans already submitted</h3>
            <p>${submissionCount} bhajan${submissionCount === 1 ? "" : "s"} added for this session. Please avoid duplicate titles.</p>
          </div>
        </div>
        ${submissionCount > 0 ? `
          <div class="table-container">
            <table>
              <thead><tr><th>#</th><th>Singer</th><th>Deity</th><th>Bhajan</th><th>Speed</th><th>Scale</th></tr></thead>
              <tbody>${submissionRowsHtml}</tbody>
            </table>
          </div>
        ` : '<p class="submitted-bhajans-empty">No bhajans have been submitted yet.</p>'}
      </section>
    </div>
  </div>
  
  <div id="detailsModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalDeityName">Deity Details</h3>
        <button class="close-btn" onclick="closeModal()">&times;</button>
      </div>
      <div class="detail-row">
        <div class="detail-label">Singer</div>
        <div class="detail-value" id="modalSinger">---</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Bhajan Title</div>
        <div class="detail-value" id="modalBhajan">---</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Scale</div>
        <div class="detail-value" id="modalScale">---</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Speed</div>
        <div class="detail-value" id="modalSpeed">---</div>
      </div>
    </div>
  </div>

  <div id="confirmSubmitModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 style="color:#2f9e44;">Review Your Submission</h3>
        <button class="close-btn" onclick="closeConfirmModal()">&times;</button>
      </div>
      <div class="detail-row">
        <div class="detail-label">Singer(s)</div>
        <div class="detail-value" id="modSinger">---</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Deity</div>
        <div class="detail-value" id="modDeity">---</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Bhajan</div>
        <div class="detail-value" id="modTitle">---</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Scale/Shruti</div>
        <div class="detail-value" id="modScale">---</div>
      </div>
      <div style="display:flex; gap:12px; margin-top:24px; justify-content: flex-end;">
        <button type="button" id="editBtn" class="button secondary">Edit</button>
        <button type="button" id="confirmBtn" class="button" style="background:#28a745; border:none; color:white; padding:8px 24px; border-radius:8px; font-weight:600;">Confirm</button>
      </div>
    </div>
  </div>
  
  <div id="selectBhajanModal" class="modal">
    <div class="modal-content" style="max-width: 420px; text-align: center; padding: 28px 24px;">
      <div style="font-size: 42px; line-height: 1; margin-bottom: 14px;">🎵</div>
      <h3 style="color: #d9480f; margin-bottom: 10px; font-size: 19px; font-weight: 700;">
        Select Bhajan from Suggestions
      </h3>
      <p style="color: #495057; font-size: 14px; line-height: 1.55; margin-bottom: 24px;">
        Cannot submit bhajan without selecting from dropdown. Manual entry without selecting a suggested bhajan is not allowed.
      </p>
      <div style="display:flex; justify-content:center;">
        <button type="button" id="closeSelectBhajanModalBtn" class="button" style="width: 100%; padding: 12px 20px; font-weight: 600; font-size: 14.5px; background: linear-gradient(135deg, #ff9933 0%, #ff7700 100%); border: none; color: white; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(255, 119, 0, 0.25);">
          Select from Dropdown
        </button>
      </div>
    </div>
  </div>
  
  <script src="/js/script.js"></script>
</body>
</html>`;
}

function generatePlanViewHtml(
  sessionDate,
  rowsHtml,
  whatsappText,
  whatsappEncoded,
) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bhajan Plan - ${sessionDate}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    @media print {
      .no-print { display: none !important; }
      .container { box-shadow: none; max-width: 100%; margin: 0; border-radius: 0; }
      body { background: white; padding: 0; }
      table { border-collapse: collapse; width: 100%; font-family: 'Segoe UI', sans-serif; }
      th { background-color: #f1f3f5 !important; color: #000 !important; -webkit-print-color-adjust: exact; border: 1px solid #ccc; padding: 12px; font-size: 14px; }
      td { border: 1px solid #ccc; padding: 10px; font-size: 15px; color: #000; }
      .deity-pill { background: transparent !important; color: #000 !important; font-weight: bold; border: none; padding: 0; }
      h1 { font-size: 28px; color: #000; margin-bottom: 0; border-bottom: 2px solid #000; padding-bottom: 10px; }
      .header p { font-size: 18px; color: #333; margin-top: 5px; }
      .header { border-radius: 0; margin: 0 0 20px 0; background: none !important; padding: 0; text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container container-lg">
    <div class="header" style="border-radius: 16px 16px 0 0; margin: -20px -20px 20px -20px;">
      <h1>🕉️ Bhajan Plan</h1>
      <p>${sessionDate}</p>
    </div>

    <div class="no-print" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:20px; background:#fff; padding:16px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
      <form method="get" action="/plan-view" style="display:flex; align-items:center; gap:10px; margin:0; flex-grow:1;">
        <label style="font-weight:600; color:#495057; white-space:nowrap;">📅 Date:</label>
        <input type="date" name="session_date" value="${sessionDate}" required style="padding:8px 12px; border:1px solid #dee2e6; border-radius:8px; font-family:inherit;" />
        <button type="submit" class="button" style="padding:8px 16px; font-size:14px;">Go</button>
      </form>
      <div style="display:flex; gap:8px;">
        <button onclick="window.print()" class="button secondary" style="padding:8px 16px; font-size:14px;">🖨️ Print</button>
        <a href="/admin" class="button secondary" style="padding:8px 16px; font-size:14px;">🏠 Dashboard</a>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th width="5%">#</th>
            <th width="20%">Singer</th>
            <th width="15%">Partner</th>
            <th width="25%">Bhajan</th>
            <th width="15%">Deity</th>
            <th width="10%">Scale</th>
            <th width="10%">Speed</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
    
    <div class="no-print" style="margin-top:30px; background:#f8f9fa; padding:20px; border-radius:12px; border:1px solid #e9ecef;">
      <h3 style="color:#343a40; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
        <span style="font-size:24px;">📱</span> WhatsApp Share
      </h3>
      <p style="font-size:13px; color:#6c757d; margin-bottom:12px;">Copy the text below or click the button to share directly.</p>
      <textarea readonly style="width:100%; min-height:120px; padding:12px; border-radius:8px; border:1px solid #dee2e6; font-family:monospace; font-size:13px; resize:vertical;">${whatsappText}</textarea>
      <div style="margin-top:16px; text-align:right;">
        <a class="button" href="https://wa.me/?text=${whatsappEncoded}" target="_blank" style="background:#25D366; border:none; display:inline-flex; align-items:center; gap:8px;">
          <span>Share via WhatsApp</span>
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function generateErrorHtml(deity, existing, session_date) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Slot Taken</title><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/css/style.css"></head><body><div class="container" style="text-align:center; padding:32px;"><div class="error-icon">⚠️</div><h2 style="color:#e03131;">Slot Already Taken</h2><p>Sorry, the <strong>${deity}</strong> deity slot has already been taken.</p><div class="info-box"><strong>Taken by:</strong> ${escapeHtml(existing.singer_name)}<br><strong>Bhajan:</strong> ${escapeHtml(existing.title)}<br><strong>Time:</strong> ${new Date(existing.created_at).toLocaleTimeString()}</div><a class="button" href="/submit-form?session_date=${session_date}">← Go Back</a></div></body></html>`;
}

function generateSuccessHtml(
  singer_name,
  deity,
  title,
  speed,
  scale,
  session_date,
  isAdmin,
) {
  let actionButtons;
  if (isAdmin) {
    actionButtons = `
      <a class="button" href="/submit-form?admin=true&session_date=${session_date}">➕ Append New Bhajan</a>
      <a class="button secondary" href="/admin/date/${session_date}">⬅️ Back to List</a>
    `;
  } else {
    actionButtons = `
      <a class="button" href="/submit-form?session_date=${session_date}">View Updated Slots</a>
      <a class="button secondary" href="/plan-view?session_date=${session_date}">View Full Session Plan</a>
    `;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Success</title><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/css/style.css"></head><body><div class="container" style="text-align:center; padding:32px;"><div class="success-icon">✅</div><h2 style="color:#2f9e44;">Bhajan Submitted!</h2><div style="font-size:20px; margin-bottom:24px;">🙏 Sai Ram, ${escapeHtml(singer_name)}!</div><div class="details-box" style="text-align:left;"><div><strong>Deity:</strong> ${deity}</div><div><strong>Bhajan:</strong> ${escapeHtml(title)}</div><div><strong>Speed:</strong> ${escapeHtml(speed)}</div><div><strong>Scale:</strong> ${escapeHtml(scale || "Not specified")}</div><div><strong>Session:</strong> ${session_date}</div></div><p>Your bhajan has been recorded.</p><div style="display:flex; flex-direction:column; gap:12px; margin-top:24px;">${actionButtons}</div></div></body></html>`;
}

function generateDatePickerHtml(today) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Select Date</title><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/css/style.css"></head><body style="justify-content: center;"><div class="container" style="max-width:480px; padding:24px;"><h2 style="text-align: center; margin-bottom: 16px;">🕉️ View Bhajan Plan</h2><form method="get" action="/plan-view"><label style="display:block; margin-bottom:8px;">Bhajan Date</label><input type="date" name="session_date" value="${today}" required style="width:100%; padding:12px; margin-bottom:16px;" /><button type="submit" class="button" style="width:100%;">Show Plan</button></form></div></body></html>`;
}

function generateAdminSessionViewHtml(date, submissions, isLocked) {
  const rows = submissions
    .map(
      (s) => `
    <tr data-id="${s.id}" class="draggable-row" draggable="true" style="cursor: grab;">
      <td style="color:#adb5bd; cursor:grab; font-size:18px;" class="drag-handle" title="Drag to reorder">☰</td>
      <td data-label="Singer(s)"><strong>${escapeHtml(s.singer_name)}</strong>${s.partner_name ? `<br><small>& ${escapeHtml(s.partner_name)}</small>` : ""}</td>
      <td data-label="Gender">${escapeHtml(s.gender || "-")}</td>
      <td data-label="Deity"><span class="deity-pill">${escapeHtml(s.deity)}</span></td>
      <td data-label="Title">${escapeHtml(s.title)}</td>
      <td data-label="Tempo">${escapeHtml(s.speed || "-")}</td>
      <td data-label="Raag">${escapeHtml(s.raga || "-")}</td>
      <td data-label="Scale">${escapeHtml(s.scale || "-")}</td>
      <td data-label="Actions">
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <a href="/admin/edit/${s.id}" class="button" style="padding:6px 12px; font-size:13px; text-decoration:none;">Edit</a>
          <form action="/admin/delete/${s.id}" method="POST" onsubmit="return confirm('Delete this entry?');" style="margin:0;">
            <button type="submit" class="button" style="padding:6px 12px; font-size:13px; background:#e03131; border:none; color:white; cursor:pointer;">Del</button>
          </form>
        </div>
      </td>
    </tr>
  `,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Admin - Session Details</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container container-xl">
    <div class="header">
      <h1>🛠️ Session Details</h1>
      <p>Date: ${date}</p>
      ${isLocked ? `<span style="background:#e03131; color:white; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:bold; margin-top:10px; display:inline-block;">🔒 SESSION LOCKED</span>` : ""}
    </div>
    
    <div style="margin-bottom: 24px; display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
      <a href="/admin" class="button secondary">⬅️ Back to Calendar</a>
      <a href="/submit-form?admin=true&session_date=${date}" class="button">➕ Add / Append to this Date</a>
      <a href="/admin/rules?date=${date}" class="button secondary">⚙️ Session Rules</a>
      <button onclick="toggleSessionLock('${date}', ${!isLocked})" class="button" style="background:${isLocked ? "#28a745" : "#e03131"}; border:none;">${isLocked ? "🔓 Unlock Submissions" : "🔒 Lock Submissions"}</button>
      <a href="/plan-view" class="button secondary">📅 View Plans</a>
      <a href="/admin" class="button secondary">🏠 Dashboard</a>
    </div>
    
    <div style="background:#fff3cd; border:1px solid #ffe066; padding:15px; border-radius:12px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <strong>↕️ Reorder Sequence:</strong> Drag and drop the ☰ handle on rows to arrange the musical sequence.
      </div>
      <button id="saveOrderBtn" class="button" style="background:#28a745; border:none; display:none;" onclick="saveReorderSequence()">💾 Save New Sequence</button>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th width="30"></th>
            <th>Singer(s)</th>
            <th>Gender</th>
            <th>Deity</th>
            <th>Title</th>
            <th>Tempo</th>
            <th>Raag</th>
            <th>Scale</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="sortable-body">
          ${rows.length > 0 ? rows : '<tr><td colspan="9" style="padding:20px; text-align:center;">No records found for this date.</td></tr>'}
        </tbody>
      </table>
    </div>
    
    <div style="margin-top:40px; background:#f8f9fa; padding:20px; border-radius:12px; border:1px solid #dee2e6;">
      <h3 style="margin-bottom:10px; color:#495057;">🔄 Copy Previous Session</h3>
      <p style="font-size:13px; color:#6c757d; margin-bottom:15px;">Duplicate the singer lineup from a past session directly into this date.</p>
      <form action="/admin/copy-session" method="POST" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <input type="hidden" name="target_date" value="${date}">
        <input type="date" name="source_date" required class="filter-input" style="max-width:200px;">
        <button type="submit" class="button secondary" onclick="return confirm('Copy all entries? This will append to the current list.')">Copy Lineup</button>
      </form>
    </div>
  </div>
  <script src="/js/script.js"></script>
</body>
</html>`;
}

function generateAdminCalendarHtml(
  year,
  month,
  eventCounts,
  permissionMap = {},
  descriptionMap = {},
  missingBhajans = [],
) {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const currentMonthName = monthNames[month - 1];

  // Calendar Logic
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sunday

  let calendarCells = "";

  // Empty cells for previous month
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells += `<div class="calendar-day empty"></div>`;
  }

  // Days
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = eventCounts[dateStr] || 0;
    const perm = permissionMap[dateStr];
    const desc = descriptionMap[dateStr] || "";

    // Determine Color Logic
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay(); // 0=Sun, 4=Thu
    const isToday = isCurrentMonth && today.getDate() === day;

    let colorClass = "day-none";

    if (perm === "special") {
      colorClass = "day-special";
    } else if (perm === "festival") {
      colorClass = "day-festival-perm";
    } else if (dayOfWeek === 4) {
      colorClass = "day-thursday";
    } else if (count > 0) {
      colorClass = "day-festival";
    }
    
    const dayClass = `calendar-day ${colorClass} ${isToday ? "today" : ""}`;

    // Changed from <a> to <div onclick> for popup
    calendarCells += `
      <div class="${dayClass}" onclick="openAdminDateModal('${dateStr}', '${perm || ""}', '${desc.replace(/'/g, "&apos;")}')" style="cursor:pointer;">
        <div class="calendar-date-num">${day}</div>
        <div class="calendar-actions">
          ${count > 0 ? `<div class="event-pill">${count} Bhajans</div>` : ""}
          ${perm ? `<div class="perm-pill">${perm.toUpperCase()}</div>` : ""}
        </div>
      </div>
    `;
  }

  // Navigation
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Admin Calendar</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container container-xl">
    <div class="header">
      <h1>🗓️ Admin Calendar</h1>
      <p>Manage Sessions</p>
    </div>
    
    <div style="margin-bottom: 20px; display:flex; gap:10px; flex-wrap:wrap;">
      <a href="/admin" class="button secondary">🏠 Dashboard</a>
      <a href="/submit-form?admin=true" class="button secondary">➕ New Entry (Any Date)</a>
      <a href="/admin/rules" class="button secondary">⚙️ Default Deity Rules</a>
      <a href="/admin/singers" class="button secondary" style="background:#e6fcf5; color:#099268; border-color:#c3fae8;">👤 Singer Directory</a>
      <a href="/admin/singer-dictionary" class="button secondary" style="background:#e3f2fd; color:#0277bd; border-color:#90caf9;">📖 Singer Dictionary</a>
      <a href="/master-bank" class="button secondary" style="background:#fff3cd; color:#e67700; border-color:#ffe066;">📚 Edit Master Bank</a>
      <a href="/admin/import-sessions" class="button secondary" style="background:#e8f5e9; color:#2e7d32; border-color:#c8e6c9;">📥 Import Past Sessions</a>
      <a href="/admin/analytics" class="button secondary" style="background:#f3f0ff; color:#6741d9; border-color:#e5dbff;">📈 Analytics</a>
    </div>

    <div class="calendar-header">
      <a href="/admin?month=${prevMonth}&year=${prevYear}" class="calendar-nav-btn">←</a>
      <div class="calendar-title">${currentMonthName} ${year}</div>
      <a href="/admin?month=${nextMonth}&year=${nextYear}" class="calendar-nav-btn">→</a>
    </div>

    <div class="calendar-legend">
      <div class="legend-item"><span class="legend-color day-none"></span> No Bhajans</div>
      <div class="legend-item"><span class="legend-color day-thursday"></span> Thursday</div>
      <div class="legend-item"><span class="legend-color day-special"></span> Special</div>
      <div class="legend-item"><span class="legend-color day-festival-perm"></span> Festival</div>
    </div>

    <div class="calendar-grid">
      <div class="calendar-day-header">Sun</div><div class="calendar-day-header">Mon</div><div class="calendar-day-header">Tue</div>
      <div class="calendar-day-header">Wed</div><div class="calendar-day-header">Thu</div><div class="calendar-day-header">Fri</div>
      <div class="calendar-day-header">Sat</div>
      ${calendarCells}
    </div>

    <!-- Missing Bhajan Catcher -->
    <div class="admin-section" style="margin-top: 40px; padding: 20px; background: #fff3cd; border-radius: 12px; border: 1px solid #ffe066;">
      <h2 style="color: #d9480f; margin-bottom: 15px;">🚨 Missing Bhajan Catcher</h2>
      <p style="font-size:14px; margin-bottom:15px; color:#555;">The following bhajans have been sung in sessions but are missing from the Master Database.</p>
      <ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:10px;">
        ${
          missingBhajans.length === 0
            ? '<li style="color:#2b8a3e; font-weight:bold;">✅ All sung bhajans are safely in the Master Database!</li>'
            : missingBhajans
                .map(
                  (b) => `
          <li style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px 15px; border-radius:8px; border:1px solid #ffd43b;">
            <strong>${b}</strong>
            <button class="button" style="padding:6px 12px; font-size:12px; background:#4dabf7; border:none;" onclick="openMissingBhajanModal('${b.replace(/'/g, "\\'")}')">➕ Add to Master</button>
          </li>
        `,
                )
                .join("")
        }
      </ul>
    </div>

  </div>

  <!-- Admin Date Modal -->
  <div id="adminDateModal" class="modal">
    <div class="modal-content" style="text-align:center; max-width:350px;">
      <div class="modal-header">
        <h3 id="adminModalDate">Manage Date</h3>
        <button class="close-btn" onclick="closeAdminModal()">&times;</button>
      </div>
      <div style="margin-bottom:15px; text-align:left;">
        <label style="display:block; margin-bottom:5px; font-size:12px; font-weight:600; color:#495057;">Description <span style="color:#e03131;">*</span></label>
        <input type="text" id="permDescription" placeholder="Reason (e.g. Mahashivratri)" maxlength="100" style="width:100%; padding:10px; border:1px solid #dee2e6; border-radius:8px; font-family:inherit;">
      </div>
      <div style="display:grid; gap:12px;">
        <button onclick="updatePermission('special')" class="button" style="background:#4dabf7; border:none;">✨ Add Special Bhajan</button>
        <button onclick="updatePermission('festival')" class="button" style="background:#ff922b; border:none;">🪔 Add Festival Bhajan</button>
        <button onclick="updatePermission('clear')" class="button secondary">❌ Clear Permission</button>
        <hr style="width:100%; border:0; border-top:1px solid #eee; margin:8px 0;">
        <button onclick="viewAdminDate()" class="button secondary">📅 View / Edit Plan</button>
      </div>
    </div>
  </div>

  <!-- Missing Bhajan Catcher Modal -->
  <div id="missingBhajanModal" class="modal">
    <div class="modal-content" style="max-width: 400px; text-align:left;">
      <div class="modal-header">
        <h3>Add to Master Database</h3>
        <button class="close-btn" onclick="closeMissingBhajanModal()">&times;</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px; margin-top:15px;">
        <div><label style="font-size:12px; font-weight:600; color:#495057;">Title</label>
          <input type="text" id="mbTitle" readonly style="width:100%; padding:8px; border:1px solid #ddd; background:#f5f5f5; border-radius:4px;"></div>
        <div><label style="font-size:12px; font-weight:600; color:#495057;">Deity</label>
          <select id="mbDeity" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
            <option value="Ganesha">Ganesha</option><option value="Guru">Guru</option><option value="Mata">Mata</option><option value="SarvaDharma">SarvaDharma</option><option value="Sai">Sai</option><option value="Shiva">Shiva</option><option value="Krishna">Krishna</option><option value="Rama">Rama</option><option value="Narayana">Narayana</option><option value="Vitthala">Vitthala</option><option value="Hanuman">Hanuman</option>
          </select></div>
        <div><label style="font-size:12px; font-weight:600; color:#495057;">Tempo (Speed)</label>
          <select id="mbTempo" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
            <option value="Slow">Slow</option><option value="Medium">Medium</option><option value="Fast">Fast</option>
          </select></div>
        <div><label style="font-size:12px; font-weight:600; color:#495057;">Raga</label>
          <input type="text" id="mbRaga" placeholder="e.g., Yaman Kalyani" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;"></div>
        <div><label style="font-size:12px; font-weight:600; color:#495057;">Shruti ( padding:8px; border:1px solid #ddd; border-radius:4px;"></div>
        <div><label style="font-size:12px; font-weight:600; color:#495057;">Shruti (Female Scale)</label>
          <input type="text" id="mbShrutiFemale" placeholder="e.g., G#" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;"></div>
        <div><label style="font-size:12px; font-weight:600; color:#495057;">Level</label>
          <select id="mbLevel" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
            <option value="">Unknown</option><option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Advanced">Advanced</option>
          </select></div>
        <button class="button" onclick="saveMissingBhajan()" style="margin-top:10px; background:#28a745; border:none;">Save to Master DB</button>
      </div>
    </div>
  </div>
  <script src="/js/script.js"></script>
</body>
</html>`;
}

function generateEditFormHtml(s) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Edit Bhajan</title><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/admin.css"></head><body class="admin-page">
  <div class="admin-layout">
    <div class="main-content">
    <div class="container">
    <div style="margin-bottom:20px; display:flex; gap:10px; align-items:center;">
      <a href="/admin/date/${s.session_date}" class="button secondary">⬅️ Back to Session</a>
      <a href="/admin" class="button secondary">🏠 Dashboard</a>
    </div>
    <h2>✏️ Edit Bhajan Entry</h2>
    <form method="post" action="/admin/edit/${s.id}">
      <div class="form-row">
        <div class="form-group"><label>Session Date</label><input type="date" name="session_date" value="${s.session_date}" required /></div>
        <div class="form-group"><label>Deity</label><input type="text" name="deity" value="${s.deity}" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Singer Name</label><input type="text" name="singer_name" value="${escapeHtml(s.singer_name)}" required /></div>
        <div class="form-group"><label>Partner</label><input type="text" name="partner_name" value="${escapeHtml(s.partner_name || "")}" /></div>
      </div>
      <div class="form-group"><label>Title</label><input type="text" name="title" value="${escapeHtml(s.title)}" required /></div>
      <div class="form-row">
        <div class="form-group"><label>Scale</label><input type="text" name="scale" value="${escapeHtml(s.scale || "")}" /></div>
        <div class="form-group"><label>Speed</label>
          <select name="speed" required>
            <option value="slow" ${s.speed === "slow" ? "selected" : ""}>Slow</option>
            <option value="medium" ${s.speed === "medium" ? "selected" : ""}>Medium</option>
            <option value="fast" ${s.speed === "fast" ? "selected" : ""}>Fast</option>
          </select>
        </div>
        <div class="form-group"><label>🎼 Raag</label><input type="text" name="raga" value="${escapeHtml(s.raga || "")}" placeholder="e.g. Yaman Kalyani" /></div>
      </div>
      <div style="margin-top:20px; display:flex; gap:10px;"><button type="submit" class="button">Save Changes</button><a href="/admin/date/${s.session_date}" class="button secondary">Cancel</a></div>
    </form>
    </div>
    </div>
  </div>
  <script src="/js/script.js"></script>
</body></html>`;
}

function generateAdminRulesHtml(rules, date) {
  const title =
    date === "default" ? "⚙️ Default Deity Rules" : `⚙️ Rules for ${date}`;
  const subtitle =
    date === "default"
      ? "Set base limits for all future sessions"
      : "Set custom limits for this specific session";

  const rows = rules
    .map(
      (r) => `
    <tr>
      <td>
        <strong>${r.deity_name}</strong>
        <input type="hidden" class="rule-deity" value="${r.deity_name}">
      </td>
      <td><input type="number" class="rule-min filter-input" value="${r.min_required}" min="0" max="9" style="width:80px; text-align:center;"></td>
      <td><input type="number" class="rule-max filter-input" value="${r.max_allowed}" min="0" max="99" style="width:80px; text-align:center;"></td>
    </tr>
  `,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Manage Deity Rules</title><meta name="viewport" content="width=device-width, initial-scale=1" /><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/style.css"></head><body>
  <div class="container container-lg">
    <div class="header">
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    <div style="margin-bottom: 20px;">
      <a href="${date === "default" ? "/admin" : `/admin/date/${date}`}" class="button secondary">⬅️ Go Back</a>
    </div>
    <input type="hidden" id="ruleDate" value="${date}">
    <div class="table-container">
      <table id="rulesTable">
        <thead>
          <tr>
            <th>Deity</th>
            <th>Min Required</th>
            <th>Max Allowed <br><small style="font-weight:normal">(0 = Blocked)</small></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:20px; text-align:right;">
      <button class="button" onclick="saveDeityRules()" style="background:#28a745; border:none;">💾 Save Rules</button>
    </div>
  </div><script src="/js/script.js"></script></body></html>`;
}

function generateAdminImportSessionsHtml(resultInfo = null) {
  let resultBanner = "";
  if (resultInfo) {
    if (resultInfo.error) {
      resultBanner = `
        <div style="background:#ffebee; border:1px solid #ffcdd2; color:#c62828; padding:16px; border-radius:12px; margin-bottom:24px;">
          <strong>❌ Error importing sessions:</strong> ${escapeHtml(resultInfo.error)}
        </div>
      `;
    } else {
      const sessionList = (resultInfo.sessionSummary || [])
        .map((s) => `<li>📅 <strong>${s.date}</strong>: ${s.count} bhajans</li>`)
        .join("");
      resultBanner = `
        <div style="background:#e8f5e9; border:1px solid #c8e6c9; color:#2e7d32; padding:18px; border-radius:12px; margin-bottom:24px;">
          <h3 style="margin:0 0 8px 0; color:#1b5e20;">🎉 Import Successful!</h3>
          <p style="margin:0 0 10px 0;">Successfully processed <strong>${resultInfo.totalSessions} session(s)</strong> and <strong>${resultInfo.totalBhajans} bhajan(s)</strong>.</p>
          <ul style="margin:0; padding-left:20px; font-size:14px;">${sessionList}</ul>
          <div style="margin-top:14px;">
            <a href="/database" class="button" style="padding:6px 16px; font-size:13px; text-decoration:none;">🗃️ View in History</a>
          </div>
        </div>
      `;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Admin - Import Past Sessions</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container container-xl">
    <div class="header">
      <h1>📥 Import Past Sessions</h1>
      <p>Bulk add historical bhajan records into the database</p>
    </div>
    
    <div style="margin-bottom: 24px; display:flex; gap:10px; flex-wrap:wrap;">
      <a href="/admin" class="button secondary">🏠 Dashboard</a>
      <a href="/database" class="button secondary">🗃️ View History</a>
      <a href="/plan-view" class="button secondary">📅 View Plans</a>
    </div>

    ${resultBanner}

    <div style="background:#fff; border:1px solid var(--border); border-radius:var(--radius); padding:24px; margin-bottom:24px;">
      <form action="/admin/import-sessions" method="POST">
        <div style="margin-bottom:16px;">
          <label style="display:block; font-weight:700; font-size:15px; margin-bottom:8px; color:#343a40;">
            📋 Paste Session Text / WhatsApp Plan Data below:
          </label>
          <textarea name="raw_text" required rows="14" placeholder="Paste your past session text here...&#10;&#10;Example 1:&#10;23/07/2026&#10;1. Gajanana Gajanana, Prathama Poojana — A#&#10;2. Jaya Kailash Patey Shiva Shankara — C#&#10;&#10;Example 2:&#10;Bhajan Plan – 2026-07-30&#10;1) Nisarg Chaudhari – [Ganesha] Prathama Vandana Gowri Nandana – Scale: 2.5P, Speed: Slow" style="width:100%; padding:14px; border:1px solid #ced4da; border-radius:8px; font-family:monospace; font-size:13.5px; line-height:1.5; resize:vertical; background:#f8f9fa;"></textarea>
        </div>

        <button type="submit" class="button" style="background:#28a745; border:none; padding:12px 28px; font-weight:700; font-size:15px; cursor:pointer;">
          🚀 Import Sessions to Database
        </button>
      </form>
    </div>

    <div style="background:#f1f3f5; border:1px solid #dee2e6; border-radius:var(--radius); padding:20px;">
      <h3 style="margin-top:0; color:#343a40; font-size:16px;">💡 Supported Format Examples</h3>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-top:12px;">
        <div style="background:#fff; padding:14px; border-radius:8px; border:1px solid #e9ecef;">
          <strong style="color:#e65100;">Format 1: Plain Text</strong>
          <pre style="margin:8px 0 0 0; font-size:12px; color:#495057;">23/07/2026
1. Bhajan Title — Scale
2. Singer Name: Bhajan Title — Scale</pre>
        </div>
        <div style="background:#fff; padding:14px; border-radius:8px; border:1px solid #e9ecef;">
          <strong style="color:#e65100;">Format 2: WhatsApp Plan View</strong>
          <pre style="margin:8px 0 0 0; font-size:12px; color:#495057;">Bhajan Plan – 2026-07-30
1) Singer (Partner) – [Deity] Title – Scale: 2.5P, Speed: Slow</pre>
        </div>
      </div>
    </div>
  </div>
  <script src="/js/script.js"></script>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  generateSubmitFormHtml,
  generatePlanViewHtml,
  generateErrorHtml,
  generateSuccessHtml,
  generateDatePickerHtml,
  generateEditFormHtml,
  generateAdminCalendarHtml,
  generateAdminSessionViewHtml,
  generateAdminRulesHtml,
  generateAdminImportSessionsHtml,
};

