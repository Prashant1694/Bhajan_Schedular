const { getLatestBulletins, CATEGORY_INFO } = require("./bulletinController");

exports.home = async (req, res) => {

  let bulletins = [];
  try {
    bulletins = await getLatestBulletins(5);
  } catch (err) {
    // Non-critical — home page still works without bulletins
    console.error("Failed to load bulletins for home page:", err.message);
  }

  res.render('dashboard', {
    showLoader: true,
    bulletins,
    CATEGORY_INFO
  });
};