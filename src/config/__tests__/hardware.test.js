/**
 * Testes para src/config/hardware.js
 */

const { 
  HARDWARE_PROFILES, 
  PROFILE_CODES, 
  isValidProfile, 
  getDefaultProfile 
} = require('../hardware');

describe('hardware.js', () => {
  describe('HARDWARE_PROFILES', () => {
    test('tem 3 perfis', () => {
      expect(Object.keys(HARDWARE_PROFILES)).toHaveLength(3);
    });

    test('contém perfil modern', () => {
      expect(HARDWARE_PROFILES).toHaveProperty('modern');
      expect(HARDWARE_PROFILES.modern.name).toBe('Moderno');
    });

    test('contém perfil legacy', () => {
      expect(HARDWARE_PROFILES).toHaveProperty('legacy');
      expect(HARDWARE_PROFILES.legacy.name).toBe('Antigo');
    });

    test('contém perfil cpu', () => {
      expect(HARDWARE_PROFILES).toHaveProperty('cpu');
      expect(HARDWARE_PROFILES.cpu.name).toBe('CPU Only');
    });

    test('todos os perfis têm name, description e icon', () => {
      Object.values(HARDWARE_PROFILES).forEach(profile => {
        expect(profile).toHaveProperty('name');
        expect(profile).toHaveProperty('description');
        expect(profile).toHaveProperty('icon');
      });
    });
  });

  describe('PROFILE_CODES', () => {
    test('retorna array de códigos', () => {
      expect(Array.isArray(PROFILE_CODES)).toBe(true);
      expect(PROFILE_CODES).toContain('modern');
      expect(PROFILE_CODES).toContain('legacy');
      expect(PROFILE_CODES).toContain('cpu');
    });
  });

  describe('isValidProfile', () => {
    test('retorna true para perfis válidos', () => {
      expect(isValidProfile('modern')).toBe(true);
      expect(isValidProfile('legacy')).toBe(true);
      expect(isValidProfile('cpu')).toBe(true);
    });

    test('retorna false para perfis inválidos', () => {
      expect(isValidProfile('invalid')).toBe(false);
      expect(isValidProfile('gpu')).toBe(false);
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
