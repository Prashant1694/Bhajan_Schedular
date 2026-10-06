const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ActivityLog = sequelize.define(
  "ActivityLog",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    session_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    user_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "user" // "admin", "super_admin", "user"
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Guest User"
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false // e.g. "VIEW_PAGE", "SUBMIT_BHAJAN", "LOGIN", "EDIT_MASTER_BANK"
    },
    section: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "General" // "Submit Form", "Master Bank", "Admin Dashboard", "Singers", etc.
    },
    page_url: {
      type: DataTypes.STRING,
      allowNull: false
    },
    method: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "GET"
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true
    },
    user_agent: {
      type: DataTypes.STRING,
      allowNull: true
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: "activity_logs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = ActivityLog;
