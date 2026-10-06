const path = require("path");
const fs = require("fs");
const sequelize = require("../config/database");

const BACKUP_DIR = path.join(__dirname, "..", "backups");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Creates an atomic, consistent SQLite snapshot via VACUUM INTO
 */
async function createBackup(prefix = "backup") {
  ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${prefix}_${timestamp}.sqlite`;
  const targetPath = path.join(BACKUP_DIR, filename);

  await sequelize.query("VACUUM INTO :target", {
    replacements: { target: targetPath }
  });

  return targetPath;
}

/**
 * Prunes backups older than maxAgeDays (default 7 days)
 */
function pruneOldBackups(maxAgeDays = 7) {
  try {
    ensureBackupDir();
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(BACKUP_DIR);

    for (const file of files) {
      if (!file.endsWith(".sqlite")) continue;
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.error("Failed to prune old backups:", err.message);
  }
}

/**
 * Gets the latest available backup path
 */
async function getOrGenerateBackup() {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".sqlite"));
  if (files.length > 0) {
    files.sort((a, b) => {
      return (
        fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs -
        fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs
      );
    });
    return path.join(BACKUP_DIR, files[0]);
  }
  return await createBackup("download");
}

/**
 * Initializes nightly backup timer (runs every 24 hours)
 */
function startNightlyBackupScheduler() {
  if (process.env.NODE_ENV === "test") return;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const timer = setInterval(async () => {
    try {
      await createBackup("nightly");
      pruneOldBackups(7);
      console.log("✅ Nightly database backup completed successfully.");
    } catch (err) {
      console.error("Nightly database backup failed:", err.message);
    }
  }, TWENTY_FOUR_HOURS);
  if (timer.unref) timer.unref();
}

module.exports = {
  createBackup,
  pruneOldBackups,
  getOrGenerateBackup,
  startNightlyBackupScheduler,
  BACKUP_DIR
};
