/**
 * Tests for src/memory/MemoryGuard.js — telemetria + Modo Leve detection
 *
 * Verifies: exports, getStats, isBatata/isRamen, getThreshold, setForceBatata,
 * reportCrash, IS_LOW_SPEC/IS_RAMEN.
 *
 * v1.1.2: GcDaemon removido (GC forçado em main de 50MB é otimização inútil).
 * Testes de collect/start/stop/register/unregister/onMemoryUpdate/onGC/
 * getWebviewStats/getActiveProfileIds removidos junto.
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
    test('exports setForceBatata as function', () => {
      expect(typeof MemoryGuard.setForceBatata).toBe('function');
    });
    test('exports reportCrash as function', () => {
      expect(typeof MemoryGuard.reportCrash).toBe('function');
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

    test('crashCount starts at 0 or increments with reportCrash', () => {
      const before = MemoryGuard.getStats().crashCount;
      MemoryGuard.reportCrash();
      const after = MemoryGuard.getStats().crashCount;
      expect(after).toBe(before + 1);
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
      expect(MemoryGuard.isBatata()).toBe(MemoryGuard.IS_LOW_SPEC);
    });

    test('updates threshold to batata config when enabled', () => {
      MemoryGuard.setForceBatata(true);
      expect(MemoryGuard.getThreshold()).toBe(450); // batata thresholdMB
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

  describe('reportCrash', () => {
    test('increments crashCount', () => {
      const before = MemoryGuard.getStats().crashCount;
      MemoryGuard.reportCrash();
      const after = MemoryGuard.getStats().crashCount;
      expect(after).toBe(before + 1);
    });
  });
});
