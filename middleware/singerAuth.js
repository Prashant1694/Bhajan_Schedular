const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Global middleware to attach currently authenticated singer to res.locals
 * and enforce the 90-day re-verification window.
 */
function attachSinger(req, res, next) {
  if (req.session && req.session.singer) {
    const verifiedAt = req.session.singer.pinVerifiedAt || 0;
    const isExpired = Date.now() - verifiedAt > NINETY_DAYS_MS;

    if (isExpired) {
      delete req.session.singer;
      res.locals.currentSinger = null;
    } else {
      res.locals.currentSinger = req.session.singer;
    }
  } else {
    res.locals.currentSinger = null;
  }
  next();
}

/**
 * Gatekeeper middleware for singer-only pages (e.g. submitting bhajans, accessing /singer/hub).
 * Allows admin bypass if admin is logged in or admin=true query is provided.
 */
function requireSingerAuth(req, res, next) {
  const isAdmin = Boolean(req.session && req.session.admin);
  if (isAdmin) {
    return next();
  }

  if (req.session && req.session.singer) {
    const verifiedAt = req.session.singer.pinVerifiedAt || 0;
    const isExpired = Date.now() - verifiedAt > NINETY_DAYS_MS;

    if (!isExpired) {
      return next();
    }

    // 90 days have elapsed — re-verify PIN
    delete req.session.singer;
    const returnTo = encodeURIComponent(req.originalUrl || "/submit-form");
    return res.redirect(`/singer/login?expired=true&redirect=${returnTo}`);
  }

  // Not logged in
  const returnTo = encodeURIComponent(req.originalUrl || "/submit-form");
  return res.redirect(`/singer/login?redirect=${returnTo}`);
}

module.exports = {
  attachSinger,
  requireSingerAuth,
  NINETY_DAYS_MS
};
