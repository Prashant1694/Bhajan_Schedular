const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DiwaliParticipant = sequelize.define(
  "DiwaliParticipant",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    event_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    lead_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Lead Singer Name is required" }
      }
    },
    partner_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Partner Name is required" }
      }
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: {
          args: [["Gents", "Ladies"]],
          msg: "Gender must be either Gents or Ladies"
        }
      }
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: "diwali_participants",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = DiwaliParticipant;
