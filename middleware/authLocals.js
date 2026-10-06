/**
 * Single source of truth for view authorization state
 * Exposes res.locals.auth = { isAdmin, isSuperAdmin, isSinger, user, admin, singer }
 */
function attachAuthLocals(req, res, next) {
  const admin = req.session?.admin || null;
  const singer = req.session?.singer || null;

  const isAdmin = Boolean(admin);
  const isSuperAdmin = Boolean(
    admin && (admin.role === "super_admin" || admin.role === "SUPER_ADMIN")
  );
  const isSinger = Boolean(singer && singer.name);

  const auth = {
    isAdmin,
    isSuperAdmin,
    isSinger,
    admin,
    singer,
    user: admin ? { ...admin, type: "admin" } : singer ? { ...singer, type: "singer" } : null
  };

  res.locals.auth = auth;
  res.locals.isAdmin = isAdmin;
  res.locals.isSuperAdmin = isSuperAdmin;
  res.locals.isSinger = isSinger;
  res.locals.currentAdmin = admin;
  res.locals.currentSinger = singer;

  next();
}

module.exports = { attachAuthLocals };
