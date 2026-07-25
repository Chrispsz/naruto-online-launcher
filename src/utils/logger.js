/**
 * Logger - electron-log Integration
 * Persistent file logging with structured output
 */

'use strict';

const log = require('electron-log');

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5MB rotation

// Configure electron-log
log.transports.file.level = 'info';
log.transports.console.level = (process.env.LOG_LEVEL || 'info').toLowerCase();
log.transports.file.maxSize = MAX_LOG_SIZE_BYTES;
log.transports.file.maxFiles = 3;

// Custom format with timestamp and emoji icons
const ICONS = {
  debug: '\u{1F50D}',
  info: '\u{2139}\u{FE0F}',
  warn: '\u{26A0}\u{FE0F}',
  error: '\u{274C}'
};

/**
 * Format log message with icon and consistent prefix
 * @param {string} level - Log level
 * @param {string} msg - Log message
 * @returns {string} Formatted message
 */
function formatMessage(level, msg) {
  const icon = ICONS[level] || '';
  return icon + ' [Launcher] ' + msg;
}

// Wrap electron-log with branded formatting
const logger = {
  /**
   * Log debug message
   * @param {string} msg - Message
   * @param {*} [data] - Optional data
   */
  debug: function (msg, data) {
    if (data !== undefined) {
      log.debug(formatMessage('debug', msg), data);
    } else {
      log.debug(formatMessage('debug', msg));
    }
  },

  /**
   * Log info message
   * @param {string} msg - Message
   * @param {*} [data] - Optional data
   */
  info: function (msg, data) {
    if (data !== undefined) {
      log.info(formatMessage('info', msg), data);
    } else {
      log.info(formatMessage('info', msg));
    }
  },

  /**
   * Log warning message
   * @param {string} msg - Message
   * @param {*} [data] - Optional data
   */
  warn: function (msg, data) {
    if (data !== undefined) {
      log.warn(formatMessage('warn', msg), data);
    } else {
      log.warn(formatMessage('warn', msg));
    }
  },

  /**
   * Log error message
   * @param {string} msg - Message
   * @param {*} [data] - Optional data
   */
  error: function (msg, data) {
    if (data !== undefined) {
      log.error(formatMessage('error', msg), data);
    } else {
      log.error(formatMessage('error', msg));
    }
  }
};

module.exports = logger;
