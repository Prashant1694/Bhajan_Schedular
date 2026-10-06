const sequelize = require("../config/database");

/**
 * Destroys all active sessions in the database belonging to a specific admin ID.
 * Invoked upon admin deactivation, deletion, or password reset to prevent
 * unauthorized continuation of compromised or revoked sessions.
 */
async function destroyAdminSessions(adminId) {
  if (!adminId) return;
  try {
    const [rows] = await sequelize.query("SELECT sid, data FROM Sessions");
    if (!rows || rows.length === 0) return;

    const sidsToDelete = [];
    for (const row of rows) {
      try {
        const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        if (
          parsed &&
          (parsed.adminUserId === adminId ||
            parsed.adminUserId === Number(adminId) ||
            (parsed.admin && (parsed.admin.id === adminId || parsed.admin.id === Number(adminId))))
        ) {
          sidsToDelete.push(row.sid);
        }
      } catch (_) {
        // Skip rows with non-JSON or corrupted data
      }
    }

    for (const sid of sidsToDelete) {
      await sequelize.query("DELETE FROM Sessions WHERE sid = :sid", {
        replacements: { sid }
      });
    }

    if (sidsToDelete.length > 0) {
      console.log(`[SessionManager] Revoked ${sidsToDelete.length} active session(s) for admin ID ${adminId}`);
    }
  } catch (err) {
    console.error("[SessionManager] Error destroying admin sessions:", err.message);
  }
}

module.exports = {
  destroyAdminSessions
};
