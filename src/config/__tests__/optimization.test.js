/**
 * Tests for config/optimization.js (v1.0.0)
 */

'use strict';

const opt = require('../optimization');

describe('config/optimization.js', function () {
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
