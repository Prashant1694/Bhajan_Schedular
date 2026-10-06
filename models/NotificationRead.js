const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const NotificationRead = sequelize.define(
  "NotificationRead",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    notification_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    device_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: "notification_reads",
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["notification_id", "device_id"]
      }
    ]
  }
);

module.exports = NotificationRead;
