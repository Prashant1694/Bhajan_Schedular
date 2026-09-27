const XLSX = require("xlsx");
const sequelize = require("../config/database");
const { DiwaliParticipant, DiwaliParticipantBhajan, MasterBhajan } = require("../models/diwaliModels");

/**
 * Normalizes header keys
 */
function normalizeHeader(h) {
  return String(h || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Maps raw sheet headers to standard fields
 */
function detectColumns(headers) {
  const map = {
    sr: -1,
    lead_name: -1,
    partner_name: -1,
    bhajan_title: -1,
    scale: -1,
    tabla: -1,
    shruti: -1,
    deity: -1,
    remarks: -1
  };

  headers.forEach((h, idx) => {
    const nh = normalizeHeader(h);
    if (nh === "sr" || nh === "srno" || nh === "sno" || nh === "no") {
      map.sr = idx;
    } else if (nh === "partner" || nh === "partnername" || nh === "colead" || nh === "secondlead") {
      map.partner_name = idx;
    } else if (nh === "lead" || nh === "leadsinger" || nh === "leadname" || nh === "name" || nh === "singer" || nh === "singername") {
      // If we don't have lead yet, or if this specifically says "lead"
      if (map.lead_name === -1 || nh.includes("lead")) {
        map.lead_name = idx;
      }
    } else if (nh === "bhajan" || nh === "bhajantitle" || nh === "title" || nh === "song") {
      map.bhajan_title = idx;
    } else if (nh === "scale" || nh === "key") {
      map.scale = idx;
    } else if (nh === "tabla" || nh === "taal") {
      map.tabla = idx;
    } else if (nh === "shruti" || nh === "sruti") {
      map.shruti = idx;
    } else if (nh === "deity" || nh === "god") {
      map.deity = idx;
    } else if (nh.includes("remark") || nh.includes("comment") || nh.includes("note")) {
      map.remarks = idx;
    }
  });

  return map;
}

/**
 * Parses Excel buffer into preview data
 */
async function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const allMasterBhajans = await MasterBhajan.findAll({
    attributes: ["id", "title", "deity", "shruti"]
  });

  const masterLookup = new Map();
  allMasterBhajans.forEach(m => {
    masterLookup.set((m.title || "").toLowerCase().trim(), m);
  });

  const parsedParticipants = [];
  let totalRows = 0;
  let missingLeadCount = 0;
  let missingPartnerCount = 0;
  let missingBhajanCount = 0;
  let invalidRowCount = 0;
  const seenBhajanKeys = new Set();
  let duplicateBhajansCount = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!data || data.length === 0) continue;

    // Detect gender from sheet name
    const lowerSheet = sheetName.toLowerCase();
    let defaultGender = "Gents";
    if (lowerSheet.includes("lad") || lowerSheet.includes("female") || lowerSheet.includes("women")) {
      defaultGender = "Ladies";
    }

    // Find header row (first non-empty row)
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(10, data.length); r++) {
      const row = data[r];
      if (Array.isArray(row) && row.some(cell => String(cell).trim().length > 0)) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx === -1) continue;

    const rawHeaders = data[headerRowIdx];
    const colMap = detectColumns(rawHeaders);

    let currentLeadName = "";
    let currentPartnerName = "";
    let currentParticipantGroup = null;

    for (let r = headerRowIdx + 1; r < data.length; r++) {
      const row = data[r];
      if (!Array.isArray(row) || row.every(cell => String(cell).trim().length === 0)) {
        continue; // skip completely empty rows
      }

      totalRows++;

      let rawLead = colMap.lead_name !== -1 ? String(row[colMap.lead_name] || "").trim() : "";
      let rawPartner = colMap.partner_name !== -1 ? String(row[colMap.partner_name] || "").trim() : "";
      const rawBhajan = colMap.bhajan_title !== -1 ? String(row[colMap.bhajan_title] || "").trim() : "";
      const scale = colMap.scale !== -1 ? String(row[colMap.scale] || "").trim() : "";
      const tabla = colMap.tabla !== -1 ? String(row[colMap.tabla] || "").trim() : "";
      const shruti = colMap.shruti !== -1 ? String(row[colMap.shruti] || "").trim() : "";
      const deity = colMap.deity !== -1 ? String(row[colMap.deity] || "").trim() : "";
      const remarks = colMap.remarks !== -1 ? String(row[colMap.remarks] || "").trim() : "";

      // Legacy handling: if rawLead is non-empty, start a new singer context.
      // If rawLead is empty, inherit from currentLeadName.
      if (rawLead.length > 0) {
        currentLeadName = rawLead;
        currentPartnerName = rawPartner;
      } else {
        // Inherited row
        rawLead = currentLeadName;
        rawPartner = currentPartnerName;
      }

      // Check validation flags
      const isMissingLead = !rawLead;
      const isMissingPartner = !rawPartner;
      const isMissingBhajan = !rawBhajan;

      if (isMissingLead) missingLeadCount++;
      if (isMissingPartner) missingPartnerCount++;
      if (isMissingBhajan) missingBhajanCount++;

      const isInvalid = isMissingLead || isMissingPartner || isMissingBhajan;
      if (isInvalid) invalidRowCount++;

      // Check duplicates
      const bhajanKey = `${defaultGender}|${rawBhajan.toLowerCase()}`;
      if (rawBhajan && seenBhajanKeys.has(bhajanKey)) {
        duplicateBhajansCount++;
      } else if (rawBhajan) {
        seenBhajanKeys.add(bhajanKey);
      }

      // Match master bhajan
      let matchedMaster = null;
      if (rawBhajan) {
        matchedMaster = masterLookup.get(rawBhajan.toLowerCase()) || null;
      }

      // Find or create participant group
      const groupKey = `${rawLead.toLowerCase()}|${rawPartner.toLowerCase()}|${defaultGender}`;
      if (!currentParticipantGroup || currentParticipantGroup.groupKey !== groupKey) {
        currentParticipantGroup = {
          tempId: `p_${parsedParticipants.length + 1}`,
          groupKey,
          lead_name: rawLead,
          partner_name: rawPartner,
          gender: defaultGender,
          remarks: "",
          isMissingLead,
          isMissingPartner,
          bhajans: []
        };
        parsedParticipants.push(currentParticipantGroup);
      }

      // If remarks was provided on the row, append to participant remarks
      if (remarks && !currentParticipantGroup.remarks) {
        currentParticipantGroup.remarks = remarks;
      }

      if (rawBhajan) {
        currentParticipantGroup.bhajans.push({
          tempId: `b_${totalRows}`,
          bhajan_title: rawBhajan,
          scale: scale || (matchedMaster?.shruti || ""),
          tabla: tabla,
          shruti: shruti || (matchedMaster?.shruti || ""),
          deity: deity || (matchedMaster?.deity || ""),
          remarks: remarks,
          master_bhajan_id: matchedMaster ? matchedMaster.id : null,
          matchedTitle: matchedMaster ? matchedMaster.title : null,
          isInvalid: isMissingBhajan
        });
      }
    }
  }

  const totalBhajansDetected = parsedParticipants.reduce((sum, p) => sum + p.bhajans.length, 0);

  return {
    summary: {
      totalRows,
      participantsDetected: parsedParticipants.length,
      bhajansDetected: totalBhajansDetected,
      missingLeadCount,
      missingPartnerCount,
      missingBhajanCount,
      invalidRowCount,
      duplicateBhajansCount,
      hasErrors: missingLeadCount > 0 || missingPartnerCount > 0 || missingBhajanCount > 0
    },
    participants: parsedParticipants
  };
}

/**
 * Commits verified import payload to database
 */
async function commitImport(eventId, confirmedParticipants) {
  if (!confirmedParticipants || !Array.isArray(confirmedParticipants) || confirmedParticipants.length === 0) {
    throw new Error("No participant data provided for import.");
  }

  const t = await sequelize.transaction();
  let createdParticipantsCount = 0;
  let createdBhajansCount = 0;

  try {
    for (const p of confirmedParticipants) {
      const cleanLead = (p.lead_name || "").trim();
      const cleanPartner = (p.partner_name || "").trim();
      const cleanGender = (p.gender || "").trim();

      if (!cleanLead || !cleanPartner) {
        throw new Error(
          `Cannot import: Every record must have both Lead Singer Name and Partner Name. Record with Lead '${cleanLead || "EMPTY"}' and Partner '${cleanPartner || "EMPTY"}' is incomplete.`
        );
      }

      if (!["Gents", "Ladies"].includes(cleanGender)) {
        throw new Error(`Invalid gender '${cleanGender}' for participant ${cleanLead}.`);
      }

      const validBhajans = (p.bhajans || []).filter(b => (b.bhajan_title || "").trim().length > 0);
      if (validBhajans.length === 0) {
        continue; // skip participant with no bhajans
      }

      const participant = await DiwaliParticipant.create(
        {
          event_id: eventId,
          lead_name: cleanLead,
          partner_name: cleanPartner,
          gender: cleanGender,
          remarks: (p.remarks || "").trim()
        },
        { transaction: t }
      );
      createdParticipantsCount++;

      let order = 1;
      for (const b of validBhajans) {
        const title = (b.bhajan_title || "").trim();
        let masterId = b.master_bhajan_id ? parseInt(b.master_bhajan_id, 10) : null;

        if (!masterId && title) {
          const found = await MasterBhajan.findOne({
            where: sequelize.where(
              sequelize.fn("LOWER", sequelize.col("title")),
              title.toLowerCase()
            ),
            transaction: t
          });
          if (found) masterId = found.id;
        }

        await DiwaliParticipantBhajan.create(
          {
            participant_id: participant.id,
            event_id: eventId,
            master_bhajan_id: masterId,
            bhajan_title: title,
            scale: (b.scale || "").trim(),
            tabla: (b.tabla || "").trim(),
            shruti: (b.shruti || "").trim(),
            deity: (b.deity || "").trim(),
            remarks: (b.remarks || "").trim(),
            original_order: order++
          },
          { transaction: t }
        );
        createdBhajansCount++;
      }
    }

    await t.commit();
    return {
      success: true,
      createdParticipantsCount,
      createdBhajansCount
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

module.exports = {
  parseExcelBuffer,
  commitImport
};
