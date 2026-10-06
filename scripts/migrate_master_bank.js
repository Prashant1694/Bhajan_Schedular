const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const sequelize = require("../config/database");
const { normalizeBhajanTitle } = require("../services/fuzzyMatcher");

/**
 * Authoritative Master Bhajan Migration Script
 * Prioritizes data integrity, preserves existing IDs, handles archiving,
 * and maintains historical foreign keys.
 */

const EXCEL_FILE = path.join(__dirname, "..", "data", "master_bhajans_fully_enriched.xlsx");
const DB_FILE = path.join(__dirname, "..", "bhajans.db");

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const YYYY = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const DD = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
}

async function readAndValidateExcel() {
  if (!fs.existsSync(EXCEL_FILE)) {
    throw new Error(`Excel source file not found at: ${EXCEL_FILE}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE);
  const sheet = workbook.worksheets[0];
  const headers = [];
  const rawRows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.text
          ? cell.text.trim()
          : cell.value
            ? String(cell.value).trim()
            : "";
      });
    } else {
      const r = {};
      for (let c = 1; c < headers.length; c++) {
        const h = headers[c];
        if (h) {
          let val = row.getCell(c).value;
          if (val && typeof val === "object") {
            if (val.text) val = val.text;
            else if (val.result !== undefined) val = val.result;
          }
          r[h] = val !== undefined ? val : null;
        }
      }
      rawRows.push(r);
    }
  });

  let recordsWithId = 0;
  let recordsWithoutId = 0;
  const withoutIdList = [];
  const seenIds = new Map();
  const duplicateIds = [];
  let blankTitles = 0;
  let blankDeities = 0;
  const normalizedTitlesMap = new Map();
  const duplicateNormalizedTitles = [];
  const cleanRows = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2;

    const rawId = row.id;
    let id = null;
    if (rawId !== null && rawId !== undefined && String(rawId).trim() !== "") {
      id = Number(rawId);
      if (isNaN(id)) id = null;
    }

    const title = row.title ? String(row.title).trim() : "";
    const deity = row.deity ? String(row.deity).trim() : "";
    const level = row.level !== null && row.level !== undefined ? String(row.level).trim() : null;
    const tempo = row.tempo !== null && row.tempo !== undefined ? String(row.tempo).trim() : null;
    const language =
      row.language !== null && row.language !== undefined ? String(row.language).trim() : null;
    const raga = row.raga !== null && row.raga !== undefined ? String(row.raga).trim() : null;
    const shruti =
      row.shruti !== null && row.shruti !== undefined ? String(row.shruti).trim() : null;
    const shruti_female =
      row.shruti_female !== null && row.shruti_female !== undefined
        ? String(row.shruti_female).trim()
        : null;
    const lyrics =
      row.lyrics !== null && row.lyrics !== undefined ? String(row.lyrics).trim() : null;

    if (!title) blankTitles++;
    if (!deity) blankDeities++;

    if (id === null) {
      recordsWithoutId++;
      withoutIdList.push({
        rowNum,
        title,
        deity,
        level,
        tempo,
        language,
        raga,
        shruti,
        shruti_female,
        lyrics
      });
    } else {
      recordsWithId++;
      if (seenIds.has(id)) {
        duplicateIds.push({ id, firstRow: seenIds.get(id), secondRow: rowNum, title });
      } else {
        seenIds.set(id, rowNum);
      }
    }

    if (title) {
      const norm = normalizeBhajanTitle(title);
      if (normalizedTitlesMap.has(norm)) {
        duplicateNormalizedTitles.push({
          norm,
          firstTitle: normalizedTitlesMap.get(norm).title,
          firstId: normalizedTitlesMap.get(norm).id,
          secondTitle: title,
          secondId: id,
          rowNum
        });
      } else {
        normalizedTitlesMap.set(norm, { title, id, rowNum });
      }
    }

    cleanRows.push({
      rowNum,
      id,
      title,
      deity,
      level,
      tempo,
      language,
      raga,
      shruti,
      shruti_female,
      lyrics
    });
  }

  // Strict validation
  if (blankTitles > 0) {
    throw new Error(`Validation failed: ${blankTitles} rows have blank titles.`);
  }
  if (blankDeities > 0) {
    throw new Error(`Validation failed: ${blankDeities} rows have blank deities.`);
  }
  if (duplicateIds.length > 0) {
    throw new Error(`Validation failed: Duplicate IDs found: ${JSON.stringify(duplicateIds)}`);
  }
  if (recordsWithoutId !== 2) {
    throw new Error(
      `Validation failed: Expected exactly 2 ID-less records, but found ${recordsWithoutId}`
    );
  }

  return {
    rawRowCount: rawRows.length,
    recordsWithId,
    recordsWithoutId,
    withoutIdList,
    duplicateIds,
    blankTitles,
    blankDeities,
    duplicateNormalizedTitles,
    cleanRows
  };
}

async function inspectDbAndReferences() {
  const [dbMasters] = await sequelize.query("SELECT id, title, deity FROM master_bhajans");
  const dbMasterCount = dbMasters.length;
  const [maxIdRes] = await sequelize.query("SELECT MAX(id) as max_id FROM master_bhajans");
  const currentMaxId = maxIdRes[0].max_id || 0;

  const dbMasterMap = new Map();
  dbMasters.forEach((m) => dbMasterMap.set(m.id, m));

  const [submissions] = await sequelize.query("SELECT id FROM bhajans_submitted_v2");
  const historicalSubmissionsCount = submissions.length;

  const [tables] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table'");
  const tablesWithMasterId = [];
  const allReferencedMasterIds = new Set();
  const referencesPerTable = {};
  let totalHistoricalMasterReferences = 0;

  for (const t of tables) {
    const [cols] = await sequelize.query(`PRAGMA table_info("${t.name}")`);
    if (cols.some((c) => c.name === "master_bhajan_id")) {
      tablesWithMasterId.push(t.name);
      const [rows] = await sequelize.query(
        `SELECT id, master_bhajan_id FROM "${t.name}" WHERE master_bhajan_id IS NOT NULL`
      );
      referencesPerTable[t.name] = rows.length;
      totalHistoricalMasterReferences += rows.length;
      rows.forEach((r) => allReferencedMasterIds.add(Number(r.master_bhajan_id)));
    }
  }

  let brokenReferences = 0;
  const brokenRefDetails = [];
  for (const refId of allReferencedMasterIds) {
    if (!dbMasterMap.has(refId)) {
      brokenReferences++;
      brokenRefDetails.push(refId);
    }
  }

  return {
    dbMasterCount,
    currentMaxId,
    dbMasters,
    dbMasterMap,
    historicalSubmissionsCount,
    tablesWithMasterId,
    referencesPerTable,
    totalHistoricalMasterReferences,
    allReferencedMasterIds,
    brokenReferences,
    brokenRefDetails
  };
}

async function createBackup() {
  // Flush WAL first
  try {
    await sequelize.query("PRAGMA wal_checkpoint(FULL);");
  } catch (e) {
    console.warn("WAL checkpoint warning:", e.message);
  }

  const timestamp = getTimestamp();
  const backupFileName = `bhajans_before_master_migration_${timestamp}.db`;
  const backupPath = path.join(__dirname, "..", backupFileName);

  if (fs.existsSync(backupPath)) {
    throw new Error(`Backup file already exists: ${backupPath}`);
  }

  fs.copyFileSync(DB_FILE, backupPath);

  const stats = fs.statSync(backupPath);
  if (stats.size === 0) {
    throw new Error(`Backup file created is empty: ${backupPath}`);
  }

  console.log(`✅ Database backup created successfully: ${backupFileName} (${stats.size} bytes)`);
  return backupPath;
}

async function executeSchemaChanges() {
  const [cols] = await sequelize.query("PRAGMA table_info(master_bhajans)");
  const colNames = cols.map((c) => c.name);

  if (!colNames.includes("lyrics")) {
    console.log('Adding column "lyrics" (TEXT) to master_bhajans...');
    await sequelize.query("ALTER TABLE master_bhajans ADD COLUMN lyrics TEXT");
  } else {
    console.log('Column "lyrics" already exists in master_bhajans.');
  }

  if (!colNames.includes("is_active")) {
    console.log('Adding column "is_active" (BOOLEAN DEFAULT 1) to master_bhajans...');
    await sequelize.query("ALTER TABLE master_bhajans ADD COLUMN is_active BOOLEAN DEFAULT 1");
  } else {
    console.log('Column "is_active" already exists in master_bhajans.');
  }

  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS idx_master_bhajans_is_active ON master_bhajans(is_active)"
  );
  console.log("✅ Schema changes applied.");
}

async function runMigration({ isExecute = false }) {
  console.log("====================================================");
  console.log(`MASTER BHAJAN BANK MIGRATION - MODE: ${isExecute ? "EXECUTE" : "DRY RUN"}`);
  console.log("====================================================\n");

  // Step 1: Read and validate Excel
  const excelData = await readAndValidateExcel();
  console.log(`Excel validation passed.`);
  console.log(`- Total Excel rows: ${excelData.rawRowCount}`);
  console.log(`- Records with existing IDs: ${excelData.recordsWithId}`);
  console.log(`- Records without IDs (new): ${excelData.recordsWithoutId}`);
  excelData.withoutIdList.forEach((item, idx) => {
    console.log(`  ${idx + 1}. "${item.title}" (${item.deity})`);
  });

  // Step 2: Inspect Database
  const dbData = await inspectDbAndReferences();
  console.log(`\nDatabase state before migration:`);
  console.log(`- Current MasterBhajan count: ${dbData.dbMasterCount}`);
  console.log(`- Current MAX(id): ${dbData.currentMaxId}`);
  console.log(`- Historical submissions count: ${dbData.historicalSubmissionsCount}`);
  console.log(`- Tables with master_bhajan_id: ${JSON.stringify(dbData.referencesPerTable)}`);
  console.log(`- Total historical references checked: ${dbData.totalHistoricalMasterReferences}`);
  console.log(
    `- Distinct referenced master IDs: ${Array.from(dbData.allReferencedMasterIds).join(", ")}`
  );
  console.log(`- Broken references currently: ${dbData.brokenReferences}`);

  if (dbData.brokenReferences > 0) {
    throw new Error(
      `CRITICAL: Database already has broken foreign references: ${JSON.stringify(dbData.brokenRefDetails)}`
    );
  }

  // Cross-reference analysis
  const excelIdSet = new Set(excelData.cleanRows.filter((r) => r.id !== null).map((r) => r.id));
  let oldMastersNotInExcel = 0;
  let oldMastersReferenced = 0;
  let oldMastersUnreferenced = 0;
  const referencedOldMastersList = [];

  dbData.dbMasters.forEach((m) => {
    if (!excelIdSet.has(m.id)) {
      oldMastersNotInExcel++;
      if (dbData.allReferencedMasterIds.has(m.id)) {
        oldMastersReferenced++;
        referencedOldMastersList.push(m);
      } else {
        oldMastersUnreferenced++;
      }
    }
  });

  console.log(`\nData segmentation:`);
  console.log(`- Category A (Active clean records in Excel with ID): ${excelData.recordsWithId}`);
  console.log(`- Category A+ (New clean records to assign IDs): ${excelData.recordsWithoutId}`);
  console.log(`- Category B (Old unreferenced records to archive): ${oldMastersUnreferenced}`);
  console.log(
    `- Category C (Old referenced records to retain as archived): ${oldMastersReferenced}`
  );
  if (referencedOldMastersList.length > 0) {
    referencedOldMastersList.forEach((m) => {
      console.log(`  * ID ${m.id}: "${m.title}" (${m.deity})`);
    });
  }

  // Planned new IDs
  let nextId = dbData.currentMaxId + 1;
  const newAssignments = [];
  for (const item of excelData.withoutIdList) {
    newAssignments.push({
      assignedId: nextId,
      title: item.title,
      deity: item.deity
    });
    nextId++;
  }

  console.log(`\nPlanned New ID Assignments:`);
  newAssignments.forEach((na) => {
    console.log(`- ID ${na.assignedId} -> "${na.title}" (${na.deity})`);
  });

  const plannedActiveCount = excelData.cleanRows.length; // 1024
  console.log(`\nPlanned Final Active Master Bhajan Count: ${plannedActiveCount}`);
  console.log(
    `Planned Final Total Master Bhajan Count: ${dbData.dbMasterCount + excelData.recordsWithoutId}`
  );

  if (!isExecute) {
    console.log("\nDRY RUN COMPLETE. No modifications were made to the database.");
    return {
      dryRun: true,
      excelData,
      dbData,
      newAssignments,
      oldMastersNotInExcel,
      oldMastersReferenced,
      oldMastersUnreferenced,
      referencedOldMastersList
    };
  }

  // === EXECUTION PHASE ===
  console.log("\n====================================================");
  console.log("EXECUTING MIGRATION...");
  console.log("====================================================\n");

  // Step 4: Backup
  const backupPath = await createBackup();

  // Step 5: Schema Migration
  await executeSchemaChanges();

  // Step 6 & 7: Import / Update Active Clean Master Bhajans
  const activeIds = [];
  let updatedExisting = 0;
  let insertedWithId = 0;
  let insertedNewId = 0;

  for (const row of excelData.cleanRows) {
    if (row.id !== null) {
      activeIds.push(row.id);
      const exists = dbData.dbMasterMap.has(row.id);
      if (exists) {
        await sequelize.query(
          `UPDATE master_bhajans 
           SET title = ?, deity = ?, level = ?, tempo = ?, language = ?, raga = ?, shruti = ?, shruti_female = ?, lyrics = ?, is_active = 1
           WHERE id = ?`,
          {
            replacements: [
              row.title,
              row.deity,
              row.level,
              row.tempo,
              row.language,
              row.raga,
              row.shruti,
              row.shruti_female,
              row.lyrics,
              row.id
            ]
          }
        );
        updatedExisting++;
      } else {
        await sequelize.query(
          `INSERT INTO master_bhajans (id, title, deity, level, tempo, language, raga, shruti, shruti_female, lyrics, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          {
            replacements: [
              row.id,
              row.title,
              row.deity,
              row.level,
              row.tempo,
              row.language,
              row.raga,
              row.shruti,
              row.shruti_female,
              row.lyrics
            ]
          }
        );
        insertedWithId++;
      }
    }
  }

  // Assign IDs to ID-less rows
  let assignIdx = 0;
  for (const row of excelData.withoutIdList) {
    const assignedId = newAssignments[assignIdx].assignedId;
    activeIds.push(assignedId);

    // Check if already exists (idempotency check)
    const [existing] = await sequelize.query("SELECT id FROM master_bhajans WHERE id = ?", {
      replacements: [assignedId]
    });

    if (existing.length > 0) {
      await sequelize.query(
        `UPDATE master_bhajans 
         SET title = ?, deity = ?, level = ?, tempo = ?, language = ?, raga = ?, shruti = ?, shruti_female = ?, lyrics = ?, is_active = 1
         WHERE id = ?`,
        {
          replacements: [
            row.title,
            row.deity,
            row.level,
            row.tempo,
            row.language,
            row.raga,
            row.shruti,
            row.shruti_female,
            row.lyrics,
            assignedId
          ]
        }
      );
    } else {
      await sequelize.query(
        `INSERT INTO master_bhajans (id, title, deity, level, tempo, language, raga, shruti, shruti_female, lyrics, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        {
          replacements: [
            assignedId,
            row.title,
            row.deity,
            row.level,
            row.tempo,
            row.language,
            row.raga,
            row.shruti,
            row.shruti_female,
            row.lyrics
          ]
        }
      );
    }
    insertedNewId++;
    assignIdx++;
  }

  console.log(`Active Clean Bhajans Processed:`);
  console.log(`- Updated existing records with preserved IDs: ${updatedExisting}`);
  console.log(`- Inserted records with preserved IDs: ${insertedWithId}`);
  console.log(`- Inserted new records with assigned IDs: ${insertedNewId}`);

  // Step 8: Archive Old Masters
  // All records not in activeIds become is_active = 0
  const [archiveResult] = await sequelize.query(
    `UPDATE master_bhajans SET is_active = 0 WHERE id NOT IN (${activeIds.join(",")})`
  );
  console.log(`Old records archived (is_active = 0): ${oldMastersNotInExcel}`);

  // Step 10: Validation after migration
  const [activeCheck] = await sequelize.query(
    "SELECT COUNT(*) as cnt FROM master_bhajans WHERE is_active = 1"
  );
  const [archivedCheck] = await sequelize.query(
    "SELECT COUNT(*) as cnt FROM master_bhajans WHERE is_active = 0"
  );
  const [totalCheck] = await sequelize.query("SELECT COUNT(*) as cnt FROM master_bhajans");
  const [duplicateIdCheck] = await sequelize.query(
    "SELECT id, COUNT(*) as cnt FROM master_bhajans GROUP BY id HAVING cnt > 1"
  );

  const finalActiveCount = activeCheck[0].cnt;
  const finalArchivedCount = archivedCheck[0].cnt;
  const finalTotalCount = totalCheck[0].cnt;

  console.log(`\nPost-Migration Database Counts:`);
  console.log(
    `- Final Active Master Bhajans: ${finalActiveCount} (Expected: ${plannedActiveCount})`
  );
  console.log(
    `- Final Archived Master Bhajans: ${finalArchivedCount} (Expected: ${oldMastersNotInExcel})`
  );
  console.log(`- Final Total Master Bhajans: ${finalTotalCount}`);
  console.log(`- Duplicate IDs: ${duplicateIdCheck.length}`);

  if (finalActiveCount !== plannedActiveCount) {
    throw new Error(
      `Integrity error: Active count ${finalActiveCount} does not match expected ${plannedActiveCount}`
    );
  }
  if (duplicateIdCheck.length > 0) {
    throw new Error(`Integrity error: Duplicate IDs detected in master_bhajans table!`);
  }

  // Re-check foreign reference integrity
  const [postTables] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table'");
  let postBrokenReferences = 0;
  const [allMasterRows] = await sequelize.query("SELECT id, is_active FROM master_bhajans");
  const postMasterMap = new Map();
  allMasterRows.forEach((m) => postMasterMap.set(m.id, m));

  for (const t of postTables) {
    const [cols] = await sequelize.query(`PRAGMA table_info("${t.name}")`);
    if (cols.some((c) => c.name === "master_bhajan_id")) {
      const [refs] = await sequelize.query(
        `SELECT id, master_bhajan_id FROM "${t.name}" WHERE master_bhajan_id IS NOT NULL`
      );
      for (const r of refs) {
        if (!postMasterMap.has(Number(r.master_bhajan_id))) {
          postBrokenReferences++;
          console.error(
            `Broken reference in table ${t.name}, row ${r.id}: master_bhajan_id ${r.master_bhajan_id} not found!`
          );
        }
      }
    }
  }

  console.log(`- Broken foreign references post-migration: ${postBrokenReferences}`);
  if (postBrokenReferences > 0) {
    throw new Error(
      `Integrity error: ${postBrokenReferences} broken references detected after migration!`
    );
  }

  // Verify the 2 new bhajans
  const [new1] = await sequelize.query(
    "SELECT * FROM master_bhajans WHERE title = 'Shiva Shiva Shiva Shiva Shivaya Namah Om'"
  );
  const [new2] = await sequelize.query(
    "SELECT * FROM master_bhajans WHERE title = 'Jaya Pandari Natha Panduranga Pundalika Varada'"
  );
  console.log(`Verified new bhajan 1: ID ${new1[0]?.id}, is_active: ${new1[0]?.is_active}`);
  console.log(`Verified new bhajan 2: ID ${new2[0]?.id}, is_active: ${new2[0]?.is_active}`);

  if (!new1[0] || new1[0].is_active !== 1 || !new2[0] || new2[0].is_active !== 1) {
    throw new Error("Integrity error: New bhajans not found or not active!");
  }

  // Create Reports
  const reportJson = {
    old_master_count: dbData.dbMasterCount,
    new_excel_count: excelData.rawRowCount,
    active_master_count: finalActiveCount,
    ids_preserved: updatedExisting + insertedWithId,
    new_ids_assigned: newAssignments,
    archived_unreferenced: oldMastersUnreferenced,
    archived_referenced: oldMastersReferenced,
    historical_references_checked: dbData.totalHistoricalMasterReferences,
    broken_references: postBrokenReferences,
    database_backup_path: backupPath,
    executed_at: new Date().toISOString()
  };

  const reportJsonPath = path.join(__dirname, "..", "master_bank_migration_report.json");
  fs.writeFileSync(reportJsonPath, JSON.stringify(reportJson, null, 2), "utf8");

  const reportTxt = `================================================================================
MASTER BHAJAN BANK MIGRATION REPORT
Sri Sathya Sai Seva Organisation, Gandhinagar - Bhajan Planner
Generated at: ${new Date().toISOString()}
================================================================================

1. EXECUTIVE SUMMARY
--------------------------------------------------------------------------------
- Migration Status: COMPLETED SUCCESSFULLY
- Database Backup Path: ${backupPath}
- Source Authoritative File: data/master_bhajans_fully_enriched.xlsx
- Old Master Bhajan Count: ${dbData.dbMasterCount}
- Final Active Master Bhajan Count: ${finalActiveCount}
- Final Archived Master Bhajan Count: ${finalArchivedCount}
- Final Total Master Bhajan Count: ${finalTotalCount}
- Broken Historical References: ${postBrokenReferences}

2. EXCEL DATA INTEGRITY & VALIDATION
--------------------------------------------------------------------------------
- Total Rows in Authoritative Excel: ${excelData.rawRowCount}
- Valid Records: ${excelData.rawRowCount}
- Records with Existing IDs: ${excelData.recordsWithId}
- Records without IDs (New Bhajans): ${excelData.recordsWithoutId}
- Duplicate IDs in Excel: 0
- Blank Titles in Excel: 0
- Blank Deities in Excel: 0
- Alternate / Duplicate Normalized Tunes: ${excelData.duplicateNormalizedTitles.length}

3. ID PRESERVATION & ASSIGNMENTS
--------------------------------------------------------------------------------
- Existing IDs Preserved: ${updatedExisting + insertedWithId}
- ID Gaps Accepted: Yes (preserves historical continuity without renumbering)
- New IDs Assigned:
${newAssignments.map((na) => `  * ID ${na.assignedId}: "${na.title}" (${na.deity})`).join("\n")}

4. ARCHIVING & HISTORICAL REFERENCE INTEGRITY
--------------------------------------------------------------------------------
- Old Master Records Not in Clean Excel: ${oldMastersNotInExcel}
- Archived & Unreferenced: ${oldMastersUnreferenced} (marked is_active = 0)
- Archived & Referenced by Historical Submissions: ${oldMastersReferenced} (marked is_active = 0, retained in DB)
  Historical References Retained:
${referencedOldMastersList.map((m) => `  * ID ${m.id}: "${m.title}" (${m.deity})`).join("\n")}
- Historical Submissions Checked: ${dbData.historicalSubmissionsCount} submissions in bhajans_submitted_v2
- Foreign Key References Checked: ${dbData.totalHistoricalMasterReferences} rows in diwali_participant_bhajans
- Broken Foreign References: 0

5. SCHEMA CHANGES APPLIED
--------------------------------------------------------------------------------
- ALTER TABLE master_bhajans ADD COLUMN lyrics TEXT;
- ALTER TABLE master_bhajans ADD COLUMN is_active BOOLEAN DEFAULT 1;
- CREATE INDEX idx_master_bhajans_is_active ON master_bhajans(is_active);

================================================================================
END OF REPORT
================================================================================`;

  const reportTxtPath = path.join(__dirname, "..", "master_bank_migration_report.txt");
  fs.writeFileSync(reportTxtPath, reportTxt, "utf8");

  console.log(
    `\n✅ Migration report written to: master_bank_migration_report.json and master_bank_migration_report.txt`
  );
  console.log("MIGRATION FINISHED SUCCESSFULLY.");

  return reportJson;
}

// CLI handler
if (require.main === module) {
  const isExecute = process.argv.includes("--execute");
  runMigration({ isExecute })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ MIGRATION FAILED:", err);
      process.exit(1);
    });
}

module.exports = {
  runMigration,
  readAndValidateExcel,
  inspectDbAndReferences
};
