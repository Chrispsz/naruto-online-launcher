/**
 * Tests for config/optimization.js (v1.0.0)
 */

'use strict';

const opt = require('../optimization');

describe('config/optimization.js', function () {
  describe('PRESETS', function () {
    test('has exactly 3 presets', function () {
      expect(Object.keys(opt.PRESETS).length).toBe(3);
    });

    test('has performance, balanced, quality', function () {
      expect(opt.PRESETS.performance).toBeDefined();
      expect(opt.PRESETS.balanced).toBeDefined();
      expect(opt.PRESETS.quality).toBeDefined();
    });

    test('each preset has name, description, icon, color', function () {
      Object.keys(opt.PRESETS).forEach(function (code) {
        const p = opt.PRESETS[code];
        expect(typeof p.name).toBe('string');
        expect(typeof p.description).toBe('string');
        expect(typeof p.icon).toBe('string');
        expect(typeof p.color).toBe('string');
        expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    test('presets have NO chromiumFlags/cpu/memory/gpuEnv (dead code removed)', function () {
      Object.keys(opt.PRESETS).forEach(function (code) {
        const p = opt.PRESETS[code];
        expect(p.chromiumFlags).toBeUndefined();
        expect(p.cpu).toBeUndefined();
        expect(p.memory).toBeUndefined();
        expect(p.gpuEnv).toBeUndefined();
      });
    });

    test('CPU logic is in CpuOptimizer, not in presets', function () {
      // Presets are UI-only. CpuOptimizer hardcodes: performance→nice=-5, balanced→nice=0, quality→nice=+5
      // This test documents that the preset object does NOT own CPU config.
      expect(opt.PRESETS.performance.name).toBe('Performance');
      expect(opt.PRESETS.quality.name).toBe('Qualidade');
    });
  });

  describe('PRESET_CODES', function () {
    test('returns array of 3 codes', function () {
      expect(Array.isArray(opt.PRESET_CODES)).toBe(true);
      expect(opt.PRESET_CODES.length).toBe(3);
      expect(opt.PRESET_CODES).toContain('performance');
      expect(opt.PRESET_CODES).toContain('balanced');
      expect(opt.PRESET_CODES).toContain('quality');
    });
  });

  describe('isValidPreset', function () {
    test('returns true for valid codes', function () {
      expect(opt.isValidPreset('performance')).toBe(true);
      expect(opt.isValidPreset('balanced')).toBe(true);
      expect(opt.isValidPreset('quality')).toBe(true);
    });

    test('returns false for invalid codes', function () {
      expect(opt.isValidPreset('unknown')).toBe(false);
      expect(opt.isValidPreset('')).toBe(false);
      expect(opt.isValidPreset(null)).toBe(false);
      expect(opt.isValidPreset(undefined)).toBe(false);
      expect(opt.isValidPreset(123)).toBe(false);
    });
  });

  describe('getDefaultPreset', function () {
    test('returns balanced', function () {
      expect(opt.getDefaultPreset()).toBe('balanced');
    });
  });

  describe('listForUI', function () {
    test('returns array of 3 items with code, name, description, icon, color', function () {
      const list = opt.listForUI();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(3);
      list.forEach(function (item) {
        expect(item).toHaveProperty('code');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('icon');
        expect(item).toHaveProperty('color');
      });
    });

    test('first item is performance', function () {
      const list = opt.listForUI();
      expect(list[0].code).toBe('performance');
    });

    test('second item is balanced', function () {
      const list = opt.listForUI();
      expect(list[1].code).toBe('balanced');
    });

    test('third item is quality', function () {
      const list = opt.listForUI();
      expect(list[2].code).toBe('quality');
    });
  });
});
