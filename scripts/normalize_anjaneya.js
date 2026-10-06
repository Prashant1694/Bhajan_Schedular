const fs = require("fs");
const path = require("path");
const sequelize = require("../config/database");

async function normalizeAnjaneyaToHanuman() {
  console.log("🔄 Starting normalization of Anjaneya -> Hanuman...");

  // 1. Normalize master_bhajans.json
  const jsonPath = path.join(__dirname, "..", "master_bhajans.json");
  if (fs.existsSync(jsonPath)) {
    const rawData = fs.readFileSync(jsonPath, "utf8");
    const bhajans = JSON.parse(rawData);
    let jsonUpdated = 0;

    bhajans.forEach((b) => {
      if (b.deity) {
        const tokens = b.deity.split(",").map((s) => s.trim());
        let changed = false;
        const newTokens = tokens.map((tok) => {
          if (tok.toLowerCase() === "anjaneya" || tok.toLowerCase() === "aanjaneya") {
            changed = true;
            return "Hanuman";
          }
          return tok;
        });
        if (changed) {
          // Remove duplicates if any (e.g. if Hanuman was already in tokens)
          const uniqueTokens = Array.from(new Set(newTokens));
          b.deity = uniqueTokens.join(", ");
          jsonUpdated++;
        }
      }
    });

    if (jsonUpdated > 0) {
      fs.writeFileSync(jsonPath, JSON.stringify(bhajans, null, 2), "utf8");
      console.log(`✅ Updated ${jsonUpdated} entries in master_bhajans.json to 'Hanuman'.`);
    } else {
      console.log("ℹ️ master_bhajans.json already normalized.");
    }
  }

  // 2. Normalize database table: master_bhajans
  try {
    const [rows] = await sequelize.query(`
      SELECT id, deity FROM master_bhajans 
      WHERE deity LIKE '%Anjaneya%' OR deity LIKE '%anjaneya%' OR deity LIKE '%Aanjaneya%'
    `);

    console.log(`🔍 Found ${rows.length} master_bhajans database rows with Anjaneya.`);
    for (const r of rows) {
      const tokens = r.deity.split(",").map((s) => s.trim());
      const newTokens = Array.from(
        new Set(
          tokens.map((tok) => {
            if (tok.toLowerCase() === "anjaneya" || tok.toLowerCase() === "aanjaneya") {
              return "Hanuman";
            }
            return tok;
          })
        )
      );
      const updated = newTokens.join(", ");
      await sequelize.query(`UPDATE master_bhajans SET deity = :updated WHERE id = :id`, {
        replacements: { updated, id: r.id }
      });
      console.log(`  Updated master_bhajan #${r.id}: "${r.deity}" -> "${updated}"`);
    }
  } catch (err) {
    console.error("Error updating master_bhajans table:", err.message);
  }

  // 3. Normalize database table: bhajans_submitted_v2
  try {
    const [subRows] = await sequelize.query(`
      SELECT id, deity FROM bhajans_submitted_v2 
      WHERE deity LIKE '%Anjaneya%' OR deity LIKE '%anjaneya%' OR deity LIKE '%Aanjaneya%'
    `);
    console.log(`🔍 Found ${subRows.length} bhajans_submitted_v2 rows with Anjaneya.`);
    for (const r of subRows) {
      await sequelize.query(`UPDATE bhajans_submitted_v2 SET deity = 'Hanuman' WHERE id = :id`, {
        replacements: { id: r.id }
      });
      console.log(`  Updated submission #${r.id}: "${r.deity}" -> "Hanuman"`);
    }
  } catch (err) {
    console.error("Error updating bhajans_submitted_v2 table:", err.message);
  }

  // 4. Normalize database table: deity_rules_v4
  try {
    const [ruleRows] = await sequelize.query(`
      SELECT id, deity_name FROM deity_rules_v4 
      WHERE deity_name LIKE '%Anjaneya%' OR deity_name LIKE '%anjaneya%'
    `);
    console.log(`🔍 Found ${ruleRows.length} deity_rules_v4 rows with Anjaneya.`);
    for (const r of ruleRows) {
      await sequelize.query(`UPDATE deity_rules_v4 SET deity_name = 'Hanuman' WHERE id = :id`, {
        replacements: { id: r.id }
      });
      console.log(`  Updated rule #${r.id}: "${r.deity_name}" -> "Hanuman"`);
    }
  } catch (err) {
    console.error("Error updating deity_rules_v4 table:", err.message);
  }

  console.log("🎉 Deity normalization complete! All Anjaneya records are now Hanuman.");
}

if (require.main === module) {
  normalizeAnjaneyaToHanuman()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { normalizeAnjaneyaToHanuman };
