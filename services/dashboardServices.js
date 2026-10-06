const db = require("../db");
async function getStats() {
  const [sessions, bhajans, singers, users] = await Promise.all([
    db.get("SELECT COUNT(*) AS count FROM sessions"),
    db.get("SELECT COUNT(*) AS count FROM bhajans"),
    db.get("SELECT COUNT(*) AS count FROM singers WHERE active = 1"),
    db.get("SELECT COUNT(*) AS count FROM users WHERE active = 1")
  ]);

  return {
    sessions: sessions.count,
    bhajans: bhajans.count,
    singers: singers.count,
    users: users.count
  };
}

module.exports = {
  getStats
};
