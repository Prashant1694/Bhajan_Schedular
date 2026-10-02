const fs = require('fs');
const path = require('path');
const MasterBhajan = require('../models/MasterBhajan');

function toTitleCase(str) {
  if (!str) return '';
  return str
    .replace(/~/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .split('/')
    .map(slashPart => {
      return slashPart
        .trim()
        .split(' ')
        .map(word => {
          if (!word) return '';
          // capitalize first letter, keep rest lower unless already special
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
    })
    .join(' / ');
}

function normalizeFullRaga(ragaStr) {
  if (!ragaStr || !ragaStr.trim()) return null;
  const parts = ragaStr.split(',').map(s => toTitleCase(s)).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

async function run() {
  console.log('Cleaning and normalizing ragas in master_bhajans...');
  const list = await MasterBhajan.findAll();

  let updated = 0;
  for (const b of list) {
    if (!b.raga) continue;
    const original = b.raga;
    const normalized = normalizeFullRaga(original);
    if (normalized !== original) {
      b.raga = normalized;
      await b.save();
      updated++;
    }
  }

  console.log(`Successfully normalized ${updated} master bhajans in the database.`);

  // Sync master_bhajans.json
  const jsonPath = path.join(__dirname, '..', 'master_bhajans.json');
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const catalog = JSON.parse(raw);
    let jsonUpdated = 0;
    catalog.forEach(item => {
      if (item.raga) {
        const norm = normalizeFullRaga(item.raga);
        if (norm !== item.raga) {
          item.raga = norm;
          jsonUpdated++;
        }
      }
    });
    fs.writeFileSync(jsonPath, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`Successfully synced ${jsonUpdated} entries in master_bhajans.json.`);
  }

  // Print sample of clean unique ragas
  const updatedList = await MasterBhajan.findAll({ attributes: ['raga'] });
  const uniqueSingleRagas = new Set();
  updatedList.forEach(b => {
    if (!b.raga) return;
    b.raga.split(',').forEach(p => {
      const trimmed = p.trim();
      if (trimmed) uniqueSingleRagas.add(trimmed);
    });
  });

  const sortedUnique = [...uniqueSingleRagas].sort((a, b) => a.localeCompare(b));
  console.log(`\nTotal unique individual clean ragas: ${sortedUnique.length}`);
  console.log('Sample clean unique ragas:');
  console.log(sortedUnique.slice(0, 25));

  process.exit(0);
}

run().catch(err => {
  console.error('Error normalizing ragas:', err);
  process.exit(1);
});
