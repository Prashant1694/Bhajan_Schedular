const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');
const MasterBhajan = require('../models/MasterBhajan');

async function run() {
  console.log('🚀 Starting Music Sheets Integration...');

  // 1. Ensure column exists in SQLite
  const [columns] = await sequelize.query("PRAGMA table_info(master_bhajans)");
  if (!columns.some(col => col.name === 'sheet_filename')) {
    console.log('Adding sheet_filename column to master_bhajans table...');
    await sequelize.query("ALTER TABLE master_bhajans ADD COLUMN sheet_filename VARCHAR(255)");
  }

  // 2. Load authoritative manifest
  const manifestPath = path.join(__dirname, '..', 'data', 'integration_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`Loaded manifest with ${manifest.files.length} entries.`);

  // 3. Verify sheets directory on disk
  const sheetsDir = fs.existsSync(path.join(__dirname, '..', 'public', 'sheets'))
    ? path.join(__dirname, '..', 'public', 'sheets')
    : path.join(__dirname, '..', 'sheets');
  if (!fs.existsSync(sheetsDir)) {
    throw new Error(`Sheets directory not found at ${sheetsDir}`);
  }

  function norm(str) {
    return (str || '')
      .toLowerCase()
      .replace(/sheet-music/gi, '')
      .replace(/sheet music/gi, '')
      .replace(/[''`".,;:!?()\[\]{}\/\\~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Build manifest lookup maps
  const exactMap = new Map();
  const normMap = new Map();

  manifest.files.forEach(f => {
    const filePath = path.join(sheetsDir, f.filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: Manifest references file not found on disk: ${f.filename}`);
      return;
    }

    const exactKey = f.title.toLowerCase().trim();
    if (!exactMap.has(exactKey)) {
      exactMap.set(exactKey, f.filename);
    }

    const normKey = norm(f.title);
    if (!normMap.has(normKey)) {
      normMap.set(normKey, f.filename);
    }
  });

  console.log(`Verified ${exactMap.size} unique exact titles and ${normMap.size} normalized titles in manifest.`);

  // 4. Update MasterBhajan records in SQLite
  const allBhajans = await MasterBhajan.findAll();
  console.log(`Found ${allBhajans.length} total master bhajans in database.`);

  let activeMatched = 0;
  let inactiveMatched = 0;
  let activeTotal = 0;

  for (const b of allBhajans) {
    if (b.is_active) activeTotal++;

    const exactKey = (b.title || '').toLowerCase().trim();
    const normKey = norm(b.title);

    let matchedFile = null;
    if (exactMap.has(exactKey)) {
      matchedFile = exactMap.get(exactKey);
    } else if (normMap.has(normKey)) {
      matchedFile = normMap.get(normKey);
    }

    if (matchedFile) {
      b.sheet_filename = matchedFile;
      await b.save();
      if (b.is_active) {
        activeMatched++;
      } else {
        inactiveMatched++;
      }
    } else {
      if (b.sheet_filename) {
        b.sheet_filename = null;
        await b.save();
      }
    }
  }

  console.log(`✅ SQLite updated:`);
  console.log(`   - Active Bhajans with Music Sheet: ${activeMatched} of ${activeTotal}`);
  console.log(`   - Archived/Inactive Bhajans with Music Sheet: ${inactiveMatched}`);
  console.log(`   - Total mapped: ${activeMatched + inactiveMatched}`);

  // 5. Sync master_bhajans.json
  const jsonPath = path.join(__dirname, '..', 'master_bhajans.json');
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const catalog = JSON.parse(raw);
    let jsonMatched = 0;

    catalog.forEach(item => {
      const exactKey = (item.title || '').toLowerCase().trim();
      const normKey = norm(item.title);

      let matchedFile = null;
      if (exactMap.has(exactKey)) {
        matchedFile = exactMap.get(exactKey);
      } else if (normMap.has(normKey)) {
        matchedFile = normMap.get(normKey);
      }

      item.sheet_filename = matchedFile || null;
      if (matchedFile) jsonMatched++;
    });

    fs.writeFileSync(jsonPath, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`✅ Synced master_bhajans.json: ${jsonMatched} entries have sheet_filename.`);
  }

  console.log('🎉 Music Sheets Integration Completed Successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error during sheets integration:', err);
  process.exit(1);
});
