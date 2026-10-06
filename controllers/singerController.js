const { Sequelize } = require("sequelize");
const Singer = require("../models/Singer");
const BhajanSubmission = require("../models/BhajanSubmission");
const { timeSince, formatDateHuman } = require("../services/helpers");

exports.showSingers = async (req, res) => {
  try {
    const singers = await Singer.findAll({ order: [['name', 'ASC']], raw: true });

    // Fetch submission stats grouped by singer_name
    const stats = await BhajanSubmission.findAll({
      attributes: [
        'singer_name',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_sung'],
        [Sequelize.fn('MAX', Sequelize.col('session_date')), 'last_sung']
      ],
      group: ['singer_name'],
      raw: true
    });

    const statsMap = new Map();
    stats.forEach(st => {
      if (st.singer_name) {
        statsMap.set(st.singer_name.trim().toLowerCase(), {
          total_sung: parseInt(st.total_sung, 10) || 0,
          last_sung: st.last_sung
        });
      }
    });

    // Also include any singers from submissions that might not yet be in singer_dictionary
    const existingNames = new Set(singers.map(s => s.name.trim().toLowerCase()));
    const unrecordedSingers = [];

    stats.forEach(st => {
      const lower = (st.singer_name || '').trim().toLowerCase();
      if (lower && !existingNames.has(lower)) {
        unrecordedSingers.push({
          id: null,
          name: st.singer_name.trim(),
          gender: null,
          pin: null,
          is_unrecorded: true,
          total_sung: parseInt(st.total_sung, 10) || 0,
          last_sung: st.last_sung
        });
      }
    });

    const allSingers = [
      ...singers.map(s => {
        const lower = (s.name || '').trim().toLowerCase();
        const st = statsMap.get(lower) || { total_sung: 0, last_sung: null };
        return {
          ...s,
          total_sung: st.total_sung,
          last_sung: st.last_sung,
          lastSungHuman: st.last_sung ? timeSince(st.last_sung) : 'Never',
          formattedDate: st.last_sung ? formatDateHuman(st.last_sung) : 'No sessions'
        };
      }),
      ...unrecordedSingers.map(s => ({
        ...s,
        lastSungHuman: s.last_sung ? timeSince(s.last_sung) : 'Never',
        formattedDate: s.last_sung ? formatDateHuman(s.last_sung) : 'No sessions'
      }))
    ];

    allSingers.sort((a, b) => a.name.localeCompare(b.name));

    const totalSingers = allSingers.length;
    const maleCount = allSingers.filter(s => (s.gender || '').toLowerCase() === 'male').length;
    const femaleCount = allSingers.filter(s => (s.gender || '').toLowerCase() === 'female').length;
    const pinProtectedCount = allSingers.filter(s => s.pin).length;
    const activeSingersCount = allSingers.filter(s => s.total_sung > 0).length;

    res.render('singers', {
      singers: allSingers,
      metrics: {
        total: totalSingers,
        male: maleCount,
        female: femaleCount,
        pinProtected: pinProtectedCount,
        active: activeSingersCount
      },
      pageTitle: 'Singers Directory',
      isAdminPage: true,
      pageCSS: 'admin.css',
      page: 'singers',
      pinResetSuccess: req.query.pin_reset === 'success'
    });
  } catch (error) {
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
};

exports.showSingerDictionary = (req, res) => {
  res.redirect(301, '/admin/singers');
};

exports.addSinger = async (req, res) => {
  try {
    const { name, gender } = req.body;
    if (name && name.trim()) {
      const [singer] = await Singer.findOrCreate({
        where: { name: name.trim() },
        defaults: { gender: gender || null }
      });
      if (!singer.gender && gender) await singer.update({ gender });
    }
    res.redirect('/admin/singers');
  } catch (error) {
    res.status(500).send(`<h1>Error adding singer</h1><p>${error.message}</p><a href="/admin/singers">Back</a>`);
  }
};

exports.editSinger = async (req, res) => {
  try {
    const { name, gender } = req.body;
    if (name && name.trim()) {
      await Singer.update({ name: name.trim(), gender: gender || null }, { where: { id: req.params.id } });
    }
    res.redirect('/admin/singers');
  } catch (error) {
    res.status(500).send(`<h1>Error editing singer</h1><p>${error.message}</p><a href="/admin/singers">Back</a>`);
  }
};

exports.deleteSinger = async (req, res) => {
  try {
    await Singer.destroy({ where: { id: req.params.id } });
    res.redirect('/admin/singers');
  } catch (error) {
    res.status(500).send(error.message);
  }
};

exports.resetSingerPin = async (req, res) => {
  try {
    const { id } = req.params;
    const singer = await Singer.findByPk(id);
    if (!singer) {
      return res.status(404).send("Singer not found");
    }
    await singer.update({ pin: null });
    res.redirect("/admin/singers?pin_reset=success");
  } catch (error) {
    res.status(500).send(`<h1>Error resetting PIN</h1><p>${error.message}</p><a href="/admin/singers">Back</a>`);
  }
};
