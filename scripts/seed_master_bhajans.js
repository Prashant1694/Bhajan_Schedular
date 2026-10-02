/**
 * seed_master_bhajans.js
 * Reproducibly populates or synchronizes the MasterBhajan dataset in SQLite from master_bhajans.json.
 * 
 * Usage:
 *   node scripts/seed_master_bhajans.js
 *   npm run seed:master
 */

const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');
const MasterBhajan = require('../models/MasterBhajan');

async function seed() {
  console.log('🕉️ Starting Master Bhajan seed process...');
  await sequelize.authenticate();
  console.log('Database connected.');

  // Ensure table and new columns exist
  await MasterBhajan.sync();

  const [cols] = await sequelize.query('PRAGMA table_info(master_bhajans)');
  const colNames = new Set(cols.map(c => c.name));
  
  if (!colNames.has('lyrics')) {
    await sequelize.query('ALTER TABLE master_bhajans ADD COLUMN lyrics TEXT');
  }
  if (!colNames.has('raga_notes')) {
    await sequelize.query('ALTER TABLE master_bhajans ADD COLUMN raga_notes TEXT');
  }
  if (!colNames.has('sheet_filename')) {
    await sequelize.query('ALTER TABLE master_bhajans ADD COLUMN sheet_filename VARCHAR(255)');
  }
  if (!colNames.has('is_active')) {
    await sequelize.query('ALTER TABLE master_bhajans ADD COLUMN is_active BOOLEAN DEFAULT 1');
  }
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_master_bhajans_is_active ON master_bhajans(is_active)');

  const jsonPath = path.join(__dirname, '..', 'master_bhajans.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Master bhajans seed file not found: ${jsonPath}`);
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const bhajans = JSON.parse(raw);
  console.log(`Read ${bhajans.length} master bhajans from master_bhajans.json.`);

  let inserted = 0;
  let updated = 0;

  for (const item of bhajans) {
    const existing = await MasterBhajan.findByPk(item.id);
    const data = {
      id: item.id,
      title: item.title,
      deity: item.deity,
      level: item.level || null,
      tempo: item.tempo || null,
      raga: item.raga || null,
      raga_notes: item.raga_notes || null,
      shruti: item.shruti || null,
      shruti_female: item.shruti_female || null,
      language: item.language || null,
      lyrics: item.lyrics || null,
      sheet_filename: item.sheet_filename || null,
      is_active: item.is_active !== undefined ? item.is_active : true
    };

    if (existing) {
      await existing.update(data);
      updated++;
    } else {
      await MasterBhajan.create(data);
      inserted++;
    }
  }

  console.log(`✅ Seed complete: ${inserted} inserted, ${updated} updated.`);
  const activeCount = await MasterBhajan.count({ where: { is_active: true } });
  const sheetCount = await MasterBhajan.count({ where: { sheet_filename: { [require('sequelize').Op.ne]: null } } });
  const lyricsCount = await MasterBhajan.count({ where: { lyrics: { [require('sequelize').Op.ne]: null } } });
  console.log(`📊 Total Active Bhajans: ${activeCount}`);
  console.log(`📄 Bhajans with Sheet Music: ${sheetCount}`);
  console.log(`📖 Bhajans with Lyrics: ${lyricsCount}`);

  await sequelize.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding error:', err);
  process.exit(1);
});
