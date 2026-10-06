const { Sequelize } = require("sequelize");
const path = require("path");
const os = require("os");

const storagePath =
  process.env.DB_PATH ||
  (process.env.NODE_ENV === "test"
    ? path.join(os.tmpdir(), `bhajan-test-${process.pid}.db`)
    : path.join(__dirname, "..", "bhajans.db"));

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: storagePath,
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
    afterCreate: (conn, done) => {
      conn.run("PRAGMA journal_mode = WAL;", (err1) => {
        if (err1) return done(err1);
        conn.run("PRAGMA busy_timeout = 5000;", (err2) => {
          if (err2) return done(err2);
          conn.run("PRAGMA foreign_keys = ON;", (err3) => {
            if (err3) return done(err3);
            conn.run("PRAGMA synchronous = NORMAL;", done);
          });
        });
      });
    }
  },
  retry: {
    max: 3
  }
});

module.exports = sequelize;
