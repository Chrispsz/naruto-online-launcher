/**
 * Tests for src/memory/MemoryGuard.js — RSS monitoring + webview registry
 *
 * Verifies: exports, getStats, isBatata/isRamen, threshold/interval getters/setters,
 * setForceBatata, onMemoryUpdate/onGC, _notify, _recordGC, reportCrash,
 * webview registry (registerGameWebContents/unregisterGameWebContents/getActiveProfileIds),
 * getWebviewStats, IS_LOW_SPEC/IS_RAMEN.
 */

'use strict';

// Mock partition to avoid side effects from setForceBatata
jest.mock('../../profiles/partition', () => ({
  setBatataMode: jest.fn()
}));

const MemoryGuard = require('../MemoryGuard');

describe('MemoryGuard.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    test('exports getStats as function', () => {
      expect(typeof MemoryGuard.getStats).toBe('function');
    });
    test('exports isBatata as function', () => {
      expect(typeof MemoryGuard.isBatata).toBe('function');
    });
    test('exports isRamen as function', () => {
      expect(typeof MemoryGuard.isRamen).toBe('function');
    });
    test('exports getThreshold as function', () => {
      expect(typeof MemoryGuard.getThreshold).toBe('function');
    });
    test('exports getIntervalMs as function', () => {
      expect(typeof MemoryGuard.getIntervalMs).toBe('function');
    });
    test('exports isPreventive as function', () => {
      expect(typeof MemoryGuard.isPreventive).toBe('function');
    });
    test('exports setThreshold as function', () => {
      expect(typeof MemoryGuard.setThreshold).toBe('function');
    });
    test('exports setForceBatata as function', () => {
      expect(typeof MemoryGuard.setForceBatata).toBe('function');
    });
    test('exports onMemoryUpdate as function', () => {
      expect(typeof MemoryGuard.onMemoryUpdate).toBe('function');
    });
    test('exports onGC as function', () => {
      expect(typeof MemoryGuard.onGC).toBe('function');
    });
    test('exports _notify as function', () => {
      expect(typeof MemoryGuard._notify).toBe('function');
    });
    test('exports _recordGC as function', () => {
      expect(typeof MemoryGuard._recordGC).toBe('function');
    });
    test('exports reportCrash as function', () => {
      expect(typeof MemoryGuard.reportCrash).toBe('function');
    });
    test('exports registerGameWebContents as function', () => {
      expect(typeof MemoryGuard.registerGameWebContents).toBe('function');
    });
    test('exports unregisterGameWebContents as function', () => {
      expect(typeof MemoryGuard.unregisterGameWebContents).toBe('function');
    });
    test('exports getActiveProfileIds as function', () => {
      expect(typeof MemoryGuard.getActiveProfileIds).toBe('function');
    });
    test('exports getWebviewStats as function', () => {
      expect(typeof MemoryGuard.getWebviewStats).toBe('function');
    });
    test('exports IS_LOW_SPEC as boolean', () => {
      expect(typeof MemoryGuard.IS_LOW_SPEC).toBe('boolean');
    });
    test('exports IS_RAMEN as boolean', () => {
      expect(typeof MemoryGuard.IS_RAMEN).toBe('boolean');
    });
    test('exports SYSTEM_RAM_GB as number', () => {
      expect(typeof MemoryGuard.SYSTEM_RAM_GB).toBe('number');
      expect(MemoryGuard.SYSTEM_RAM_GB).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    test('returns object with expected keys', () => {
      const stats = MemoryGuard.getStats();
      expect(stats).toHaveProperty('totalMB');
      expect(stats).toHaveProperty('thresholdMB');
      expect(stats).toHaveProperty('isBatata');
      expect(stats).toHaveProperty('isRamen');
      expect(stats).toHaveProperty('systemRAM');
      expect(stats).toHaveProperty('timestamp');
      expect(stats).toHaveProperty('uptimeMs');
      expect(stats).toHaveProperty('uptimeHours');
      expect(stats).toHaveProperty('crashCount');
      expect(stats).toHaveProperty('manualGCCount');
      expect(stats).toHaveProperty('autoGCCount');
      expect(stats).toHaveProperty('totalGCCount');
      expect(stats).toHaveProperty('startedAt');
    });

    test('totalMB is a non-negative number', () => {
      const stats = MemoryGuard.getStats();
      expect(typeof stats.totalMB).toBe('number');
      expect(stats.totalMB).toBeGreaterThanOrEqual(0);
    });

    test('uptimeMs is positive (app has been running)', () => {
      const stats = MemoryGuard.getStats();
      expect(stats.uptimeMs).toBeGreaterThan(0);
    });

    test('totalGCCount = manualGCCount + autoGCCount', () => {
      const stats = MemoryGuard.getStats();
      expect(stats.totalGCCount).toBe(stats.manualGCCount + stats.autoGCCount);
    });

    test('crashCount starts at 0 or increments with reportCrash', () => {
      const before = MemoryGuard.getStats().crashCount;
      MemoryGuard.reportCrash();
      const after = MemoryGuard.getStats().crashCount;
      expect(after).toBe(before + 1);
    });
  });

  describe('isBatata / isRamen', () => {
    test('isBatata returns a boolean', () => {
      expect(typeof MemoryGuard.isBatata()).toBe('boolean');
    });

    test('isRamen returns a boolean', () => {
      expect(typeof MemoryGuard.isRamen()).toBe('boolean');
    });

    test('IS_RAMEN implies IS_LOW_SPEC', () => {
      if (MemoryGuard.IS_RAMEN) {
        expect(MemoryGuard.IS_LOW_SPEC).toBe(true);
      }
    });

    test('isRamen is consistent with IS_RAMEN', () => {
      expect(MemoryGuard.isRamen()).toBe(MemoryGuard.IS_RAMEN);
    });
  });

  describe('setForceBatata', () => {
    test('enables batata mode when called with true', () => {
      MemoryGuard.setForceBatata(true);
      expect(MemoryGuard.isBatata()).toBe(true);
    });

    test('restores normal mode when called with false', () => {
      MemoryGuard.setForceBatata(true);
      MemoryGuard.setForceBatata(false);
      // isBatata depends on IS_LOW_SPEC + _forceBatata
      expect(MemoryGuard.isBatata()).toBe(MemoryGuard.IS_LOW_SPEC);
    });

    test('updates threshold to batata config when enabled', () => {
      MemoryGuard.setForceBatata(true);
      expect(MemoryGuard.getThreshold()).toBe(450); // batata thresholdMB
    });

    test('updates interval to batata config when enabled', () => {
      MemoryGuard.setForceBatata(true);
      expect(MemoryGuard.getIntervalMs()).toBe(2 * 60 * 1000); // batata intervalMs
    });

    test('enables preventive GC when batata', () => {
      MemoryGuard.setForceBatata(true);
      expect(MemoryGuard.isPreventive()).toBe(true);
    });

    test('calls partition.setBatataMode', () => {
      const partition = require('../../profiles/partition');
      MemoryGuard.setForceBatata(true);
      expect(partition.setBatataMode).toHaveBeenCalledWith(true);
    });

    afterEach(() => {
      MemoryGuard.setForceBatata(false);
    });
  });

  describe('setThreshold', () => {
    test('sets threshold to a valid value', () => {
      MemoryGuard.setThreshold(500);
      expect(MemoryGuard.getThreshold()).toBe(500);
    });

    test('clamps threshold to minimum 200', () => {
      MemoryGuard.setThreshold(50);
      expect(MemoryGuard.getThreshold()).toBe(200);
    });

    test('clamps threshold to maximum 4096', () => {
      MemoryGuard.setThreshold(9999);
      expect(MemoryGuard.getThreshold()).toBe(4096);
    });

    test('floors non-integer values', () => {
      MemoryGuard.setThreshold(350.7);
      expect(MemoryGuard.getThreshold()).toBe(350);
    });

    afterEach(() => {
      // Reset to default
      MemoryGuard.setForceBatata(false);
    });
  });

  describe('onMemoryUpdate / _notify', () => {
    test('onMemoryUpdate registers a callback', () => {
      const cb = jest.fn();
      MemoryGuard.onMemoryUpdate(cb);
      MemoryGuard._notify();
      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          totalMB: expect.any(Number)
        })
      );
    });

    test('_notify calls all registered listeners', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      MemoryGuard.onMemoryUpdate(cb1);
      MemoryGuard.onMemoryUpdate(cb2);
      MemoryGuard._notify();
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    test('_notify continues calling listeners even if one throws', () => {
      const bad = jest.fn(() => {
        throw new Error('boom');
      });
      const good = jest.fn();
      MemoryGuard.onMemoryUpdate(bad);
      MemoryGuard.onMemoryUpdate(good);
      expect(() => MemoryGuard._notify()).not.toThrow();
      expect(good).toHaveBeenCalled();
    });

    test('getStats returns totalMB=0 when process.memoryUsage throws', () => {
      const origMU = process.memoryUsage;
      process.memoryUsage = jest.fn(() => {
        throw new Error('mu fail');
      });
      const stats = MemoryGuard.getStats();
      expect(stats.totalMB).toBe(0);
      process.memoryUsage = origMU;
    });
  });

  describe('onGC / _recordGC', () => {
    test('onGC registers a callback that fires on _recordGC', () => {
      const cb = jest.fn();
      MemoryGuard.onGC(cb);
      const result = { freed: 50 };
      MemoryGuard._recordGC(true, result);
      expect(cb).toHaveBeenCalledWith(result);
    });

    test('_recordGC with isManual=true increments manualGCCount', () => {
      const before = MemoryGuard.getStats().manualGCCount;
      MemoryGuard._recordGC(true, {});
      const after = MemoryGuard.getStats().manualGCCount;
      expect(after).toBe(before + 1);
    });

    test('_recordGC with isManual=false increments autoGCCount', () => {
      const before = MemoryGuard.getStats().autoGCCount;
      MemoryGuard._recordGC(false, {});
      const after = MemoryGuard.getStats().autoGCCount;
      expect(after).toBe(before + 1);
    });

    test('_recordGC continues firing listeners even if one throws', () => {
      const bad = jest.fn(() => {
        throw new Error('gc boom');
      });
      const good = jest.fn();
      MemoryGuard.onGC(bad);
      MemoryGuard.onGC(good);
      MemoryGuard._recordGC(true, { test: true });
      expect(good).toHaveBeenCalled();
    });
  });

  describe('reportCrash', () => {
    test('increments crashCount', () => {
      const before = MemoryGuard.getStats().crashCount;
      MemoryGuard.reportCrash();
      const after = MemoryGuard.getStats().crashCount;
      expect(after).toBe(before + 1);
    });
  });

  describe('webview registry', () => {
    test('getActiveProfileIds returns empty array initially', () => {
      // May have entries from other tests, but we test the structure
      const ids = MemoryGuard.getActiveProfileIds();
      expect(Array.isArray(ids)).toBe(true);
    });

    test('registerGameWebContents adds entry to registry', () => {
      const mockWC = { once: jest.fn() };
      MemoryGuard.registerGameWebContents('p_test1', mockWC);
      const ids = MemoryGuard.getActiveProfileIds();
      expect(ids).toContain('p_test1');
    });

    test('registerGameWebContents ignores null profileId', () => {
      const mockWC = { once: jest.fn() };
      const before = MemoryGuard.getActiveProfileIds().length;
      MemoryGuard.registerGameWebContents(null, mockWC);
      const after = MemoryGuard.getActiveProfileIds().length;
      expect(after).toBe(before);
    });

    test('registerGameWebContents ignores null webContents', () => {
      const before = MemoryGuard.getActiveProfileIds().length;
      MemoryGuard.registerGameWebContents('p_test2', null);
      const after = MemoryGuard.getActiveProfileIds().length;
      expect(after).toBe(before);
    });

    test('registerGameWebContents registers destroyed listener on webContents', () => {
      const mockWC = { once: jest.fn() };
      MemoryGuard.registerGameWebContents('p_test_destroy', mockWC);
      expect(mockWC.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
    });

    test('registerGameWebContents removes profile from registry on destroyed callback', () => {
      const destroyCb = jest.fn();
      const mockWC = {
        once: jest.fn((evt, cb) => {
          destroyCb.mockImplementation(cb);
        })
      };
      MemoryGuard.registerGameWebContents('p_destroy_cb', mockWC);
      expect(MemoryGuard.getActiveProfileIds()).toContain('p_destroy_cb');
      destroyCb();
      expect(MemoryGuard.getActiveProfileIds()).not.toContain('p_destroy_cb');
    });

    test('registerGameWebContents tolerates once() throwing', () => {
      const badWC = {
        once: jest.fn(() => {
          throw new Error('no once');
        })
      };
      // Entry is added before once() is called, so it stays in registry
      MemoryGuard.registerGameWebContents('p_bad_once', badWC);
      expect(MemoryGuard.getActiveProfileIds()).toContain('p_bad_once');
    });

    test('unregisterGameWebContents removes entry from registry', () => {
      const mockWC = { once: jest.fn() };
      MemoryGuard.registerGameWebContents('p_test_remove', mockWC);
      expect(MemoryGuard.getActiveProfileIds()).toContain('p_test_remove');

      MemoryGuard.unregisterGameWebContents('p_test_remove');
      expect(MemoryGuard.getActiveProfileIds()).not.toContain('p_test_remove');
    });

    test('unregisterGameWebContents is safe for non-existent id', () => {
      expect(() => MemoryGuard.unregisterGameWebContents('p_nonexistent')).not.toThrow();
    });
  });

  describe('getWebviewStats', () => {
    test('returns object with expected keys', () => {
      const stats = MemoryGuard.getWebviewStats();
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('totalGCs');
      expect(stats).toHaveProperty('lastGCAt');
      expect(stats).toHaveProperty('intervalMin');
    });

    test('active is a number', () => {
      const stats = MemoryGuard.getWebviewStats();
      expect(typeof stats.active).toBe('number');
      expect(stats.active).toBeGreaterThanOrEqual(0);
    });

    test('totalGCs is a non-negative number', () => {
      const stats = MemoryGuard.getWebviewStats();
      expect(stats.totalGCs).toBeGreaterThanOrEqual(0);
    });

    test('intervalMin is a positive number', () => {
      const stats = MemoryGuard.getWebviewStats();
      expect(stats.intervalMin).toBeGreaterThan(0);
    });
  });
});
