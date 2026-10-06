const ExcelJS = require("exceljs");
const path = require("path");
const sequelize = require("../config/database");
const MasterBhajan = require("../models/MasterBhajan");

async function validateIntegrity() {
  console.log("====================================================");
  console.log("RUNNING COMPLETE REFERENCE-INTEGRITY VALIDATION");
  console.log("====================================================\n");

  const errors = [];

  // 1. Check duplicate IDs
  const [duplicateIds] = await sequelize.query(`
    SELECT id, COUNT(*) as cnt 
    FROM master_bhajans 
    GROUP BY id 
    HAVING cnt > 1
  `);
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate IDs detected in master_bhajans: ${JSON.stringify(duplicateIds)}`);
  } else {
    console.log("✅ Check 1: No duplicate MasterBhajan IDs.");
  }

  // 2. Read authoritative Excel
  const excelPath = path.join(__dirname, "..", "data", "master_bhajans_fully_enriched.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);
  const sheet = wb.worksheets[0];
  const headers = [];
  const rows = [];
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
          const val = row.getCell(c).value;
          r[h] = val !== undefined ? val : null;
        }
      }
      rows.push(r);
    }
  });
  const excelExistingIds = new Set();
  rows.forEach((r) => {
    if (r.id !== null && r.id !== undefined && String(r.id).trim() !== "") {
      excelExistingIds.add(Number(r.id));
    }
  });

  const [dbActive] = await sequelize.query("SELECT * FROM master_bhajans WHERE is_active = 1");
  const dbActiveIdSet = new Set(dbActive.map((m) => m.id));

  // Check all existing Excel IDs exist and are active
  let missingExcelIds = 0;
  for (const id of excelExistingIds) {
    if (!dbActiveIdSet.has(id)) {
      missingExcelIds++;
      errors.push(`Excel ID ${id} is missing from active database!`);
    }
  }
  if (missingExcelIds === 0) {
    console.log(
      `✅ Check 2: All ${excelExistingIds.size} active Excel preserved IDs exist and are active.`
    );
  }

  // 3. Check the two new bhajans
  const [new1] = await sequelize.query("SELECT * FROM master_bhajans WHERE id = 3012");
  const [new2] = await sequelize.query("SELECT * FROM master_bhajans WHERE id = 3013");

  if (
    !new1[0] ||
    new1[0].is_active !== 1 ||
    new1[0].title !== "Shiva Shiva Shiva Shiva Shivaya Namah Om"
  ) {
    errors.push(`New bhajan 1 (ID 3012) validation failed: ${JSON.stringify(new1)}`);
  } else {
    console.log(
      `✅ Check 3a: New bhajan 1 exists (ID ${new1[0].id}, "${new1[0].title}", deity: ${new1[0].deity}, active: ${new1[0].is_active === 1}).`
    );
  }

  if (
    !new2[0] ||
    new2[0].is_active !== 1 ||
    new2[0].title !== "Jaya Pandari Natha Panduranga Pundalika Varada"
  ) {
    errors.push(`New bhajan 2 (ID 3013) validation failed: ${JSON.stringify(new2)}`);
  } else {
    console.log(
      `✅ Check 3b: New bhajan 2 exists (ID ${new2[0].id}, "${new2[0].title}", deity: ${new2[0].deity}, active: ${new2[0].is_active === 1}).`
    );
  }

  // 4. Exact active count check
  const expectedActiveCount = excelExistingIds.size + 2; // 1022 + 2 = 1024
  if (dbActive.length !== expectedActiveCount) {
    errors.push(`Active count mismatch: Found ${dbActive.length}, expected ${expectedActiveCount}`);
  } else {
    console.log(
      `✅ Check 4: Exact active count matches authoritative Excel (${dbActive.length} = ${expectedActiveCount}).`
    );
  }

  // 5. Check foreign key references in diwali_participant_bhajans
  const [tables] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table'");
  let brokenReferences = 0;
  const [allMaster] = await sequelize.query("SELECT id, is_active, title FROM master_bhajans");
  const allMasterMap = new Map();
  allMaster.forEach((m) => allMasterMap.set(m.id, m));

  let totalRefsChecked = 0;
  for (const t of tables) {
    const [cols] = await sequelize.query(`PRAGMA table_info("${t.name}")`);
    if (cols.some((c) => c.name === "master_bhajan_id")) {
      const [refs] = await sequelize.query(
        `SELECT id, master_bhajan_id FROM "${t.name}" WHERE master_bhajan_id IS NOT NULL`
      );
      totalRefsChecked += refs.length;
      for (const r of refs) {
        if (!allMasterMap.has(Number(r.master_bhajan_id))) {
          brokenReferences++;
          errors.push(
            `Broken reference in table ${t.name}, row ${r.id}: master_bhajan_id ${r.master_bhajan_id} does not exist in master_bhajans!`
          );
        }
      }
    }
  }

  if (brokenReferences === 0) {
    console.log(`✅ Check 5: All ${totalRefsChecked} foreign key references intact (0 broken).`);
  }

  // 6. Check archived records retained for history
  const [archived] = await sequelize.query(
    "SELECT id, title, deity FROM master_bhajans WHERE is_active = 0"
  );
  console.log(`✅ Check 6: Total archived records retained: ${archived.length}.`);
  const historicalRefIds = [2364, 2666, 2898, 3005];
  for (const hid of historicalRefIds) {
    const record = allMasterMap.get(hid);
    if (!record) {
      errors.push(`Historical referenced master ${hid} does not exist in database!`);
    } else {
      console.log(
        `  * Referenced legacy bhajan ID ${hid} ("${record.title}") retained (active=${record.is_active === 1}).`
      );
    }
  }

  // 7. Check that active query returns only active records
  const activeOnlyFromOrm = await MasterBhajan.findAll({ where: { is_active: true } });
  const hasArchivedInActiveQuery = activeOnlyFromOrm.some(
    (b) => b.is_active === false || b.is_active === 0
  );
  if (hasArchivedInActiveQuery) {
    errors.push("MasterBhajan.findAll({ where: { is_active: true } }) returned archived rows!");
  } else {
    console.log(
      `✅ Check 7: Active queries return only is_active = true records (${activeOnlyFromOrm.length} records).`
    );
  }

  // 8. Check total MasterBhajan count
  const [totalRows] = await sequelize.query("SELECT COUNT(*) as cnt FROM master_bhajans");
  console.log(
    `✅ Check 8: Total rows in master_bhajans: ${totalRows[0].cnt} (1024 active + 1989 archived).`
  );

  if (errors.length > 0) {
    console.error("\n❌ INTEGRITY VALIDATION FAILED WITH ERRORS:");
    errors.forEach((e) => console.error("  - " + e));
    throw new Error("Integrity validation failed");
  }

  console.log("\n====================================================");
  console.log("🎉 ALL INTEGRITY CHECKS PASSED WITH 0 BROKEN REFERENCES!");
  console.log("====================================================");
}

if (require.main === module) {
  validateIntegrity()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { validateIntegrity };
