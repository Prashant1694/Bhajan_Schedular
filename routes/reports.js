const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { requireLogin } = require("../middleware/auth");
const { reportSubmitLimit, ticketRateLimit } = require("../middleware/security");

// Public / User routes
router.post("/api/reports/submit", reportSubmitLimit, reportController.submitReport);
router.get("/api/reports/my-reports", ticketRateLimit, reportController.getMyReports);
router.get("/api/reports/ticket/:code", ticketRateLimit, reportController.getTicketStatus);
router.post("/api/reports/ticket/:code/seen", ticketRateLimit, reportController.markTicketSeen);
router.get("/my-reports", reportController.showMyReportsPage);

// Admin routes
router.get("/admin/reports", requireLogin, reportController.showAdminReports);
router.post("/admin/reports/:id/update", requireLogin, reportController.updateReport);

module.exports = router;
