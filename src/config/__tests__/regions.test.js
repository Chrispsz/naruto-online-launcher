/**
 * Testes para src/config/regions.js
 */

const { REGIONS, REGION_CODES, isValidRegion, getDefaultRegion } = require('../regions');

describe('regions.js', () => {
  describe('REGIONS', () => {
    test('tem 6 regiões', () => {
      expect(Object.keys(REGIONS)).toHaveLength(6);
    });

    test('contém português como primeira região', () => {
      expect(REGIONS).toHaveProperty('pt');
      expect(REGIONS.pt.name).toBe('Português');
    });

    test('todas as regiões têm name e flag', () => {
      Object.values(REGIONS).forEach(region => {
        expect(region).toHaveProperty('name');
        expect(region).toHaveProperty('flag');
      });
    });
  });

  describe('REGION_CODES', () => {
    test('retorna array de códigos', () => {
      expect(Array.isArray(REGION_CODES)).toBe(true);
      expect(REGION_CODES).toContain('pt');
      expect(REGION_CODES).toContain('en');
    });
  });

  describe('isValidRegion', () => {
    test('retorna true para regiões válidas', () => {
      expect(isValidRegion('pt')).toBe(true);
      expect(isValidRegion('en')).toBe(true);
      expect(isValidRegion('fr')).toBe(true);
    });

    test('retorna false para regiões inválidas', () => {
      expect(isValidRegion('invalid')).toBe(false);
      expect(isValidRegion('br')).toBe(false);
      expect(isValidRegion('')).toBe(false);
      expect(isValidRegion(null)).toBe(false);
      expect(isValidRegion(undefined)).toBe(false);
    });
  });

  describe('getDefaultRegion', () => {
    test('retorna pt como padrão', () => {
      expect(getDefaultRegion()).toBe('pt');
    });
  });
});
