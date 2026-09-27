const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DiwaliEvent = sequelize.define(
  "DiwaliEvent",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Active" // "Active", "Archived"
    }
  },
  {
    tableName: "diwali_events",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = DiwaliEvent;
