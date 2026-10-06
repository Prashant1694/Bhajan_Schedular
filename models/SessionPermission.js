const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const SessionPermission = sequelize.define(
  "SessionPermission",
  {
    date: {
      type: DataTypes.DATEONLY,
      primaryKey: true
    },
    type: {
      type: DataTypes.STRING // 'special' or 'festival'
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    }
  },
  { tableName: "session_permissions", timestamps: false }
);
module.exports = SessionPermission;
