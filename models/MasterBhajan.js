const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const MasterBhajan = sequelize.define('MasterBhajan', {
  title: { type: DataTypes.STRING, allowNull: false },
  deity: { type: DataTypes.STRING, allowNull: false },
  level: { type: DataTypes.STRING, allowNull: true },
  tempo: { type: DataTypes.STRING, allowNull: true },
  language: { type: DataTypes.STRING, allowNull: true },
  raga: { type: DataTypes.STRING, allowNull: true },
  raga_notes: { type: DataTypes.TEXT, allowNull: true },
  shruti: { type: DataTypes.STRING, allowNull: true },
  shruti_female: { type: DataTypes.STRING, allowNull: true },
  lyrics: { type: DataTypes.TEXT, allowNull: true },
  sheet_filename: { type: DataTypes.STRING, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'master_bhajans',
  timestamps: false
});
module.exports = MasterBhajan;