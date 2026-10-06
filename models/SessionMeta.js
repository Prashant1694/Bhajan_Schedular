const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const SessionMeta = sequelize.define(
  "SessionMeta",
  {
    session_date: { type: DataTypes.DATEONLY, primaryKey: true },
    is_locked: { type: DataTypes.BOOLEAN, defaultValue: false }
  },
  {
    tableName: "session_meta",
    timestamps: false
  }
);
module.exports = SessionMeta;
