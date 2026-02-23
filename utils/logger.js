const util = require("util");
const fs = require("fs");
const path = require("path");
const winston = require("winston");

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
const LOG_DIR = "logs";
const LOG_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const LOG_MAX_FILES = 20;

function getVnTimestamp() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: VN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()) + "+07:00";
}

function normalizeArgs(args) {
  return util.format(...args);
}

function getVnFileStamp() {
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: VN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

  return text.replace(" ", "_").replace(/:/g, "-");
}

const logFilePath = path.join(LOG_DIR, `app-${getVnFileStamp()}+07-00.txt`);
fs.mkdirSync(LOG_DIR, { recursive: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.printf(({ level, message }) => {
      return `${getVnTimestamp()} [${level.toUpperCase()}] ${message}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: logFilePath,
      maxsize: LOG_MAX_SIZE_BYTES,
      maxFiles: LOG_MAX_FILES,
      tailable: true,
    }),
  ],
});

function patchConsole() {
  console.log = (...args) => logger.info(normalizeArgs(args));
  console.info = (...args) => logger.info(normalizeArgs(args));
  console.warn = (...args) => logger.warn(normalizeArgs(args));
  console.error = (...args) => logger.error(normalizeArgs(args));
  console.debug = (...args) => logger.debug(normalizeArgs(args));
}

patchConsole();

module.exports = logger;
