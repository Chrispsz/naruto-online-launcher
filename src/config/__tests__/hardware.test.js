/**
 * Testes para src/config/hardware.js
 */

const {
  HARDWARE_PROFILES,
  isValidProfile,
  getDefaultProfile
} = require('../hardware');

describe('hardware.js', () => {
  describe('HARDWARE_PROFILES', () => {
    test('contém 3 perfis', () => {
      expect(Object.keys(HARDWARE_PROFILES).length).toBe(3);
    });

    test('contém perfil modern', () => {
      expect(HARDWARE_PROFILES['modern']).toBeDefined();
      expect(HARDWARE_PROFILES['modern'].name).toBe('Moderno');
    });

    test('contém perfil legacy', () => {
      expect(HARDWARE_PROFILES['legacy']).toBeDefined();
      expect(HARDWARE_PROFILES['legacy'].name).toBe('Antigo');
    });

    test('contém perfil cpu', () => {
      expect(HARDWARE_PROFILES['cpu']).toBeDefined();
      expect(HARDWARE_PROFILES['cpu'].name).toBe('CPU Only');
    });

    test('todos perfis têm name, description e icon', () => {
      Object.values(HARDWARE_PROFILES).forEach(profile => {
        expect(profile).toHaveProperty('name');
        expect(profile).toHaveProperty('description');
        expect(profile).toHaveProperty('icon');
      });
    });
  });

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
