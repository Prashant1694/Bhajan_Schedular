const sequelize = require("../config/database");
const MasterBhajan = require("../models/MasterBhajan");
const fs = require("fs");
const path = require("path");

async function migrateRagaNotes() {
  try {
    console.log("--- Step 1: Check/Add raga_notes column in SQLite ---");
    const [cols] = await sequelize.query("PRAGMA table_info(master_bhajans);");
    const hasCol = cols.some((c) => c.name === "raga_notes");
    if (!hasCol) {
      await sequelize.query("ALTER TABLE master_bhajans ADD COLUMN raga_notes TEXT;");
      console.log("✅ Added raga_notes column to master_bhajans table");
    } else {
      console.log("ℹ️ raga_notes column already exists");
    }

    console.log("--- Step 2: Separate Raga Names and Notes in database ---");
    const all = await MasterBhajan.findAll();
    let updatedCount = 0;

    for (const b of all) {
      if (b.raga && /Notes\s*:/i.test(b.raga)) {
        const parts = b.raga.split(/Notes\s*:/i);
        const cleanRaga = parts[0].trim();
        const rawNotes = parts.slice(1).join("Notes:").trim();
        // Normalize unicode whitespace / non-breaking spaces
        const cleanNotes =
          "Notes: " +
          rawNotes
            .replace(/[\u00a0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        await MasterBhajan.update(
          { raga: cleanRaga, raga_notes: cleanNotes },
          { where: { id: b.id } }
        );
        updatedCount++;
      }
    }
    console.log(`✅ Cleaned and separated raga notes for ${updatedCount} bhajans.`);

    console.log("--- Step 3: Update master_bhajans.json ---");
    const jsonPath = path.join(__dirname, "../master_bhajans.json");
    if (fs.existsSync(jsonPath)) {
      const jsonList = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      let jsonUpdated = 0;
      for (const item of jsonList) {
        if (item.raga && /Notes\s*:/i.test(item.raga)) {
          const parts = item.raga.split(/Notes\s*:/i);
          item.raga = parts[0].trim();
          const rawNotes = parts.slice(1).join("Notes:").trim();
          item.raga_notes =
            "Notes: " +
            rawNotes
              .replace(/[\u00a0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          jsonUpdated++;
        }
      }
      fs.writeFileSync(jsonPath, JSON.stringify(jsonList, null, 2), "utf8");
      console.log(`✅ Updated master_bhajans.json (${jsonUpdated} items).`);
    }

    console.log("--- Step 4: Verification ---");
    const sample = await MasterBhajan.findOne({ where: { id: 482 } });
    console.log("Sample Bhajan 482:");
    console.log("  Clean Raga:", sample.raga);
    console.log("  Raga Notes:", (sample.raga_notes || "").substring(0, 60) + "...");

    const sample2 = await MasterBhajan.findOne({ where: { id: 2553 } });
    console.log("Sample Bhajan 2553:");
    console.log("  Clean Raga:", sample2.raga);
    console.log("  Raga Notes:", (sample2.raga_notes || "").substring(0, 60) + "...");

    console.log("🎉 Migration completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error migrating raga notes:", err);
    process.exit(1);
  }
}

migrateRagaNotes();
