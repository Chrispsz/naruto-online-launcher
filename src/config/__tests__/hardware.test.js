/**
 * Testes para src/config/hardware.js
 */

const {
  isValidProfile,
  getDefaultProfile
} = require('../hardware');

describe('hardware.js', () => {
  describe('isValidProfile', () => {
    test('retorna true para perfis válidos', () => {
      expect(isValidProfile('modern')).toBe(true);
      expect(isValidProfile('legacy')).toBe(true);
      expect(isValidProfile('cpu')).toBe(true);
    });

    test('retorna false para perfis inválidos', () => {
      expect(isValidProfile('high')).toBe(false);
      expect(isValidProfile('low')).toBe(false);
      expect(isValidProfile('invalid')).toBe(false);
      expect(isValidProfile('')).toBe(false);
      expect(isValidProfile(null)).toBe(false);
      expect(isValidProfile(undefined)).toBe(false);
    });
  });

  describe('getDefaultProfile', () => {
    test('retorna modern como padrão', () => {
      expect(getDefaultProfile()).toBe('modern');
    });
  });
});
