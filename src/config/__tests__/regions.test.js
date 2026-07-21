/**
 * Testes para src/config/regions.js
 */

const { REGIONS, REGION_CODES, isValidRegion, getDefaultRegion } = require('../regions');

describe('regions.js', () => {
  describe('REGIONS', () => {
    test('contém 6 regiões', () => {
      expect(Object.keys(REGIONS).length).toBe(6);
    });

    test('contém português', () => {
      expect(REGIONS['pt']).toBeDefined();
      expect(REGIONS['pt'].name).toBe('Português');
    });

    test('contém english', () => {
      expect(REGIONS['en']).toBeDefined();
      expect(REGIONS['en'].name).toBe('English');
    });

    test('todas regiões têm name e flag', () => {
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
      expect(REGION_CODES).toContain('fr');
      expect(REGION_CODES).toContain('de');
      expect(REGION_CODES).toContain('es');
      expect(REGION_CODES).toContain('pl');
    });
  });

  describe('isValidRegion', () => {
    test('retorna true para regiões válidas', () => {
      expect(isValidRegion('pt')).toBe(true);
      expect(isValidRegion('en')).toBe(true);
      expect(isValidRegion('fr')).toBe(true);
    });

    test('retorna false para regiões inválidas', () => {
      expect(isValidRegion('br')).toBe(false);
      expect(isValidRegion('us')).toBe(false);
      expect(isValidRegion('invalid')).toBe(false);
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
