const express = require("express");
const router = express.Router();

const apiController = require("../controllers/apiController");
const { activityLimit } = require("../middleware/security");

router.get("/api/master-bhajans/:deity", apiController.getMasterBhajans);
router.get("/api/check-cooldown", apiController.checkCooldown);
router.get("/api/scale-suggestions", apiController.getScaleSuggestions);
router.get("/api/singers", apiController.getSingers);
router.get("/api/deity-rules", apiController.getDeityRules);
router.post("/api/activity/heartbeat", activityLimit, apiController.recordHeartbeat);
router.post("/api/activity/offline", activityLimit, apiController.recordOffline);

module.exports = router;
