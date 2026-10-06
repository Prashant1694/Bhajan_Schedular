const pino = require("pino");

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "pin",
      "password",
      "new_password",
      "current_pin",
      "new_pin",
      "token",
      "auth_token",
      "password_hash",
      "google_sub",
      "credential",
      "req.headers.cookie",
      "req.headers.authorization",
      "*.pin",
      "*.password",
      "*.password_hash",
      "*.auth_token",
      "*.google_sub"
    ],
    censor: "[REDACTED]"
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname"
        }
      }
});

module.exports = logger;
