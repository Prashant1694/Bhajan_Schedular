const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Singer = require("./Singer");
const MasterBhajan = require("./MasterBhajan");

const SingerBookmark = sequelize.define('SingerBookmark', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  singer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'singer_dictionary',
      key: 'id'
    }
  },
  master_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'master_bhajans',
      key: 'id'
    }
  },
  custom_scale: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'singer_bookmarks',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['singer_id', 'master_id']
    }
  ]
});

// Relationships
SingerBookmark.belongsTo(MasterBhajan, { foreignKey: 'master_id', as: 'masterBhajan' });
SingerBookmark.belongsTo(Singer, { foreignKey: 'singer_id', as: 'singer' });

module.exports = SingerBookmark;
