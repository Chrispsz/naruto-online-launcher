/**
 * __mocks__/electron-log.js — Manual mock via Jest __mocks__ resolution
 *
 * The previous approach (jest.mock in setupFiles) broke on Node 24 —
 * jest.mock hoisting in setupFiles doesn't intercept requires properly.
 * __mocks__/ is resolved by Jest's module resolution system directly,
 * which works reliably across Node versions.
 */

'use strict';

const fn = jest.fn();

module.exports = Object.assign(fn, {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  silly: jest.fn(),
  verbose: jest.fn(),
  transports: {
    file: { level: 'info', fileName: 'main.log', format: null },
    console: { level: 'debug', format: null }
  },
  level: 'info',
  log: jest.fn()
});