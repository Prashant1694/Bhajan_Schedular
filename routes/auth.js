const express = require("express");

const router = express.Router();

const authController = require("../controllers/authController");
const { authLimit, recoveryLimit } = require("../middleware/security");

router.get("/admin-login", authController.showLogin);
router.post("/admin-login", authLimit, authController.login);
router.post("/auth/google", authLimit, authController.googleLogin);
router.post("/logout", authController.logout);
router.get("/logout", (req, res) => res.redirect("/admin-login"));
router.get("/forgot-password", authController.showForgotPassword);
router.post("/forgot-password", recoveryLimit, authController.checkForgotPassword);
router.get("/forgot-password/google", authController.showGoogleRecovery);
router.get("/forgot-password/google/:id", authController.showGoogleRecovery);
router.post("/auth/google/recovery", recoveryLimit, authController.googleRecovery);
router.get("/forgot-password/reset", authController.showPasswordReset);
router.post("/forgot-password/reset", recoveryLimit, authController.resetForgotPassword);

module.exports = router;
