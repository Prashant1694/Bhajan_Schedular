const AdminUser = require("../models/AdminUser");

class AdminSafetyService {
  async isSelf(currentAdminId, targetAdminId) {
    return Number(currentAdminId) === Number(targetAdminId);
  }

  async activeSuperAdminCount() {
    return AdminUser.count({
      where: {
        role: "super_admin",

        is_active: true
      }
    });
  }

  async isLastActiveSuperAdmin(admin) {
    if (admin.role !== "super_admin" || !admin.is_active) {
      return false;
    }

    const count = await this.activeSuperAdminCount();

    return count <= 1;
  }

  async canDeactivate(currentAdminId, admin) {
    if (await this.isSelf(currentAdminId, admin.id)) {
      throw new Error("You cannot deactivate your own account.");
    }

    if (await this.isLastActiveSuperAdmin(admin)) {
      throw new Error("Cannot deactivate the last active Super Admin.");
    }
  }
  async canDelete(currentAdminId, admin) {
    if (await this.isSelf(currentAdminId, admin.id)) {
      throw new Error("You cannot delete your own account.");
    }

    if (await this.isLastActiveSuperAdmin(admin)) {
      throw new Error("Cannot delete the last active Super Admin.");
    }
  }
}

module.exports = new AdminSafetyService();
