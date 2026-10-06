const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PushSubscription = sequelize.define(
  "PushSubscription",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    singer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    device_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    endpoint: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    },
    p256dh: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    auth: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  },
  {
    tableName: "push_subscriptions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = PushSubscription;
