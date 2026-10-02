/**
 * update_deities_from_master_sheet.js
 * 
 * Fetches deities from data/master_sheet.xlsx and updates:
 * 1. data/master_bhajans_fully_enriched.xlsx
 * 2. master_bhajans.json
 * 3. SQLite database table `master_bhajans` in bhajans.db
 * 
 * Uses exact title matching only (trimmed whitespace, case-insensitive).
 * Bhajans without an exact title match retain their existing deity.
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const sequelize = require('../config/database');
const MasterBhajan = require('../models/MasterBhajan');

// Canonical title-casing map for deities
const CANONICAL_DEITY_MAP = {
  'anjaneya': 'Anjaneya',
  'hanuman': 'Anjaneya',
  'rama': 'Rama',
  'krishna': 'Krishna',
  'sai': 'Sai',
  'devi': 'Devi',
  'guru': 'Guru',
  'ganesha': 'Ganesha',
  'vittala': 'Vittala',
  'vitthala': 'Vittala',
  'subrahmanya': 'Subrahmanya',
  'narayana': 'Narayana',
  'sarva dharma': 'Sarva Dharma',
  'sarvadharma': 'Sarva Dharma',
  'shiva': 'Shiva',
  'narasimha': 'Narasimha',
  'surya': 'Surya'
};

function formatDeityToken(token) {
  const lower = token.trim().toLowerCase();
  if (CANONICAL_DEITY_MAP[lower]) {
    return CANONICAL_DEITY_MAP[lower];
  }
  // Fallback to title case for any other tokens
  return lower.split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function exactKey(t) {
  if (!t) return '';
  return t.toString().trim().toLowerCase();
}

async function run() {
  console.log('🕉️ Updating Master Bhajan Deities from data/master_sheet.xlsx...\n');

  const masterSheetPath = path.join(__dirname, '..', 'data', 'master_sheet.xlsx');
  const enrichedExcelPath = path.join(__dirname, '..', 'data', 'master_bhajans_fully_enriched.xlsx');
  const masterJsonPath = path.join(__dirname, '..', 'master_bhajans.json');

  if (!fs.existsSync(masterSheetPath)) {
    throw new Error(`Master sheet not found at: ${masterSheetPath}`);
  }
  if (!fs.existsSync(enrichedExcelPath)) {
    throw new Error(`Enriched Excel not found at: ${enrichedExcelPath}`);
  }

  // 1. Read master_sheet.xlsx Sheet1
  console.log(`Reading master sheet: ${masterSheetPath}...`);
  const wbMaster = xlsx.readFile(masterSheetPath);
  const masterRows = xlsx.utils.sheet_to_json(wbMaster.Sheets['Sheet1']);
  console.log(`Loaded ${masterRows.length} rows from master_sheet.xlsx Sheet1.`);

  // Build exact title -> list of deities map
  // Each title can accumulate multiple deities from comma-separated values or multiple rows
  const titleToDeitiesMap = new Map();

  for (const row of masterRows) {
    const rawTitle = (row[' Title'] || row['Title'] || '').toString().trim();
    const rawDeity = (row[' Deity'] || row['Deity'] || '').toString().trim();
    if (!rawTitle || !rawDeity) continue;

    const key = exactKey(rawTitle);
    if (!titleToDeitiesMap.has(key)) {
      titleToDeitiesMap.set(key, []);
    }

    const currentList = titleToDeitiesMap.get(key);
    const tokens = rawDeity.split(',').map(s => s.trim()).filter(Boolean);
    for (const t of tokens) {
      const formatted = formatDeityToken(t);
      if (formatted && !currentList.includes(formatted)) {
        currentList.push(formatted);
      }
    }
  }

  console.log(`Indexed ${titleToDeitiesMap.size} unique titles with deities from master_sheet.xlsx.`);

  // 2. Read enriched Excel file
  console.log(`\nReading enriched Excel: ${enrichedExcelPath}...`);
  const wbEnriched = xlsx.readFile(enrichedExcelPath);
  const enrichedSheetName = wbEnriched.SheetNames[0];
  const enrichedRows = xlsx.utils.sheet_to_json(wbEnriched.Sheets[enrichedSheetName]);
  console.log(`Loaded ${enrichedRows.length} rows from ${enrichedExcelPath}.`);

  let matchedExactCount = 0;
  let multipleDeitiesCount = 0;
  let unchangedCount = 0;

  const updatedRows = enrichedRows.map((row) => {
    const key = exactKey(row.title);
    if (titleToDeitiesMap.has(key)) {
      matchedExactCount++;
      const deities = titleToDeitiesMap.get(key);
      const newDeityStr = deities.join(', ');
      if (deities.length > 1) {
        multipleDeitiesCount++;
      }
      return {
        ...row,
        deity: newDeityStr
      };
    } else {
      unchangedCount++;
      return { ...row };
    }
  });

  console.log(`\nMatching Results on enriched Excel:`);
  console.log(`  - Total Bhajans: ${enrichedRows.length}`);
  console.log(`  - Exact Title Matches: ${matchedExactCount}`);
  console.log(`  - Bhajans with Multiple Deities: ${multipleDeitiesCount}`);
  console.log(`  - Unchanged (retained existing deity): ${unchangedCount}`);

  // 3. Write updated data back to master_bhajans_fully_enriched.xlsx
  console.log(`\nSaving updated workbook to ${enrichedExcelPath}...`);
  const updatedSheet = xlsx.utils.json_to_sheet(updatedRows);
  wbEnriched.Sheets[enrichedSheetName] = updatedSheet;
  xlsx.writeFile(wbEnriched, enrichedExcelPath);
  console.log(`✅ Updated ${enrichedExcelPath} successfully.`);

  // 4. Update master_bhajans.json
  if (fs.existsSync(masterJsonPath)) {
    console.log(`\nUpdating ${masterJsonPath}...`);
    const masterJsonRaw = fs.readFileSync(masterJsonPath, 'utf8');
    const masterJson = JSON.parse(masterJsonRaw);

    let jsonUpdatedCount = 0;
    const updatedJson = masterJson.map((item) => {
      const key = exactKey(item.title);
      if (titleToDeitiesMap.has(key)) {
        jsonUpdatedCount++;
        const deities = titleToDeitiesMap.get(key);
        return {
          ...item,
          deity: deities.join(', ')
        };
      }
      return item;
    });

    fs.writeFileSync(masterJsonPath, JSON.stringify(updatedJson, null, 2), 'utf8');
    console.log(`✅ Updated ${jsonUpdatedCount} items in ${masterJsonPath}.`);
  }

  // 5. Update SQLite database (master_bhajans table)
  console.log('\nConnecting to SQLite database...');
  await sequelize.authenticate();
  console.log('Database connected.');

  let dbUpdated = 0;
  for (const row of updatedRows) {
    if (!row.id) continue;
    const existing = await MasterBhajan.findByPk(row.id);
    if (existing) {
      if (existing.deity !== row.deity) {
        await existing.update({ deity: row.deity });
        dbUpdated++;
      }
    }
  }

  console.log(`✅ SQLite master_bhajans table updated: ${dbUpdated} rows modified.`);

  // Summary statistics from DB
  const allDb = await MasterBhajan.findAll({ attributes: ['id', 'title', 'deity'] });
  let dbMulti = 0;
  for (const b of allDb) {
    if (b.deity && b.deity.includes(',')) dbMulti++;
  }
  console.log(`📊 DB Verification: Total bhajans in DB = ${allDb.length}, with multiple deities = ${dbMulti}`);

  await sequelize.close();
  console.log('\n🎉 Finished successfully!');
}

run().catch((err) => {
  console.error('❌ Error executing update:', err);
  process.exit(1);
});
