const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");

const AdminUser = require("../models/AdminUser");

const googleClient = new OAuth2Client();

const { resolveSingerForAdmin } = require("../middleware/singerAuth");

async function createAdminSession(req, admin) {
  return new Promise((resolve, reject) => {
    const prevVisitorId = req.session?.visitorId;
    const prevSinger = req.session?.singer; // Preserve existing singer session!

    req.session.regenerate(async (regenErr) => {
      if (regenErr) {
        console.error("Admin session regeneration error:", regenErr);
        return reject(regenErr);
      }
      if (prevVisitorId) req.session.visitorId = prevVisitorId;

      req.session.adminUserId = admin.id;

      req.session.admin = {
        id: admin.id,
        username: admin.username,
        display_name: admin.display_name,
        title: admin.title || "",
        displayName: admin.display_name,
        role: admin.role
      };

      // Restore previously authenticated singer session OR auto-link admin's singer profile
      if (prevSinger) {
        req.session.singer = prevSinger;
      } else {
        try {
          const singer = await resolveSingerForAdmin(admin.id, admin.display_name, admin.username);
          if (singer) {
            req.session.singer = {
              id: singer.id,
              name: singer.name,
              gender: singer.gender,
              preferred_scale: singer.preferred_scale || null,
              pinVerifiedAt: Date.now(),
              isAdminLinked: true
            };
          }
        } catch (linkErr) {
          console.error("Failed to auto-link singer profile for admin:", linkErr);
        }
      }

      try {
        const visitorId = req.session.visitorId;
        if (visitorId) {
          const UserPresence = require("../models/UserPresence");
          const userType = admin.role === "super_admin" ? "super_admin" : "admin";
          const titleStr = admin.title ? ` (${admin.title})` : "";
          await UserPresence.update(
            {
              user_type: userType,
              admin_id: admin.id,
              username: `${admin.display_name || admin.username}${titleStr}`,
              last_seen_at: new Date()
            },
            { where: { session_id: visitorId } }
          );
        }
      } catch (err) {
        console.error("Session presence upgrade error:", err.message);
      }

      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve();
      });
    });
  });
}

exports.showLogin = (req, res) => {
  if (req.session && req.session.adminUserId) {
    return res.redirect("/admin");
  }

  res.render("admin-login", {
    error: null,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    showLoader: true
  });
};

exports.login = async (req, res) => {
  try {
    const username = (req.body.username || "")
      .trim()
      .toLowerCase();

    const password = req.body.password || "";

    const admin = await AdminUser.findOne({
      where: {
        username
      }
    });

    if (!admin || !admin.is_active) {
      return res.status(401).render("admin-login", {
        error: "Invalid username or password.",
        googleClientId: process.env.GOOGLE_CLIENT_ID || null
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).render("admin-login", {
        error: "Invalid username or password.",
        googleClientId: process.env.GOOGLE_CLIENT_ID || null
      });
    }

    await createAdminSession(req, admin);

    req.session.save((error) => {
      if (error) {
        console.error("Session save failed:", error);

        return res.status(500).render("admin-login", {
          error: "Login failed. Please try again.",
          googleClientId: process.env.GOOGLE_CLIENT_ID || null
        });
      }

      res.redirect("/admin");
    });
  } catch (error) {
    console.error("Admin login failed:", error);

    res.status(500).render("admin-login", {
      error: "Login failed. Please try again.",
      googleClientId: process.env.GOOGLE_CLIENT_ID || null
    });
  }
};
async function verifyGoogleCredential(credential) {

  if (!credential) {
    throw new Error("Google credential is required.");
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("Google Sign-In is not configured.");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.sub) {
    throw new Error("Google authentication failed.");
  }

  return payload;

}
exports.googleLogin = async (req, res) => {
  try {
    const credential = req.body.credential;

    if (!credential) {
      return res.status(400).json({
        success: false,
        error: "Google credential is required."
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error("GOOGLE_CLIENT_ID is not configured.");

      return res.status(500).json({
        success: false,
        error: "Google Sign-In is not configured."
      });
    }

    const payload =
      await verifyGoogleCredential(
        credential
      );

    const googleSub = payload.sub;
    const googleEmail = (payload.email || "")
      .trim()
      .toLowerCase();

    let admin = await AdminUser.findOne({
      where: {
        google_sub: googleSub
      }
    });

    if (!admin) {
      if (!payload.email_verified || !googleEmail) {
        return res.status(403).json({
          success: false,
          error: "This Google account is not authorized."
        });
      }

      const pendingAdmin = await AdminUser.findOne({
        where: {
          google_email: googleEmail,
          google_sub: null,
          is_active: true
        }
      });

      if (!pendingAdmin) {
        return res.status(403).json({
          success: false,
          error: "This Google account is not authorized."
        });
      }

      pendingAdmin.google_sub = googleSub;

      await pendingAdmin.save();

      admin = pendingAdmin;

      console.log(
        `✅ Google account linked to admin user ${admin.id}.`
      );
    }

    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        error: "This Google account is not authorized."
      });
    }

    await createAdminSession(req, admin);

    req.session.save((error) => {
      if (error) {
        console.error("Google session save failed:", error);

        return res.status(500).json({
          success: false,
          error: "Login failed. Please try again."
        });
      }

      res.json({
        success: true,
        redirect: "/admin"
      });
    });
  } catch (error) {
    console.error("Google login failed:", error);

    res.status(401).json({
      success: false,
      error: "Google authentication failed."
    });
  }
};

const UserPresence = require("../models/UserPresence");
const { Op } = require("sequelize");

exports.logout = async (req, res) => {
  try {
    const visitorId = req.session?.visitorId;
    const adminId = req.session?.adminUserId;
    if (visitorId || adminId) {
      await UserPresence.update(
        { last_seen_at: new Date(0) },
        {
          where: {
            [Op.or]: [
              visitorId ? { session_id: visitorId } : null,
              adminId ? { admin_id: adminId } : null
            ].filter(Boolean)
          }
        }
      );
    }
  } catch (err) {
    console.error("Logout presence update failed:", err.message);
  }

  // Clear admin session while preserving user/singer identity
  if (req.session) {
    delete req.session.adminUserId;
    delete req.session.admin;
    req.session.save((saveErr) => {
      if (saveErr) console.error("Session save error on admin logout:", saveErr);
      res.redirect("/");
    });
  } else {
    res.redirect("/");
  }
};
exports.showForgotPassword = (req, res) => {

  res.render("forgot-password", {
    error: null
  });

};
exports.checkForgotPassword = async (req, res) => {

  const username =
    (req.body.username || "")
      .trim()
      .toLowerCase();

  const admin =
    await AdminUser.findOne({
      where: { username }
    });

  if (!admin) {

    return res.render(
      "forgot-password",
      {
        error: "Account not found."
      }
    );

  }

  if (admin.google_sub) {

    return res.redirect(
      `/forgot-password/google/${admin.id}`
    );

  }

  const superAdmin =
    await AdminUser.findOne({

      where: {
        role: "super_admin",
        is_active: true
      }

    });

  res.render(
    "forgot-password-contact",
    {
      superAdmin
    }
  );

};
exports.showGoogleRecovery = async (req, res) => {

  const admin = await AdminUser.findByPk(
    req.params.id
  );

  if (!admin) {
    return res.redirect("/forgot-password");
  }

  res.render(
    "forgot-password-google",
    {
      admin,
      googleClientId:
        process.env.GOOGLE_CLIENT_ID
    }
  );

};
exports.googleRecovery = async (req, res) => {

  try {

    const { credential, adminId } = req.body;

    const payload =
      await verifyGoogleCredential(
        credential
      );

    const admin =
      await AdminUser.findByPk(adminId);

    if (!admin) {

      return res.status(404).json({
        success: false,
        error: "Administrator not found."
      });

    }

    if (!admin.google_sub) {

      return res.status(403).json({
        success: false,
        error: "Google account not linked."
      });

    }

    if (payload.sub !== admin.google_sub) {

      return res.status(403).json({
        success: false,
        error: "Incorrect Google account."
      });

    }

    req.session.passwordRecovery = {

      adminId: admin.id,

      expires:
        Date.now() + 5 * 60 * 1000

    };

    req.session.save(() => {

      res.json({

        success: true,

        redirect:
          "/forgot-password/reset"

      });

    });

  }

  catch (error) {

    console.error(error);

    res.status(401).json({

      success: false,

      error:
        "Google verification failed."

    });

  }

};
exports.showPasswordReset = (req, res) => {

  const recovery =
    req.session.passwordRecovery;

  if (
    !recovery ||
    recovery.expires < Date.now()
  ) {

    return res.redirect(
      "/forgot-password"
    );

  }

  res.render(
    "forgot-password-reset",
    {
      error: null
    }
  );

};

exports.resetForgotPassword = async (req, res) => {

  const recovery =
    req.session.passwordRecovery;

  if (
    !recovery ||
    recovery.expires < Date.now()
  ) {

    return res.redirect(
      "/forgot-password"
    );

  }

  const {
    password,
    confirmPassword
  } = req.body;

  if (
    password !== confirmPassword
  ) {

    return res.render(
      "forgot-password-reset",
      {
        error:
          "Passwords do not match."
      }
    );

  }

  const admin =
    await AdminUser.findByPk(
      recovery.adminId
    );

  if (!admin) {

    return res.redirect(
      "/forgot-password"
    );

  }

  admin.password_hash =
    await bcrypt.hash(
      password,
      12
    );

  await admin.save();

  delete req.session.passwordRecovery;

  req.session.save(() => {

    res.redirect(
      "/admin-login"
    );

  });

};