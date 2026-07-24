/**
 * Tests for src/memory/MemoryGuard.js — monitoramento + Modo Leve detection
 *
 * Verifies: exports, getStats, isLowSpecMode/isMinimal, getThreshold, setForceLowSpec,
 * reportCrash, IS_LOW_SPEC/IS_MINIMAL.
 *
 * v1.1.2: GcDaemon removido (GC forçado em main de 50MB é otimização inútil).
 * Testes de collect/start/stop/register/unregister/onMemoryUpdate/onGC/
 * getWebviewStats/getActiveProfileIds removidos junto.
 */

'use strict';

// Mock partition to avoid side effects from setForceLowSpec
jest.mock('../../profiles/partition', () => ({
  setLowSpecMode: jest.fn()
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
    test('exports isLowSpecMode as function', () => {
      expect(typeof MemoryGuard.isLowSpecMode).toBe('function');
    });
    test('exports isMinimal as function', () => {
      expect(typeof MemoryGuard.isMinimal).toBe('function');
    });
    test('exports getThreshold as function', () => {
      expect(typeof MemoryGuard.getThreshold).toBe('function');
    });
    test('exports setForceLowSpec as function', () => {
      expect(typeof MemoryGuard.setForceLowSpec).toBe('function');
    });
    test('exports reportCrash as function', () => {
      expect(typeof MemoryGuard.reportCrash).toBe('function');
    });
    test('exports IS_LOW_SPEC as boolean', () => {
      expect(typeof MemoryGuard.IS_LOW_SPEC).toBe('boolean');
    });
    test('exports IS_MINIMAL as boolean', () => {
      expect(typeof MemoryGuard.IS_MINIMAL).toBe('boolean');
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
      expect(stats).toHaveProperty('isLowSpecMode');
      expect(stats).toHaveProperty('isMinimal');
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

  describe('isLowSpecMode / isMinimal', () => {
    test('isLowSpecMode returns a boolean', () => {
      expect(typeof MemoryGuard.isLowSpecMode()).toBe('boolean');
    });

    test('isMinimal returns a boolean', () => {
      expect(typeof MemoryGuard.isMinimal()).toBe('boolean');
    });

    test('IS_MINIMAL implies IS_LOW_SPEC', () => {
      if (MemoryGuard.IS_MINIMAL) {
        expect(MemoryGuard.IS_LOW_SPEC).toBe(true);
      }
    });

    test('isMinimal is consistent with IS_MINIMAL', () => {
      expect(MemoryGuard.isMinimal()).toBe(MemoryGuard.IS_MINIMAL);
    });
  });

  describe('setForceLowSpec', () => {
    test('enables lowSpec mode when called with true', () => {
      MemoryGuard.setForceLowSpec(true);
      expect(MemoryGuard.isLowSpecMode()).toBe(true);
    });

    test('restores normal mode when called with false', () => {
      MemoryGuard.setForceLowSpec(true);
      MemoryGuard.setForceLowSpec(false);
      expect(MemoryGuard.isLowSpecMode()).toBe(MemoryGuard.IS_LOW_SPEC);
    });

    test('updates threshold to lowSpec config when enabled', () => {
      MemoryGuard.setForceLowSpec(true);
      expect(MemoryGuard.getThreshold()).toBe(450); // lowSpec thresholdMB
    });

    test('calls partition.setLowSpecMode', () => {
      const partition = require('../../profiles/partition');
      MemoryGuard.setForceLowSpec(true);
      expect(partition.setLowSpecMode).toHaveBeenCalledWith(true);
    });

    afterEach(() => {
      MemoryGuard.setForceLowSpec(false);
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
