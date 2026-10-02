const express = require("express");
const router = express.Router();

const plannerController = require("../controllers/plannerController");
const { bhajanSubmitLimit } = require("../middleware/security");
const { requireApiLogin } = require("../middleware/auth");

router.get("/submit-form", plannerController.showSubmitForm);
router.get("/session-link", plannerController.sessionLink);
router.post("/submit-form", bhajanSubmitLimit, plannerController.submitForm);
// Protect Plan & Share: Admins view plan-view; non-admin devotees redirect to /database (History)
router.get("/plan-view", (req, res, next) => {
  if (!req.session || !req.session.admin) {
    return res.redirect("/database");
  }
  next();
}, plannerController.planView);
router.post("/submit", requireApiLogin, plannerController.submitApi);
router.get("/plan/:session_date", plannerController.getPlan);

module.exports = router;