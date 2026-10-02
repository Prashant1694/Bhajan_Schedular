const crypto = require("crypto");
const { Sequelize, Op } = require("sequelize");
const BhajanReport = require("../models/BhajanReport");
const MasterBhajan = require("../models/MasterBhajan");
const ActivityLog = require("../models/ActivityLog");

function generateTicketCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "REP-";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// -------------------------------------------------------------
// USER ENDPOINTS
// -------------------------------------------------------------

exports.submitReport = async (req, res) => {
  try {
    const {
      master_id,
      bhajan_title,
      categories,
      description,
      suggested_correction,
      reporter_name,
      reporter_contact,
      visitor_id
    } = req.body;

    const cleanTitle = (bhajan_title || "").toString().replace(/<[^>]*>/g, '').trim().slice(0, 200);
    if (!cleanTitle) {
      return res.status(400).json({ error: "Bhajan title is required." });
    }

    const hasCategories = Array.isArray(categories) ? categories.length > 0 : Boolean(categories);
    const hasDesc = Boolean(description && description.trim());

    if (!hasCategories && !hasDesc) {
      return res.status(400).json({ error: "Please select at least one issue category or provide details." });
    }

    const catMap = {
      lyrics: "Lyrics incorrect or missing lines",
      scale: "Harmonium scale / pitch incorrect",
      raga: "Raga name inaccurate",
      deity: "Deity categorization inaccurate",
      tempo: "Tempo incorrect",
      sheet: "Music sheet notation error",
      spelling: "Title or lyrics spelling typo",
      other: "General correction"
    };

    let effectiveDescription = hasDesc ? description.trim() : "";
    if (!effectiveDescription) {
      const catList = Array.isArray(categories) ? categories : [categories];
      const labels = catList.map(c => catMap[c] || c);
      effectiveDescription = "Issue reported in: " + labels.join(", ");
    }

    // Generate unique ticket code
    let ticketCode = generateTicketCode();
    let exists = await BhajanReport.findOne({ where: { ticket_code: ticketCode } });
    while (exists) {
      ticketCode = generateTicketCode();
      exists = await BhajanReport.findOne({ where: { ticket_code: ticketCode } });
    }

    const effectiveVisitorId = visitor_id || req.session?.visitorId || null;
    const singerId = req.session?.singer ? req.session.singer.id : null;
    const effectiveReporterName = (req.session?.singer?.name) || (reporter_name ? reporter_name.trim() : null);

    let categoriesJson = "[]";
    if (Array.isArray(categories)) {
      categoriesJson = JSON.stringify(categories);
    } else if (typeof categories === "string") {
      categoriesJson = JSON.stringify([categories]);
    }

    const cleanDesc = effectiveDescription.replace(/<[^>]*>/g, '').trim().slice(0, 2000);
    const cleanSuggested = suggested_correction ? suggested_correction.toString().replace(/<[^>]*>/g, '').trim().slice(0, 2000) : null;
    const cleanReporterName = effectiveReporterName ? effectiveReporterName.toString().replace(/<[^>]*>/g, '').trim().slice(0, 100) : null;
    const cleanContact = reporter_contact ? reporter_contact.toString().replace(/<[^>]*>/g, '').trim().slice(0, 100) : null;
    const cleanVisitorId = effectiveVisitorId ? effectiveVisitorId.toString().replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 100) : null;
    const parsedMasterId = master_id ? parseInt(master_id, 10) : null;

    const report = await BhajanReport.create({
      ticket_code: ticketCode,
      master_id: (parsedMasterId && !isNaN(parsedMasterId) && parsedMasterId > 0) ? parsedMasterId : null,
      singer_id: singerId,
      bhajan_title: cleanTitle,
      categories: categoriesJson,
      description: cleanDesc,
      suggested_correction: cleanSuggested,
      reporter_name: cleanReporterName,
      reporter_contact: cleanContact,
      visitor_id: cleanVisitorId,
      status: "pending"
    });

    // Log activity
    try {
      if (ActivityLog) {
        await ActivityLog.create({
          session_id: effectiveVisitorId || "anonymous",
          user_type: "user",
          username: reporter_name || "Guest User",
          action: "SUBMITTED_BHAJAN_REPORT",
          section: "Master Bhajan Bank",
          page_url: master_id ? `/bhajan/${master_id}` : "/master-bank",
          details: `Reported issue for "${bhajan_title.trim()}" (Ticket: ${ticketCode})`
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      message: "Report submitted successfully. Thank you for helping keep our Bhajan Bank accurate!",
      ticket: {
        id: report.id,
        ticket_code: report.ticket_code,
        bhajan_title: report.bhajan_title,
        status: report.status,
        created_at: report.created_at
      }
    });
  } catch (error) {
    console.error("Error submitting bhajan report:", error);
    res.status(500).json({ error: error.message || "Failed to submit report." });
  }
};

exports.getMyReports = async (req, res) => {
  try {
    const visitorId = req.query.visitor_id || req.session?.visitorId || null;
    const ticketCodes = req.query.tickets ? req.query.tickets.split(",").map(t => t.trim()).filter(Boolean) : [];

    const orClauses = [];
    if (visitorId) orClauses.push({ visitor_id: visitorId });
    if (ticketCodes.length > 0) orClauses.push({ ticket_code: { [Op.in]: ticketCodes } });
    if (req.session?.singer) {
      if (req.session.singer.id) orClauses.push({ singer_id: req.session.singer.id });
      if (req.session.singer.name) orClauses.push({ reporter_name: req.session.singer.name });
    }

    if (orClauses.length === 0) {
      return res.json({ reports: [], has_unread_reply: false });
    }

    const reports = await BhajanReport.findAll({
      where: { [Op.or]: orClauses },
      order: [["created_at", "DESC"]]
    });

    const parsed = reports.map(r => {
      const plain = r.toJSON();
      try {
        plain.categories = JSON.parse(plain.categories);
      } catch (_) {
        plain.categories = [];
      }
      return plain;
    });

    const hasUnreadReply = parsed.some(r => r.admin_response && !r.user_viewed_reply);

    res.json({
      reports: parsed,
      has_unread_reply: hasUnreadReply
    });
  } catch (error) {
    console.error("Error fetching user reports:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTicketStatus = async (req, res) => {
  try {
    const rawCode = (req.params.code || "").trim().toUpperCase().slice(0, 20);
    if (!/^REP-[A-Z0-9]{3,10}$/.test(rawCode)) {
      return res.status(400).json({ error: "Invalid ticket code format." });
    }
    const report = await BhajanReport.findOne({
      where: { ticket_code: rawCode }
    });

    if (!report) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    const plain = report.toJSON();
    try {
      plain.categories = JSON.parse(plain.categories);
    } catch (_) {
      plain.categories = [];
    }

    res.json(plain);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.markTicketSeen = async (req, res) => {
  try {
    const rawCode = (req.params.code || "").trim().toUpperCase().slice(0, 20);
    if (!/^REP-[A-Z0-9]{3,10}$/.test(rawCode)) {
      return res.status(400).json({ error: "Invalid ticket code format." });
    }
    await BhajanReport.update(
      { user_viewed_reply: true },
      { where: { ticket_code: rawCode } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.showMyReportsPage = async (req, res) => {
  try {
    res.render("user-reports", {
      page: "my-reports",
      pageTitle: "My Reported Issues | Bhajan Planner",
      currentAdmin: req.session.admin || null
    });
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};

// -------------------------------------------------------------
// ADMIN ENDPOINTS
// -------------------------------------------------------------

exports.showAdminReports = async (req, res) => {
  try {
    const { status, category, search } = req.query;

    const where = {};
    if (status && ["pending", "under_review", "resolved", "closed"].includes(status)) {
      where.status = status;
    }
    if (category) {
      where.categories = { [Op.like]: `%"${category}"%` };
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { bhajan_title: { [Op.like]: q } },
        { ticket_code: { [Op.like]: q } },
        { reporter_name: { [Op.like]: q } },
        { description: { [Op.like]: q } }
      ];
    }

    const reports = await BhajanReport.findAll({
      where,
      order: [
        // Pending first, then under_review, then resolved, then newest
        [
          Sequelize.literal(`CASE 
            WHEN status = 'pending' THEN 1 
            WHEN status = 'under_review' THEN 2 
            WHEN status = 'resolved' THEN 3 
            ELSE 4 END`),
          'ASC'
        ],
        ["created_at", "DESC"]
      ]
    });

    const counts = {
      total: await BhajanReport.count(),
      pending: await BhajanReport.count({ where: { status: "pending" } }),
      under_review: await BhajanReport.count({ where: { status: "under_review" } }),
      resolved: await BhajanReport.count({ where: { status: "resolved" } }),
      closed: await BhajanReport.count({ where: { status: "closed" } })
    };

    const parsedReports = reports.map(r => {
      const plain = r.toJSON();
      try {
        plain.categories = JSON.parse(plain.categories);
      } catch (_) {
        plain.categories = [];
      }
      return plain;
    });

    res.render("admin-reports", {
      page: "reports",
      pageTitle: "Bhajan Issue Reports | Admin",
      reports: parsedReports,
      counts,
      selectedStatus: status || "",
      selectedCategory: category || "",
      searchQuery: search || "",
      currentAdmin: req.session.admin
    });
  } catch (error) {
    console.error("Error loading admin reports:", error);
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};

exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_response, admin_notes } = req.body;

    const report = await BhajanReport.findByPk(id);
    if (!report) {
      return res.status(404).json({ error: "Report not found." });
    }

    const admin = req.session.admin;
    const adminName = admin ? (admin.display_name || admin.username || "Admin") : "Admin";

    const updatePayload = {
      admin_response: admin_response !== undefined ? admin_response.trim() : report.admin_response,
      admin_notes: admin_notes !== undefined ? admin_notes.trim() : report.admin_notes,
      reviewed_by: adminName,
      reviewed_at: new Date(),
      user_viewed_reply: false // notify user of update
    };

    if (status && ["pending", "under_review", "resolved", "closed"].includes(status)) {
      updatePayload.status = status;
      if (status === "resolved" || status === "closed") {
        updatePayload.resolved_at = new Date();
      }
    }

    await report.update(updatePayload);

    // Send personalized notification if report is associated with a singer
    if (report.singer_id) {
      try {
        const notificationService = require("../services/notificationService");
        const notifTitle = (status === "resolved")
          ? `✅ Ticket Resolved: ${report.bhajan_title}`
          : `💬 Coordinator Update: ${report.ticket_code}`;
        const notifBody = admin_response
          ? `${adminName} replied: "${admin_response.slice(0, 100)}${admin_response.length > 100 ? '...' : ''}"`
          : `Your correction ticket for "${report.bhajan_title}" status is now ${(status || report.status).replace('_', ' ')}.`;

        await notificationService.createPersonalized({
          type: "report_update",
          title: notifTitle,
          body: notifBody,
          link: `/singer/hub#tab-reports`,
          eventKey: `ticket_update:${report.id}:${Date.now()}`,
          singerId: report.singer_id,
          metadata: { ticket_code: report.ticket_code, report_id: report.id, status }
        });
      } catch (notifErr) {
        console.error("Failed to dispatch ticket notification:", notifErr.message);
      }
    }

    res.json({
      success: true,
      message: `Ticket ${report.ticket_code} updated successfully.`,
      report: report.toJSON()
    });
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({ error: error.message });
  }
};
