const { DataTypes } = require("sequelize");

const sequelize = require("../config/database");

const AdminUser = sequelize.define(
  "AdminUser",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    google_sub: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },

    google_email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },

    display_name: {
      type: DataTypes.STRING,
      allowNull: false
    },

    title: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ""
    },

    password_hash: {
      type: DataTypes.STRING,
      allowNull: false
    },

    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "admin",
      validate: {
        isIn: [["admin", "super_admin"]]
      }
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },

    singer_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    tableName: "admin_users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

const Singer = require("./Singer");
AdminUser.belongsTo(Singer, { foreignKey: "singer_id", as: "singer" });

module.exports = AdminUser;