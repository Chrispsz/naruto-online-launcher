/**
 * tests/setup.js — Jest global setup
 *
 * NOTE (v5.9.30): electron and electron-log mocks moved to __mocks__/ directory.
 * On Node 24, jest.mock() in setupFiles doesn't intercept requires properly
 * (likely a Module._resolveFilename caching change). __mocks__/ is resolved by
 * Jest's module resolution system directly, which works reliably.
 *
 * This file is kept for any future global setup that doesn't involve mocking
 * modules (e.g., environment variables, global timers).
 */

'use strict';
