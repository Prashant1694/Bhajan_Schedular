const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    event_key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false
      // "deadline_reminder" | "schedule_published" | "partner_bhajan" | "bulletin_published"
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    link: {
      type: DataTypes.STRING,
      allowNull: true
    },
    target_singer_id: {
      type: DataTypes.INTEGER,
      allowNull: true
      // null = broadcast to all, set = personalized for a specific singer
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true
      // JSON string for extensibility
    }
  },
  {
    tableName: "notifications",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false
  }
);

module.exports = Notification;
