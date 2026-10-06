const express = require("express");
const router = express.Router();

const bulletinController = require("../controllers/bulletinController");
const { requireLogin, requireApiLogin } = require("../middleware/auth");

// ── Public routes ────────────────────────────────────────────
router.get("/bulletins", bulletinController.listBulletins);
router.get("/bulletins/:id", bulletinController.bulletinDetail);

// ── Admin routes ─────────────────────────────────────────────
router.get("/admin/bulletins", requireLogin, bulletinController.adminListBulletins);
router.get("/admin/bulletins/new", requireLogin, bulletinController.adminNewBulletin);
router.post("/admin/bulletins", requireLogin, bulletinController.adminCreateBulletin);
router.get("/admin/bulletins/:id/edit", requireLogin, bulletinController.adminEditBulletin);
router.post("/admin/bulletins/:id", requireLogin, bulletinController.adminUpdateBulletin);
router.post("/admin/bulletins/:id/delete", requireLogin, bulletinController.adminDeleteBulletin);
router.post("/admin/bulletins/:id/toggle-pin", requireApiLogin, bulletinController.togglePin);
router.post(
  "/admin/bulletins/:id/toggle-publish",
  requireApiLogin,
  bulletinController.togglePublish
);

module.exports = router;
