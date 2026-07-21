/**
 * Tests for app/CpuOptimizer.js (v1.0.0)
 */

'use strict';

const fs = require('fs');
const child_process = require('child_process');

// Mocks
jest.mock('fs');
jest.mock('child_process');
jest.mock('os', function () {
  return {
    cpus: jest.fn(function () {
      return new Array(8);
    })
  };
});
jest.mock('../../utils/logger', function () {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
});

const cpuOptimizer = require('../CpuOptimizer');

describe('CpuOptimizer', function () {
  beforeEach(function () {
    jest.clearAllMocks();
    cpuOptimizer._reset();
    fs.existsSync.mockReset();
    fs.readFile.mockReset && fs.readFile.mockReset();
    fs.writeFile.mockReset();
    child_process.execFile.mockReset();

    // Garante os.constants.priority existe (testes cross-platform no Windows CI
    // onde o mock de `os` só tinha `cpus`). _winPrioConstants() lê esses valores
    // quando o código de produção entra no path Windows.
    const os = require('os');
    os.constants = {
      priority: {
        PRIORITY_ABOVE_NORMAL: -7,
        PRIORITY_NORMAL: 0,
        PRIORITY_BELOW_NORMAL: 10
      }
    };
    os.setPriority = jest.fn();

    // Default: assume Linux. Testes que exercitam paths win32/darwin setam
    // explicitamente via Object.defineProperty (e restauram no finally).
    // Em Windows CI, process.platform real é 'win32' e os guards de produção
    // retornam 'not-linux' antes dos testes poderem exercitar o comportamento.
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  describe('_parseCpuList', function () {
    test('parses single number', function () {
      expect(cpuOptimizer._parseCpuList('5')).toEqual([5]);
    });

    test('parses range "0-3"', function () {
      expect(cpuOptimizer._parseCpuList('0-3')).toEqual([0, 1, 2, 3]);
    });

    test('parses comma-separated "0,2,4"', function () {
      expect(cpuOptimizer._parseCpuList('0,2,4')).toEqual([0, 2, 4]);
    });

    test('parses mixed "0-3,8-11"', function () {
      expect(cpuOptimizer._parseCpuList('0-3,8-11')).toEqual([0, 1, 2, 3, 8, 9, 10, 11]);
    });

    test('parses space-separated "0 1 2"', function () {
      expect(cpuOptimizer._parseCpuList('0 1 2')).toEqual([0, 1, 2]);
    });

    test('parses mixed separators "0-1, 4, 6-7"', function () {
      expect(cpuOptimizer._parseCpuList('0-1, 4, 6-7')).toEqual([0, 1, 4, 6, 7]);
    });

    test('returns empty for empty string', function () {
      expect(cpuOptimizer._parseCpuList('')).toEqual([]);
    });

    test('returns empty for whitespace', function () {
      expect(cpuOptimizer._parseCpuList('  \n  ')).toEqual([]);
    });

    test('ignores invalid parts', function () {
      expect(cpuOptimizer._parseCpuList('0,abc,2-3,xyz')).toEqual([0, 2, 3]);
    });
  });

  describe('detectCoreTopology', function () {
    test('returns hybrid topology when cpu_core + cpu_atom exist', function () {
      fs.existsSync.mockImplementation(function (p) {
        return p === '/sys/devices/cpu_core/cpus' || p === '/sys/devices/cpu_atom/cpus';
      });
      fs.readFileSync.mockImplementation(function (p) {
        if (p === '/sys/devices/cpu_core/cpus') return '0-7';
        if (p === '/sys/devices/cpu_atom/cpus') return '8-11';
        return '';
      });
      const topo = cpuOptimizer.detectCoreTopology();
      expect(topo.isHybrid).toBe(true);
      expect(topo.pCores).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(topo.eCores).toEqual([8, 9, 10, 11]);
      expect(topo.totalCores).toBe(8); // from os.cpus().length mock
    });

    test('returns uniform topology when no P/E split', function () {
      fs.existsSync.mockReturnValue(false);
      const topo = cpuOptimizer.detectCoreTopology();
      expect(topo.isHybrid).toBe(false);
      expect(topo.pCores.length).toBe(8); // all cores
      expect(topo.eCores.length).toBe(0);
    });

    test('returns uniform when only cpu_core exists (non-hybrid)', function () {
      fs.existsSync.mockImplementation(function (p) {
        return p === '/sys/devices/cpu_core/cpus';
      });
      fs.readFileSync.mockReturnValue('0-7');
      const topo = cpuOptimizer.detectCoreTopology();
      expect(topo.isHybrid).toBe(false);
      expect(topo.pCores.length).toBe(8);
      expect(topo.eCores.length).toBe(0);
    });
  });

  describe('_applyTaskset', function () {
    test('returns not-linux on non-linux platform', async function () {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        const res = await cpuOptimizer._applyTaskset(1234, [0, 1]);
        expect(res.ok).toBe(false);
        expect(res.error).toBe('not-linux');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    test('returns invalid-args when pid is 0', async function () {
      const res = await cpuOptimizer._applyTaskset(0, [0, 1]);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('invalid-args');
    });

    test('returns invalid-args when cores is empty', async function () {
      const res = await cpuOptimizer._applyTaskset(1234, []);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('invalid-args');
    });

    test('returns ok when taskset succeeds', async function () {
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(null, '', '');
      });
      const res = await cpuOptimizer._applyTaskset(1234, [0, 1, 2]);
      expect(res.ok).toBe(true);
    });

    test('returns error when taskset fails (not installed)', async function () {
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(new Error('taskset: command not found'));
      });
      const res = await cpuOptimizer._applyTaskset(1234, [0]);
      expect(res.ok).toBe(false);
      expect(res.error).toContain('not found');
    });
  });

  describe('_applyRenice', function () {
    test('returns not-linux on non-linux platform', async function () {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const res = await cpuOptimizer._applyRenice(1234, -5);
        expect(res.ok).toBe(false);
        expect(res.error).toBe('not-linux');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    test('returns ok with priority when renice succeeds', async function () {
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(null, '', '');
      });
      const res = await cpuOptimizer._applyRenice(1234, -5);
      expect(res.ok).toBe(true);
      expect(res.priority).toBe(-5);
    });
  });

  describe('_applyOomScoreAdj', function () {
    test('returns not-linux on non-linux platform', async function () {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        const res = await cpuOptimizer._applyOomScoreAdj(1234, -500);
        expect(res.ok).toBe(false);
        expect(res.error).toBe('not-linux');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    test('returns ok when file write succeeds', async function () {
      fs.writeFile.mockImplementation(function (path, data, cb) {
        cb(null);
      });
      const res = await cpuOptimizer._applyOomScoreAdj(1234, -500);
      expect(res.ok).toBe(true);
    });

    test('returns error when file write fails (permission denied)', async function () {
      fs.writeFile.mockImplementation(function (path, data, cb) {
        cb(new Error('EACCES: permission denied'));
      });
      const res = await cpuOptimizer._applyOomScoreAdj(1234, -500);
      expect(res.ok).toBe(false);
      expect(res.error).toContain('permission denied');
    });
  });

  describe('optimizeRenderer', function () {
    test('returns invalid-pid results when pid is 0', async function () {
      const res = await cpuOptimizer.optimizeRenderer(0, { preset: 'balanced' });
      expect(res.affinity.ok).toBe(false);
      expect(res.nice.ok).toBe(false);
      expect(res.oom.ok).toBe(false);
    });

    test('returns invalid-pid results when pid is negative', async function () {
      const res = await cpuOptimizer.optimizeRenderer(-1, { preset: 'balanced' });
      expect(res.affinity.ok).toBe(false);
    });

    test('quality preset skips affinity (lets scheduler decide)', async function () {
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(null, '', '');
      });
      fs.writeFile.mockImplementation(function (path, data, cb) {
        cb(null);
      });
      const res = await cpuOptimizer.optimizeRenderer(1234, { preset: 'quality' });
      // Affinity should be skipped (ok=true, skipped='quality-preset')
      expect(res.affinity.ok).toBe(true);
      expect(res.affinity.skipped).toBe('quality-preset');
      // Nice +5 (cedes priority)
      expect(res.nice.ok).toBe(true);
      expect(res.nice.priority).toBe(5);
      // OOM 0 (no protection)
      expect(res.oom.ok).toBe(true);
    });

    test('performance preset applies affinity + nice=-5 + oom=-500', async function () {
      // Mock topology: uniform 8 cores
      fs.existsSync.mockReturnValue(false);
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(null, '', '');
      });
      fs.writeFile.mockImplementation(function (path, data, cb) {
        cb(null);
      });
      const res = await cpuOptimizer.optimizeRenderer(1234, { preset: 'performance' });
      expect(res.affinity.ok).toBe(true);
      expect(res.cores.length).toBeGreaterThan(0);
      expect(res.nice.ok).toBe(true);
      expect(res.oom.ok).toBe(true);
    });

    test('nice=-5 falls back to 0 when permission denied', async function () {
      fs.existsSync.mockReturnValue(false);
      let callCount = 0;
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        callCount++;
        if (cmd === 'renice' && args[1] === '-5') {
          cb(new Error('Permission denied'));
        } else {
          cb(null, '', '');
        }
      });
      fs.writeFile.mockImplementation(function (path, data, cb) {
        cb(null);
      });
      const res = await cpuOptimizer.optimizeRenderer(5678, { preset: 'performance' });
      // Should have retried renice with 0
      expect(callCount).toBeGreaterThanOrEqual(2);
      expect(res.nice.ok).toBe(true);
      expect(res.nice.priority).toBe(0);
    });

    test('idempotent: same pid returns skipped on second call', async function () {
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(null, '', '');
      });
      fs.writeFile.mockImplementation(function (path, data, cb) {
        cb(null);
      });
      await cpuOptimizer.optimizeRenderer(9999, { preset: 'balanced' });
      const res = await cpuOptimizer.optimizeRenderer(9999, { preset: 'balanced' });
      expect(res.affinity.skipped).toBe(true);
      expect(res.nice.skipped).toBe(true);
      expect(res.oom.skipped).toBe(true);
    });

    test('clears _appliedPids after 50 entries (memory leak prevention)', async function () {
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(null, '', '');
      });
      fs.writeFile.mockImplementation(function (path, data, cb) {
        cb(null);
      });
      // Apply for 51 different PIDs
      for (let i = 1000; i < 1051; i++) {
        await cpuOptimizer.optimizeRenderer(i, { preset: 'balanced' });
      }
      const stats = cpuOptimizer.getStats();
      // After 51 entries, Set should have been cleared (<=1 entry)
      expect(stats.appliedPids).toBeLessThanOrEqual(1);
    });
  });

  describe('getStats', function () {
    test('returns topology + platform + appliedPids', function () {
      fs.existsSync.mockReturnValue(false);
      const stats = cpuOptimizer.getStats();
      expect(stats).toHaveProperty('topology');
      expect(stats).toHaveProperty('appliedPids');
      expect(stats).toHaveProperty('platform');
      expect(stats.platform).toBe(process.platform);
    });
  });

  describe('_applyWindowsAffinity', function () {
    test('returns not-windows on non-win32', async function () {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const res = await cpuOptimizer._applyWindowsAffinity(1234, [0, 1, 2, 3]);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('not-windows');
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });

    test('returns invalid-args for empty cores on win32', async function () {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const res = await cpuOptimizer._applyWindowsAffinity(1234, []);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('invalid-args');
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });

    test('computes bitmask and calls powershell on win32', async function () {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(null, '', '');
      });
      const res = await cpuOptimizer._applyWindowsAffinity(1234, [0, 1, 2, 3]);
      expect(res.ok).toBe(true);
      expect(res.mask).toBe(15); // 0b1111
      expect(child_process.execFile).toHaveBeenCalled();
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });

    test('handles execFile error gracefully (fallback pwsh also fails)', async function () {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(new Error('powershell not found'));
      });
      const res = await cpuOptimizer._applyWindowsAffinity(1234, [0, 1]);
      expect(res.ok).toBe(false);
      // Error now prefixed with 'pwsh:' since powershell failed and pwsh was tried as fallback
      expect(res.error).toContain('not found');
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });
  });

  describe('_applyWindowsPriority', function () {
    test('returns not-windows on non-win32', async function () {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const res = await cpuOptimizer._applyWindowsPriority(1234, -5);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('not-windows');
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });
  });

  describe('optimizeRenderer cross-platform', function () {
    test('Windows path: uses win affinity + priority, skips oom', async function () {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      // Mock os.setPriority + constants via _winPrioConstants override
      const os = require('os');
      os.constants = {
        priority: { PRIORITY_ABOVE_NORMAL: -7, PRIORITY_NORMAL: 0, PRIORITY_BELOW_NORMAL: 10 }
      };
      os.setPriority = jest.fn();
      child_process.execFile.mockImplementation(function (cmd, args, opts, cb) {
        cb(null, '', '');
      });
      const res = await cpuOptimizer.optimizeRenderer(8888, { preset: 'performance' });
      expect(res.affinity.ok).toBe(true);
      expect(res.nice.ok).toBe(true);
      expect(res.oom.skipped).toBe('no-windows-equivalent');
      expect(os.setPriority).toHaveBeenCalled();
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });

    test('macOS path: all skipped', async function () {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const res = await cpuOptimizer.optimizeRenderer(7777, { preset: 'balanced' });
      expect(res.affinity.skipped).toContain('platform-darwin');
      expect(res.nice.skipped).toContain('platform-darwin');
      expect(res.oom.skipped).toContain('platform-darwin');
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });
  });
});
