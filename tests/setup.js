const path = require("path");
const fs = require("fs");
const os = require("os");
const bcrypt = require("bcrypt");

// 1. Enforce test environment flags and secrets BEFORE loading models/database
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "test-session-secret-must-be-at-least-32-chars-long";
process.env.CSRF_SECRET =
  process.env.CSRF_SECRET || "test-csrf-secret-must-be-at-least-32-chars-long";
process.env.SUPER_ADMIN_USER = process.env.SUPER_ADMIN_USER || "testadmin";
process.env.SUPER_ADMIN_PASS = process.env.SUPER_ADMIN_PASS || "TestAdmin#12345";
process.env.SUPER_ADMIN_DISPLAY_NAME = "Test Super Admin";

// 2. Route SQLite storage strictly to an isolated temporary file per test process
if (!process.env.DB_PATH || process.env.DB_PATH.endsWith("bhajans.db")) {
  const tempDbName = `bhajan-test-${process.pid}-${Date.now()}.db`;
  process.env.DB_PATH = path.join(os.tmpdir(), tempDbName);
}

const sequelize = require("../config/database");
const { initializeDatabase } = require("../services/databaseInitializer");
const Singer = require("../models/Singer");
const AdminUser = require("../models/AdminUser");

let initializedPromise = null;

async function setupTestDb() {
  if (initializedPromise) {
    return initializedPromise;
  }

  initializedPromise = (async () => {
    // Initialize full database schema, indexes, and tables on the temp SQLite file
    await initializeDatabase();

    // Seed test singer with PIN (id: 1)
    const existingSinger = await Singer.scope("withSecrets").findByPk(1);
    if (!existingSinger) {
      const hashedPin = await bcrypt.hash("1234", 10);
      await Singer.create({
        id: 1,
        name: "Test Singer",
        gender: "Male",
        pin: hashedPin,
        pin_set_at: new Date(),
        failed_attempts: 0
      });
    }

    // Seed unclaimed test singer without PIN (id: 2)
    const unclaimedSinger = await Singer.scope("withSecrets").findByPk(2);
    if (!unclaimedSinger) {
      await Singer.create({
        id: 2,
        name: "Unclaimed Singer",
        gender: "Female",
        pin: null,
        failed_attempts: 0
      });
    }

    // Seed active admin user for authentication testing
    const existingAdmin = await AdminUser.scope("withSecrets").findOne({
      where: { username: "regular_admin" }
    });
    if (!existingAdmin) {
      const adminHash = await bcrypt.hash("AdminPass#12345", 10);
      await AdminUser.create({
        username: "regular_admin",
        display_name: "Regular Admin",
        password_hash: adminHash,
        role: "admin",
        is_active: true
      });
    }
  })();

  return initializedPromise;
}

// Cleanup temp SQLite database files on process exit
function cleanupTempDb() {
  try {
    const dbPath = process.env.DB_PATH;
    const projectDb = path.join(__dirname, "..", "bhajans.db");
    if (dbPath && dbPath !== projectDb && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
      if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
    }
  } catch {}
}

process.on("exit", cleanupTempDb);

module.exports = {
  setupTestDb,
  sequelize
};
