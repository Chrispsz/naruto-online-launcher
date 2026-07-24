/**
 * Tests for src/main.js — main process bootstrap orchestrator
 *
 * main.js has heavy top-level side effects (env migration, config load,
 * flag application, app event handler registration). We mock every
 * dependency and assert side effects rather than calling internal helpers.
 *
 * Strategy:
 *   - jest.mock every dependency.
 *   - require('../main') ONCE at file top → fires top-level side effects
 *     using the captured mock instances.
 *   - Extract app event callbacks (ready, before-quit, etc.) ONCE before
 *     any test runs — these are function references preserved across tests.
 *   - No global beforeEach clearAllMocks (would wipe load-time call history).
 *     Per-test, use mockClear() on specific mocks before invoking callbacks.
 *   - For tests that need a fresh load with different env/mock state (MESA
 *     migration, flashPath=null ready path), use jest.isolateModules and
 *     verify GLOBAL state (env vars, fresh require()) instead of the outer
 *     mock instance — isolateModules creates fresh mock instances for
 *     __mocks__/electron.js.
 *
 * Coverage:
 *   - Module exports (isQuitting, launchGameForProfile)
 *   - MESA env migration IIFE (top-level)
 *   - flags.applyAll called at boot with config-derived options
 *   - app.requestSingleInstanceLock called at top level
 *   - app.on registrations (ready, second-instance, window-all-closed, etc.)
 *   - process.on registrations (SIGTERM, SIGINT, uncaughtException, unhandledRejection)
 *   - i18n.setLanguage called with config.language
 *   - app.ready callback: profileStore.load + eventTimers.startWithProfiles
 *   - app.ready callback with flashPath=null → dialog error + app.exit(1)
 *   - launchGameForProfile delegates to profileManager.launch
 */

'use strict';

// ── Mock all of main.js's dependencies ────────────────────────────────────
// Each factory is self-contained (no out-of-scope vars).

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../config/settings', () => ({
  loadConfig: jest.fn(() => ({
    language: 'pt',
    hardwareProfile: 'modern',
    forceLowSpec: false,
    optimizationPreset: 'balanced',
    firstBoot: false,
    mutedEvents: false,
    advancedMode: false
  })),
  saveConfig: jest.fn()
}));

jest.mock('../flash/plugin', () => ({
  findFlashPlugin: jest.fn(() => '/fake/flash/libpepflashplayer.so'),
  getFlashVersion: jest.fn(() => '34.0.0.1')
}));

jest.mock('../main/flags', () => ({
  applyAll: jest.fn(),
  getAppliedSnapshot: jest.fn(() => ({ applied: true })),
  SYSTEM_RAM_GB: 16,
  IS_LOW_SPEC: false,
  IS_WAYLAND: false
}));

jest.mock('../app/GpuDetector', () => ({
  getEnvVars: jest.fn(() => ({})),
  detect: jest.fn(() => ({
    vendor: 'nvidia',
    description: 'NVIDIA RTX 3080',
    isPrime: false,
    hasNvidia: true,
    hasAmd: false,
    hasIntel: false,
    allGpus: []
  }))
}));

jest.mock('../memory/guard', () => ({
  setForceLowSpec: jest.fn(),
  isLowSpecMode: jest.fn(() => false),
  isMinimal: jest.fn(() => false),
  IS_LOW_SPEC: false,
  IS_MINIMAL: false,
  SYSTEM_RAM_GB: 16,
  getThreshold: jest.fn(() => 700)
}));

jest.mock('../utils/EventTimers', () => ({
  startWithProfiles: jest.fn(),
  setMuted: jest.fn(),
  isMuted: jest.fn(() => false),
  stop: jest.fn(),
  getUpcoming: jest.fn(() => [])
}));

jest.mock('../profiles/store', () => ({
  load: jest.fn(),
  getAll: jest.fn(() => []),
  MAX_PROFILES: 12
}));

jest.mock('../profiles/manager', () => ({
  launch: jest.fn(),
  close: jest.fn()
}));

jest.mock('../profiles/partition', () => ({
  setLowSpecMode: jest.fn()
}));

jest.mock('../profiles/vault', () => ({
  getCredentials: jest.fn(),
  setCredentials: jest.fn(),
  removeCredentials: jest.fn(),
  hasCredentials: jest.fn()
}));

jest.mock('../config/i18n', () => ({
  setLanguage: jest.fn(),
  getLanguage: jest.fn(() => 'pt')
}));

jest.mock('../app/CpuOptimizer', () => ({
  getStats: jest.fn(() => ({
    topology: {
      totalCores: 8,
      pCores: [0, 1, 2, 3],
      eCores: [],
      isHybrid: false
    },
    appliedPids: [],
    platform: 'linux'
  }))
}));

jest.mock('../config/optimization', () => ({
  listForUI: jest.fn(() => []),
  getDefaultPreset: jest.fn(() => 'balanced')
}));

jest.mock('../flash/mms', () => ({
  createMmsCfg: jest.fn(),
  restoreMmsCfg: jest.fn()
}));

jest.mock('../ui/controller', () => ({
  createManagerWindow: jest.fn(),
  getManagerWindow: jest.fn(() => null),
  showManager: jest.fn(),
  hideManager: jest.fn(),
  registerIpcHandlers: jest.fn()
}));

const electron = require('electron');
const flags = require('../main/flags');
const i18n = require('../config/i18n');
const profileStore = require('../profiles/store');
const profileManager = require('../profiles/manager');
const eventTimers = require('../utils/EventTimers');
const controller = require('../ui/controller');

// Load main.js ONCE — top-level side effects fire against the captured mocks.
const main = require('../main');

// Extract app event callbacks BEFORE any test runs (so per-test mockClear()
// can't lose them). These are function references, preserved across tests.
function extractAppCallback(event) {
  const call = electron.app.on.mock.calls.find(c => c[0] === event);
  return call ? call[1] : undefined;
}
const readyCallback = extractAppCallback('ready');
const beforeQuitCallback = extractAppCallback('before-quit');

describe('src/main.js', () => {
  describe('exports', () => {
    test('exports isQuitting as function', () => {
      expect(typeof main.isQuitting).toBe('function');
    });

    test('exports launchGameForProfile as function', () => {
      expect(typeof main.launchGameForProfile).toBe('function');
    });

    test('isQuitting() returns false at startup (no quit signal yet)', () => {
      expect(main.isQuitting()).toBe(false);
    });

    test('before-quit callback flips isQuitting() to true', () => {
      // Restore after the assertion so subsequent tests see the default state.
      expect(typeof beforeQuitCallback).toBe('function');
      beforeQuitCallback();
      expect(main.isQuitting()).toBe(true);
      // Reset for downstream tests by re-loading the module state is not
      // possible (module is cached) — instead, accept that isQuitting is
      // now true for the rest of this test file. The export contract is
      // verified; downstream tests do not depend on isQuitting=false.
    });
  });

  describe('MESA env migration IIFE (top-level)', () => {
    afterEach(() => {
      delete process.env.MESA_GLSL_CACHE_DISABLE;
      delete process.env.MESA_SHADER_CACHE_DISABLE;
    });

    test('migrates MESA_GLSL_CACHE_DISABLE → MESA_SHADER_CACHE_DISABLE when only the old name is set', () => {
      process.env.MESA_GLSL_CACHE_DISABLE = '1';
      delete process.env.MESA_SHADER_CACHE_DISABLE;
      // Use isolateModules to load a fresh main.js — env vars are global
      // state, so we can assert them outside the isolateModules block.
      jest.isolateModules(() => {
        require('../main');
      });
      expect(process.env.MESA_SHADER_CACHE_DISABLE).toBe('1');
      expect(process.env.MESA_GLSL_CACHE_DISABLE).toBeUndefined();
    });

    test('always deletes MESA_GLSL_CACHE_DISABLE (even when migration is skipped)', () => {
      // Both set → migration skipped (new name preserved as-is)
      process.env.MESA_GLSL_CACHE_DISABLE = '1';
      process.env.MESA_SHADER_CACHE_DISABLE = '0';
      jest.isolateModules(() => {
        require('../main');
      });
      expect(process.env.MESA_GLSL_CACHE_DISABLE).toBeUndefined();
      expect(process.env.MESA_SHADER_CACHE_DISABLE).toBe('0');
    });
  });

  describe('boot phase 1 (before app.ready)', () => {
    test('flags.applyAll is called with config-derived options', () => {
      // Side effect from the initial top-level load. Use toHaveBeenCalledWith
      // (not count) so multiple isolateModules re-loads in other describe
      // blocks don't affect this assertion.
      expect(flags.applyAll).toHaveBeenCalledWith({
        flashPath: '/fake/flash/libpepflashplayer.so',
        flashVersion: '34.0.0.1',
        hardwareProfile: 'modern',
        forceLowSpec: false,
        optimizationPreset: 'balanced'
      });
    });

    test('app.requestSingleInstanceLock is called at top level', () => {
      // Side effect from the initial top-level load.
      expect(electron.app.requestSingleInstanceLock).toHaveBeenCalled();
    });

    test('i18n.setLanguage is called with config.language at top level', () => {
      expect(i18n.setLanguage).toHaveBeenCalledWith('pt');
    });
  });

  describe('app event registrations', () => {
    test('app.on is called for all key lifecycle events', () => {
      const events = electron.app.on.mock.calls.map(c => c[0]);
      ['ready', 'second-instance', 'before-quit', 'window-all-closed', 'will-quit'].forEach(
        function (ev) {
          expect(events).toContain(ev);
        }
      );
    });
  });

  describe('process event registrations', () => {
    test('process.on is called for SIGTERM, SIGINT, uncaughtException, unhandledRejection', () => {
      // main.js registers listeners on process for these signals. Verify by
      // checking the actual listener count (process.on may or may not be
      // a jest.fn() depending on test isolation).
      ['SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection'].forEach(sig => {
        expect(process.listenerCount(sig)).toBeGreaterThan(0);
      });
    });
  });

  describe('app.ready callback', () => {
    test('loads profileStore and starts eventTimers with all profiles (firstBoot=false)', () => {
      expect(typeof readyCallback).toBe('function');
      // Clear load-time state so we can assert exactly 1 call from the callback.
      profileStore.load.mockClear();
      eventTimers.startWithProfiles.mockClear();
      controller.createManagerWindow.mockClear();

      readyCallback();

      expect(profileStore.load).toHaveBeenCalledTimes(1);
      expect(eventTimers.startWithProfiles).toHaveBeenCalledWith(profileStore.getAll());
      // Manager window created at end of _initManagerAndLaunch.
      expect(controller.createManagerWindow).toHaveBeenCalled();
    });

    test('when flashPath is null, shows error dialog and exits with code 1 (does NOT load store)', () => {
      // flashPath is determined at top-level load time, so we must load a
      // fresh main.js with findFlashPlugin returning null. Inside
      // isolateModules we use the fresh mock instances.
      jest.isolateModules(() => {
        const freshFlashPlugin = require('../flash/plugin');
        freshFlashPlugin.findFlashPlugin.mockReturnValue(null);
        const freshElectron = require('electron');
        const freshProfileStore = require('../profiles/store');

        // Clear load-time state from prior tests so we can assert exactly
        // that THIS ready invocation did not call profileStore.load.
        freshProfileStore.load.mockClear();
        freshElectron.dialog.showMessageBoxSync.mockClear();
        freshElectron.app.exit.mockClear();

        require('../main'); // top-level side effects fire with flashPath=null

        // Extract the LAST ready callback (this fresh main.js load's closure
        // captured flashPath=null). Earlier loads registered their own ready
        // callbacks on the same shared electron.app.on mock.
        const readyCalls = freshElectron.app.on.mock.calls.filter(c => c[0] === 'ready');
        const ready = readyCalls[readyCalls.length - 1][1];
        ready();

        expect(freshElectron.dialog.showMessageBoxSync).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'error' })
        );
        expect(freshElectron.app.exit).toHaveBeenCalledWith(1);
        expect(freshProfileStore.load).not.toHaveBeenCalled();
      });
    });
  });

  describe('launchGameForProfile', () => {
    test('delegates to profileManager.launch with the profileId', () => {
      profileManager.launch.mockClear();
      main.launchGameForProfile('p_001');
      expect(profileManager.launch).toHaveBeenCalledTimes(1);
      // First positional arg must be the profileId.
      expect(profileManager.launch.mock.calls[0][0]).toBe('p_001');
    });
  });
});
