const ActivityLog = require("../models/ActivityLog");
const sequelize = require("../config/database");

exports.log = async (user, action, details = "") => {
  try {
    await ActivityLog.create({
      session_id: "system",
      username: typeof user === "string" ? user : user?.display_name || "Admin",
      user_type: "admin",
      action: action || "SYSTEM_ACTION",
      section: "Admin Dashboard",
      page_url: "/admin",
      details: details || ""
    });
  } catch (err) {
    console.error("ActivityService log error:", err.message);
  }
};

exports.getRecent = async (limit = 10) => {
  try {
    return await ActivityLog.findAll({
      limit,
      order: [sequelize.literal("created_at DESC")]
    });
  } catch (err) {
    console.error("ActivityService getRecent error:", err.message);
    return [];
  }
};
