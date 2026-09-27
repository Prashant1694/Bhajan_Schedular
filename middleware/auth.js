const requireLogin = (req, res, next) => {
  if (req.session && req.session.adminUserId) {
    return next();
  }

  return res.redirect("/admin-login");
};

const requireApiLogin = (req, res, next) => {
  if (req.session && req.session.adminUserId) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: "Unauthorized"
  });
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.session || !req.session.adminUserId) {
    return res.redirect("/admin-login");
  }

  if (
    req.session.admin &&
    req.session.admin.role === "super_admin"
  ) {
    return next();
  }

  if (req.xhr || (req.headers.accept && req.headers.accept.includes("json")) || req.path.includes("/api/")) {
    return res.status(403).json({
      success: false,
      error: "Forbidden: Super Admin access required"
    });
  }

  return res.status(403).send("Forbidden: Super Admin access required");
};

const requireApiSuperAdmin = (req, res, next) => {
  if (!req.session || !req.session.adminUserId) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized"
    });
  }

  if (
    req.session.admin &&
    req.session.admin.role === "super_admin"
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: "Forbidden: Super Admin access required"
  });
};

module.exports = {
  requireLogin,
  requireApiLogin,
  requireSuperAdmin,
  requireApiSuperAdmin
};