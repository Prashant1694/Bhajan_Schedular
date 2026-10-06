const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const DeityRule = sequelize.define(
  "DeityRule",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    session_date: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "default",
      unique: "session_deity_unique"
    },
    deity_name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: "session_deity_unique"
    },
    min_required: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    max_allowed: {
      type: DataTypes.INTEGER,
      defaultValue: 99
    }
  },
  {
    tableName: "deity_rules_v4",
    timestamps: false
  }
);
module.exports = DeityRule;
