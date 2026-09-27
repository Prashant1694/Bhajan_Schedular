const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DiwaliParticipantBhajan = sequelize.define(
  "DiwaliParticipantBhajan",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    participant_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    event_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    master_bhajan_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    bhajan_title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Bhajan title is required" }
      }
    },
    scale: {
      type: DataTypes.STRING,
      allowNull: true
    },
    tabla: {
      type: DataTypes.STRING,
      allowNull: true
    },
    shruti: {
      type: DataTypes.STRING,
      allowNull: true
    },
    deity: {
      type: DataTypes.STRING,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    original_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    }
  },
  {
    tableName: "diwali_participant_bhajans",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = DiwaliParticipantBhajan;
