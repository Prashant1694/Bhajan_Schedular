const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Bulletin = sequelize.define(
  "Bulletin",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "announcement"
      // "update" | "event" | "announcement" | "bhajan_info"
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "draft"
      // "draft" | "published" | "archived"
    },
    is_pinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    published_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    tableName: "bulletins",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = Bulletin;
