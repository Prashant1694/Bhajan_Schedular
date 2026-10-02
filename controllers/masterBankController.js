const { Sequelize } = require("sequelize");

const MasterBhajan = require("../models/MasterBhajan");
const BhajanSubmission = require("../models/BhajanSubmission");
const { normalizeBhajanTitle } = require("../services/fuzzyMatcher");
const { invalidateMissingCount } = require("../services/helpers");

const {
  escapeHTML
} = require("../templates");

exports.showMasterBank = async (req, res) => {
  try {
    const isAdmin = !!(req.session && req.session.adminUserId);
    const bhajans = await MasterBhajan.findAll({
      where: { is_active: true },
      order: [['title', 'ASC']]
    });
    res.render('master-bank', { bhajans, isAdmin });
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};
exports.addMasterBhajan = async (req, res) => {
  try {
    const { title, deity, raga, raga_notes, tempo, level, shruti, shruti_female, lyrics, sheet_filename } = req.body;
    await MasterBhajan.create({ title, deity, raga, raga_notes, tempo, level, shruti, shruti_female, lyrics, sheet_filename, is_active: true });
    invalidateMissingCount();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
exports.updateMasterBhajan = async (req, res) => {
  try {
    const { title, deity, level, tempo, raga, raga_notes, shruti, shruti_female, language, lyrics, sheet_filename } = req.body;

    const updateFields = { title, deity, level, tempo, raga, raga_notes, shruti, shruti_female, language, lyrics };
    if (sheet_filename !== undefined) {
      updateFields.sheet_filename = sheet_filename || null;
    }

    await MasterBhajan.update(
      updateFields,
      { where: { id: req.params.id } }
    );

    res.json({ success: true, message: "Bhajan updated successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.deleteMasterBhajan = async (req, res) => {
  try {
    // Soft-delete / archive to preserve historical foreign references
    await MasterBhajan.update({ is_active: false }, { where: { id: req.params.id } });
    res.json({ success: true, message: "Bhajan archived successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.exportMaster = async (req, res) => {
  try {
    const allBhajans = await MasterBhajan.findAll({
      where: { is_active: true },
      order: [['title', 'ASC']]
    });
    const jsonString = JSON.stringify(allBhajans, null, 2);
    res.setHeader('Content-disposition', 'attachment; filename=cleaned_master_bhajans.json');
    res.setHeader('Content-type', 'application/json');
    res.send(jsonString);
  } catch (error) {
    res.status(500).send("Export failed");
  }
};

exports.showArchivedMasterBank = async (req, res) => {
  try {
    const isAdmin = !!(req.session && req.session.adminUserId);
    const archivedBhajans = await MasterBhajan.findAll({
      where: { is_active: false },
      order: [['title', 'ASC']]
    });

    const [diwaliRefs] = await sequelize.query(`
      SELECT master_bhajan_id, COUNT(*) as ref_count
      FROM diwali_participant_bhajans
      WHERE master_bhajan_id IS NOT NULL
      GROUP BY master_bhajan_id
    `);
    const refMap = new Map();
    diwaliRefs.forEach(r => refMap.set(Number(r.master_bhajan_id), r.ref_count));

    const bhajansWithRefs = archivedBhajans.map(b => ({
      ...b.toJSON(),
      refCount: refMap.get(b.id) || 0
    }));

    res.render('admin-archived-master', { bhajans: bhajansWithRefs, isAdmin });
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};

/**
 * POST /api/admin/reconcile-bhajan
 *
 * Body: { submitted_title, action: 'link', master_bhajan_id }
 *       { submitted_title, action: 'add' }   ← no-op here; caller will use addMasterBhajan separately
 *
 * 'link': update every BhajanSubmission whose normalised title matches
 *         submitted_title to use the master bhajan's canonical title.
 *         This fixes the mismatch once and removes it from the catcher.
 */
exports.reconcileBhajan = async (req, res) => {
  try {
    const { submitted_title, action, master_bhajan_id } = req.body;

    if (!submitted_title || !action) {
      return res.status(400).json({ error: 'submitted_title and action are required.' });
    }

    if (action === 'link') {
      if (!master_bhajan_id) {
        return res.status(400).json({ error: 'master_bhajan_id is required for link action.' });
      }

      const master = await MasterBhajan.findOne({ where: { id: master_bhajan_id, is_active: true } });
      if (!master) {
        return res.status(404).json({ error: 'Active Master bhajan not found.' });
      }

      const normSubmitted = normalizeBhajanTitle(submitted_title);

      // Find all submissions whose normalised title matches the submitted title
      const allSubmissions = await BhajanSubmission.findAll({
        attributes: ['id', 'title'],
        raw: true
      });

      const toUpdate = allSubmissions.filter(
        s => normalizeBhajanTitle(s.title) === normSubmitted
      );

      if (toUpdate.length > 0) {
        const ids = toUpdate.map(s => s.id);
        await BhajanSubmission.update(
          { title: master.title },
          { where: { id: { [Sequelize.Op.in]: ids } } }
        );
        invalidateMissingCount();
      }

      return res.json({
        success: true,
        updatedCount: toUpdate.length,
        masterTitle: master.title
      });
    }

    // action === 'add' — caller handles this separately via addMasterBhajan
    return res.json({ success: true, action: 'add' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.showBhajanDetails = async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId || rawId === 'null' || rawId === 'undefined') {
      return res.status(404).render("not-found", {
        pageTitle: "Bhajan Not Found",
        message: "The requested bhajan could not be identified or found in the catalog.",
        pageCSS: null
      });
    }

    const trimmed = String(rawId).trim();
    let bhajan = null;

    if (/^\d+$/.test(trimmed)) {
      bhajan = await MasterBhajan.findByPk(parseInt(trimmed, 10));
    } else {
      // Allow title-based lookup fallback
      const decoded = decodeURIComponent(trimmed);
      bhajan = await MasterBhajan.findOne({
        where: {
          is_active: true,
          title: { [Sequelize.Op.like]: decoded }
        }
      });
    }

    if (!bhajan || !bhajan.is_active) {
      return res.status(404).render("not-found", {
        pageTitle: "Bhajan Not Found",
        message: "The requested bhajan could not be found or has been archived.",
        pageCSS: null
      });
    }

    const isAdmin = !!(req.session && (req.session.adminUserId || req.session.admin));

    res.render("bhajan-details", {
      bhajan,
      pageTitle: `${bhajan.title} — Lyrics & Details`,
      pageCSS: "bhajan-details.css",
      isAdmin
    });
  } catch (error) {
    console.error("Error in showBhajanDetails:", error);
    res.status(404).render("not-found", {
      pageTitle: "Bhajan Not Found",
      message: "The requested bhajan could not be retrieved at this time.",
      pageCSS: null
    });
  }
};
