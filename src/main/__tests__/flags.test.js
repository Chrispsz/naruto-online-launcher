/**
 * Tests for src/main/flags.js — Electron command-line flags
 *
 * Verifies: exports, applyAll(), flag list, flash path handling,
 * idempotency, heap computation, hardware profile, IS_LOW_SPEC/IS_RAMEN.
 *
 * NOTE: flags.js has module-level _applied flag (idempotent). Once applyAll()
 * runs, it won't re-execute. We test the post-apply state by capturing
 * appendSwitch calls from the initial registration.
 */

'use strict';

const electron = require('electron');

describe('flags.js', () => {
  // Capture all appendSwitch calls from the initial applyAll() invocation.
  // Since the module is required once and _applied becomes true, we need to
  // record the calls that happened before our test suite runs.
  // We'll call applyAll() once in beforeAll and capture the results.

  let switchCalls = [];

  beforeAll(() => {
    // Clear any previous calls and invoke applyAll
    electron.app.commandLine.appendSwitch.mockClear();
    const flags = require('../flags');
    flags.applyAll();
    // Capture all the calls
    switchCalls = electron.app.commandLine.appendSwitch.mock.calls.slice();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    test('exports applyAll as function', () => {
      const flags = require('../flags');
      expect(typeof flags.applyAll).toBe('function');
    });

    test('exports IS_LOW_SPEC as boolean', () => {
      const flags = require('../flags');
      expect(typeof flags.IS_LOW_SPEC).toBe('boolean');
    });

    test('exports IS_RAMEN as boolean', () => {
      const flags = require('../flags');
      expect(typeof flags.IS_RAMEN).toBe('boolean');
    });

    test('exports SYSTEM_RAM_GB as number', () => {
      const flags = require('../flags');
      expect(typeof flags.SYSTEM_RAM_GB).toBe('number');
      expect(flags.SYSTEM_RAM_GB).toBeGreaterThan(0);
    });

    test('exports getAppliedSnapshot as function', () => {
      const flags = require('../flags');
      expect(typeof flags.getAppliedSnapshot).toBe('function');
    });

    test('exports IS_WAYLAND as boolean', () => {
      const flags = require('../flags');
      expect(typeof flags.IS_WAYLAND).toBe('boolean');
    });
  });

  describe('applyAll', () => {
    test('calls app.commandLine.appendSwitch multiple times', () => {
      expect(switchCalls.length).toBeGreaterThan(10);
    });

    test('is idempotent — second call does not add more switches', () => {
      const flags = require('../flags');
      flags.applyAll();
      // Since _applied=true, no new calls should be made
      expect(electron.app.commandLine.appendSwitch).not.toHaveBeenCalled();
    });

    test('applies no-sandbox flag', () => {
      const hasFlag = switchCalls.some(function (c) {
        return c[0] === 'no-sandbox';
      });
      expect(hasFlag).toBe(true);
    });

    test('applies disable-gpu-sandbox flag', () => {
      const hasFlag = switchCalls.some(function (c) {
        return c[0] === 'disable-gpu-sandbox';
      });
      expect(hasFlag).toBe(true);
    });

    test('applies always-authorize-plugins flag', () => {
      const hasFlag = switchCalls.some(function (c) {
        return c[0] === 'always-authorize-plugins';
      });
      expect(hasFlag).toBe(true);
    });

    test('applies allow-outdated-plugins flag', () => {
      const hasFlag = switchCalls.some(function (c) {
        return c[0] === 'allow-outdated-plugins';
      });
      expect(hasFlag).toBe(true);
    });

    test('applies ignore-gpu-blocklist flag', () => {
      const hasFlag = switchCalls.some(function (c) {
        return c[0] === 'ignore-gpu-blocklist';
      });
      expect(hasFlag).toBe(true);
    });

    test('applies js-flags with --max-old-space-size', () => {
      const jsFlagsCall = switchCalls.find(function (c) {
        return c[0] === 'js-flags';
      });
      expect(jsFlagsCall).toBeDefined();
      expect(jsFlagsCall[1]).toContain('--max-old-space-size=');
    });

    test('applies disable-features flag', () => {
      const flagCall = switchCalls.find(function (c) {
        return c[0] === 'disable-features';
      });
      expect(flagCall).toBeDefined();
      expect(flagCall[1]).toContain('IsolateOrigins');
      expect(flagCall[1]).toContain('site-per-process');
    });

    test('applies enable-features flag', () => {
      const flagCall = switchCalls.find(function (c) {
        return c[0] === 'enable-features';
      });
      expect(flagCall).toBeDefined();
      expect(flagCall[1]).toContain('VizDisplayCompositor');
    });

    test('applies disk-cache-size flag', () => {
      const flagCall = switchCalls.find(function (c) {
        return c[0] === 'disk-cache-size';
      });
      expect(flagCall).toBeDefined();
      // Should be either '134217728' (low spec) or '268435456' (normal)
      expect(['134217728', '268435456']).toContain(flagCall[1]);
    });

    test('applies disable-setuid-sandbox flag', () => {
      const hasFlag = switchCalls.some(function (c) {
        return c[0] === 'disable-setuid-sandbox';
      });
      expect(hasFlag).toBe(true);
    });

    test('applies disable-renderer-backgrounding flag', () => {
      const hasFlag = switchCalls.some(function (c) {
        return c[0] === 'disable-renderer-backgrounding';
      });
      expect(hasFlag).toBe(true);
    });

    test('applies disable-background-timer-throttling flag', () => {
      const hasFlag = switchCalls.some(function (c) {
        return c[0] === 'disable-background-timer-throttling';
      });
      expect(hasFlag).toBe(true);
    });
  });

  describe('SYSTEM_RAM_GB', () => {
    test('is a positive number rounded to 1 decimal', () => {
      const flags = require('../flags');
      expect(flags.SYSTEM_RAM_GB).toBeGreaterThan(0);
      // Check it's rounded to 1 decimal (e.g. 15.9, not 15.9372)
      const str = String(flags.SYSTEM_RAM_GB);
      const parts = str.split('.');
      if (parts[1]) {
        expect(parts[1].length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('IS_LOW_SPEC', () => {
    test('is determined by total RAM < 4GB', () => {
      const flags = require('../flags');
      if (flags.SYSTEM_RAM_GB < 4) {
        expect(flags.IS_LOW_SPEC).toBe(true);
      } else {
        expect(flags.IS_LOW_SPEC).toBe(false);
      }
    });
  });

  describe('IS_RAMEN', () => {
    test('is determined by total RAM < 2GB', () => {
      const flags = require('../flags');
      if (flags.SYSTEM_RAM_GB < 2) {
        expect(flags.IS_RAMEN).toBe(true);
      } else {
        expect(flags.IS_RAMEN).toBe(false);
      }
    });

    test('IS_RAMEN implies IS_LOW_SPEC', () => {
      const flags = require('../flags');
      if (flags.IS_RAMEN) {
        expect(flags.IS_LOW_SPEC).toBe(true);
      }
    });
  });

  describe('getAppliedSnapshot', () => {
    test('returns object with expected shape', () => {
      const flags = require('../flags');
      var snap = flags.getAppliedSnapshot();
      expect(typeof snap.applied).toBe('boolean');
      expect(typeof snap.heapMB).toBe('number');
      expect(Array.isArray(snap.disabled)).toBe(true);
      expect(Array.isArray(snap.enabled)).toBe(true);
      expect(Array.isArray(snap.jsFlags)).toBe(true);
    });

    test('applied is true after applyAll()', () => {
      const flags = require('../flags');
      var snap = flags.getAppliedSnapshot();
      expect(snap.applied).toBe(true);
    });

    test('contains expected disabled features', () => {
      const flags = require('../flags');
      var snap = flags.getAppliedSnapshot();
      expect(snap.disabled).toContain('IsolateOrigins');
      expect(snap.disabled).toContain('site-per-process');
    });

    test('contains expected enabled features', () => {
      const flags = require('../flags');
      var snap = flags.getAppliedSnapshot();
      expect(snap.enabled).toContain('VizDisplayCompositor');
    });

    test('jsFlags contains --max-old-space-size', () => {
      const flags = require('../flags');
      var snap = flags.getAppliedSnapshot();
      var joined = snap.jsFlags.join(' ');
      expect(joined).toContain('--max-old-space-size=');
    });
  });

  describe('branch coverage via isolateModules', () => {
    // _computeHeapMB, hardwareProfile='cpu', and flashPath+flashVersion
    // are unreachable in the default require (idempotent + system RAM fixed).
    // Use isolateModules to test each branch with controlled os.totalmem() and opts.

    test('_computeHeapMB returns 768 when RAM is 4-8 GB', () => {
      jest.isolateModules(function () {
        jest.mock('os', function () {
          return {
            totalmem: function () {
              return 6 * 1024 * 1024 * 1024;
            },
            cpus: function () {
              return [{}];
            }
          };
        });
        var innerElectron = require('electron');
        var flags = require('../flags');
        flags.applyAll({ flashPath: '/fake/flash.so' });
        var jsFlags = innerElectron.app.commandLine.appendSwitch.mock.calls.find(function (c) {
          return c[0] === 'js-flags';
        });
        expect(jsFlags[1]).toContain('--max-old-space-size=768');
      });
    });

    test('hardwareProfile=cpu applies disable-gpu and swiftshader on linux', () => {
      jest.isolateModules(function () {
        jest.mock('os', function () {
          return {
            totalmem: function () {
              return 16 * 1024 * 1024 * 1024;
            },
            cpus: function () {
              return [{}, {}, {}, {}, {}, {}, {}, {}];
            }
          };
        });
        var innerElectron = require('electron');
        var flags = require('../flags');
        flags.applyAll({ hardwareProfile: 'cpu' });
        var calls = innerElectron.app.commandLine.appendSwitch.mock.calls;
        var hasDisableGpu = calls.some(function (c) {
          return c[0] === 'disable-gpu';
        });
        expect(hasDisableGpu).toBe(true);
        var rasterCall = calls.find(function (c) {
          return c[0] === 'num-raster-threads';
        });
        expect(rasterCall).toBeDefined();
        expect(rasterCall[1]).toBe('4'); // min(8 cores, 4) = 4
      });
    });

    test('flashPath + flashVersion applies both ppapi switches', () => {
      jest.isolateModules(function () {
        jest.mock('os', function () {
          return {
            totalmem: function () {
              return 16 * 1024 * 1024 * 1024;
            },
            cpus: function () {
              return [{}];
            }
          };
        });
        var innerElectron = require('electron');
        var flags = require('../flags');
        flags.applyAll({ flashPath: '/tmp/libpepflashplayer.so', flashVersion: '32.0.0.453' });
        var calls = innerElectron.app.commandLine.appendSwitch.mock.calls;
        var hasPath = calls.some(function (c) {
          return c[0] === 'ppapi-flash-path' && c[1] === '/tmp/libpepflashplayer.so';
        });
        expect(hasPath).toBe(true);
        var hasVer = calls.some(function (c) {
          return c[0] === 'ppapi-flash-version' && c[1] === '32.0.0.453';
        });
        expect(hasVer).toBe(true);
      });
    });
  });
});
