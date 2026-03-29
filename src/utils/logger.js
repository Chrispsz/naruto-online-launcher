/**
 * Logger Estruturado v1.0.0
 * Níveis: debug, info, warn, error
 */

'use strict';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

const ICONS = {
  debug: '\u{1F50D}',
  info: '\u{2139}\u{FE0F}',
  warn: '\u{26A0}\u{FE0F}',
  error: '\u{274C}'
};

function formatTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function log(level, msg, data) {
  if (LOG_LEVELS[level] < currentLevel) return;
  
  const timestamp = formatTimestamp();
  const icon = ICONS[level];
  const output = `[${timestamp}] ${icon} [Launcher] ${msg}`;
  
  const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  
  if (data !== undefined) {
    console[consoleMethod](output, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console[consoleMethod](output);
  }
}

const logger = {
  debug: (msg, data) => log('debug', msg, data),
  info: (msg, data) => log('info', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  error: (msg, data) => log('error', msg, data)
};

module.exports = logger;
