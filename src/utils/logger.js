
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
const logger = {
  info: (message, data) => {
    const log = `[\${new Date().toISOString()}] INFO: ${message} ${JSON.stringify(data || {})}`;
    console.log(log);
    fs.appendFileSync(logFile, log + '\n');
  },

  error: (message, data) => {
    const log = `[\${new Date().toISOString()}] ERROR: ${message} ${JSON.stringify(data || {})}`;
    console.error(log);
    fs.appendFileSync(logFile, log + '\n');
  },

  warn: (message, data) => {
    const log = `[\${new Date().toISOString()}] WARN: ${message} ${JSON.stringify(data || {})}`;
    console.warn(log);
    fs.appendFileSync(logFile, log + '\n');
  }
};

module.exports = logger;
