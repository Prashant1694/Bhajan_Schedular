const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DiwaliSequenceEntry = sequelize.define(
  "DiwaliSequenceEntry",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sequence_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    participant_bhajan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence_order: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  {
    tableName: "diwali_sequence_entries",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = DiwaliSequenceEntry;
