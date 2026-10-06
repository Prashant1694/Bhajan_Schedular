const sequelize = require('../config/database');

async function normalizeVitthala() {
  console.log('Normalizing Vitthala across database tables...');

  // 1. master_bhajans
  const [rows] = await sequelize.query(`
    SELECT id, deity FROM master_bhajans 
    WHERE LOWER(deity) LIKE '%vitt%' OR LOWER(deity) LIKE '%vith%'
  `);

  console.log(`Found ${rows.length} master_bhajans records with Vitthala/Vittala/Vithhala:`);
  for (const r of rows) {
    const original = r.deity;
    // Replace any token vittala, vithhala, vithala (case insensitive) with Vitthala
    const tokens = original.split(',').map(s => s.trim()).filter(Boolean);
    const normalizedTokens = tokens.map(tok => {
      const lower = tok.toLowerCase();
      if (lower === 'vittala' || lower === 'vithhala' || lower === 'vithala' || lower === 'vitthala') {
        return 'Vitthala';
      }
      return tok;
    });
    const updated = normalizedTokens.join(', ');
    if (updated !== original) {
      await sequelize.query(`UPDATE master_bhajans SET deity = :updated WHERE id = :id`, {
        replacements: { updated, id: r.id }
      });
      console.log(`  Updated #${r.id}: "${original}" -> "${updated}"`);
    } else {
      console.log(`  Unchanged #${r.id}: "${original}"`);
    }
  }

  // 2. bhajans_submitted_v2
  const [subRows] = await sequelize.query(`
    SELECT id, deity FROM bhajans_submitted_v2 
    WHERE LOWER(deity) LIKE '%vitt%' OR LOWER(deity) LIKE '%vith%'
  `);
  for (const r of subRows) {
    const original = r.deity;
    const lower = (original || '').toLowerCase().trim();
    if (lower === 'vittala' || lower === 'vithhala' || lower === 'vithala') {
      await sequelize.query(`UPDATE bhajans_submitted_v2 SET deity = 'Vitthala' WHERE id = :id`, {
        replacements: { id: r.id }
      });
      console.log(`  Updated submission #${r.id}: "${original}" -> "Vitthala"`);
    }
  }

  // 3. deity_rules_v4
  const [ruleRows] = await sequelize.query(`
    SELECT id, deity_name FROM deity_rules_v4 
    WHERE LOWER(deity_name) LIKE '%vitt%' OR LOWER(deity_name) LIKE '%vith%'
  `);
  for (const r of ruleRows) {
    const original = r.deity_name;
    const lower = (original || '').toLowerCase().trim();
    if (lower === 'vittala' || lower === 'vithhala' || lower === 'vithala') {
      await sequelize.query(`UPDATE deity_rules_v4 SET deity_name = 'Vitthala' WHERE id = :id`, {
        replacements: { id: r.id }
      });
      console.log(`  Updated deity_rule #${r.id}: "${original}" -> "Vitthala"`);
    }
  }

  // 4. Verify distinct deities in master_bhajans
  const [afterDeities] = await sequelize.query(`
    SELECT DISTINCT deity FROM master_bhajans 
    WHERE LOWER(deity) LIKE '%vitt%' OR LOWER(deity) LIKE '%vith%'
  `);
  console.log('\nDistinct Vitthala deities in master_bhajans after normalization:');
  console.log(afterDeities.map(d => d.deity));

  console.log('\nVitthala normalization completed successfully!');
  process.exit(0);
}

normalizeVitthala().catch(err => {
  console.error('Error during normalization:', err);
  process.exit(1);
});
