const bcrypt = require("bcrypt");
const AdminUser = require("../models/AdminUser");
const adminSafetyService = require("./adminSafetyService");
const { validatePasswordPolicy } = require("./securityHelpers");
const { destroyAdminSessions } = require("./sessionManager");
const { invalidateAdminCache } = require("../middleware/auth");

class AdminUserService {
  async validateCreateInput(data) {
    let { display_name, title, username, password, google_email, role } = data;

    display_name = (display_name || "").trim();
    title = (title || "").trim();
    username = (username || "").trim().toLowerCase();
    password = (password || "").trim();
    google_email = (google_email || "").trim().toLowerCase();
    role = (role || "admin").trim();

    if (!display_name || !username || !password) {
      throw new Error("Please fill all required fields.");
    }

    const passCheck = validatePasswordPolicy(password, username);
    if (!passCheck.isValid) {
      throw new Error(passCheck.message);
    }

    if (!["admin", "super_admin"].includes(role)) {
      throw new Error("Invalid role.");
    }

    return {
      display_name,
      title,
      username,
      password,
      google_email,
      role
    };
  }

  async ensureUsernameAvailable(username) {
    const existing = await AdminUser.findOne({
      where: { username }
    });

    if (existing) {
      throw new Error("Username already exists.");
    }
  }

  async ensureGoogleEmailAvailable(google_email) {
    if (!google_email) return;

    const existing = await AdminUser.findOne({
      where: { google_email }
    });

    if (existing) {
      throw new Error("Google email already belongs to another admin.");
    }
  }

  async hashPassword(password) {
    return bcrypt.hash(password, 12);
  }

  async createAdmin(data) {
    const admin = await this.validateCreateInput(data);

    await this.ensureUsernameAvailable(admin.username);
    await this.ensureGoogleEmailAvailable(admin.google_email);

    const password_hash = await this.hashPassword(admin.password);

    return AdminUser.create({
      display_name: admin.display_name,
      title: admin.title || "",
      username: admin.username,
      password_hash,
      google_email: admin.google_email || null,
      role: admin.role,
      is_active: true,
      singer_id: data.singer_id ? Number(data.singer_id) : null
    });
  }

  async updateAdmin(id, data) {
    const admin = await this.findById(id);

    let { display_name, title, username, google_email, role } = data;

    display_name = (display_name || "").trim();
    title = (title || "").trim();
    username = (username || "").trim().toLowerCase();
    google_email = (google_email || "").trim().toLowerCase();
    role = (role || "admin").trim();

    if (!display_name || !username) {
      throw new Error("Please fill all required fields.");
    }

    if (!["admin", "super_admin"].includes(role)) {
      throw new Error("Invalid role.");
    }

    const existingUsername = await AdminUser.findOne({
      where: { username }
    });

    if (existingUsername && existingUsername.id !== admin.id) {
      throw new Error("Username already exists.");
    }

    if (google_email) {
      const existingGoogle = await AdminUser.findOne({
        where: { google_email }
      });

      if (existingGoogle && existingGoogle.id !== admin.id) {
        throw new Error("Google email already belongs to another admin.");
      }
    }

    admin.display_name = display_name;
    admin.title = title;
    admin.username = username;
    admin.google_email = google_email || null;
    admin.role = role;
    if (typeof data.singer_id !== "undefined") {
      admin.singer_id = data.singer_id ? Number(data.singer_id) : null;
    }

    await admin.save();
    invalidateAdminCache(admin.id);

    return admin;
  }

  async findById(id) {
    const admin = await AdminUser.findByPk(id);

    if (!admin) {
      throw new Error("Admin not found.");
    }

    return admin;
  }

  async deleteAdmin(currentAdminId, targetAdminId) {
    const admin = await this.findById(targetAdminId);

    await adminSafetyService.canDelete(currentAdminId, admin);

    await admin.destroy();
    invalidateAdminCache(targetAdminId);
    await destroyAdminSessions(targetAdminId);
  }

  async toggleActive(currentAdminId, targetAdminId) {
    const admin = await this.findById(targetAdminId);

    if (admin.is_active) {
      await adminSafetyService.canDeactivate(currentAdminId, admin);
    }

    admin.is_active = !admin.is_active;
    await admin.save();

    invalidateAdminCache(targetAdminId);
    if (!admin.is_active) {
      await destroyAdminSessions(targetAdminId);
    }

    return admin;
  }

  async resetPassword(targetAdminId, newPassword) {
    const admin = await this.findById(targetAdminId);

    newPassword = (newPassword || "").trim();

    const passCheck = validatePasswordPolicy(newPassword, admin.username);
    if (!passCheck.isValid) {
      throw new Error(passCheck.message);
    }

    admin.password_hash = await this.hashPassword(newPassword);
    await admin.save();

    invalidateAdminCache(targetAdminId);
    await destroyAdminSessions(targetAdminId);

    return admin;
  }
}

module.exports = new AdminUserService();
