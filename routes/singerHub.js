const express = require("express");
const router = express.Router();
const singerHubController = require("../controllers/singerHubController");
const { requireSingerAuth } = require("../middleware/singerAuth");
const { singerLoginLimit, singerPinChangeLimit } = require("../middleware/security");

// Public Singer Auth
router.get("/singer/login", singerHubController.showLoginPage);
router.post("/api/singer/login", singerLoginLimit, singerHubController.login);
router.get("/api/singer/:id/pin-status", singerHubController.checkSingerPinStatus);

// Protected Singer Hub
router.get("/singer/hub", requireSingerAuth, singerHubController.showHub);
router.get("/my-hub", requireSingerAuth, singerHubController.showHub);
router.post("/api/singer/change-pin", requireSingerAuth, singerPinChangeLimit, singerHubController.changePin);
router.post("/api/singer/profile/scale", requireSingerAuth, singerHubController.updatePreferredScale);

// Songbook & Repertoire (Phase 2)
router.get("/api/singer/songbook", requireSingerAuth, singerHubController.getSongbookList);
router.post("/api/singer/songbook/toggle", requireSingerAuth, singerHubController.toggleSongbook);
router.post("/api/singer/songbook/update", requireSingerAuth, singerHubController.updateSongbookDetails);
router.get("/api/singer/songbook/check/:masterId", singerHubController.checkSongbookStatus);

// Logout
router.get("/singer/logout", singerHubController.logout);
router.post("/singer/logout", singerHubController.logout);

module.exports = router;
