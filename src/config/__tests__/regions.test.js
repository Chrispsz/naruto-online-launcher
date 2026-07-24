/**
 * Testes para src/config/regions.js — 6-cluster model (br/na/de/es/pl/fr)
 */

const {
  REGIONS,
  REGION_CODES,
  LEGACY_MIGRATION,
  isValidRegion,
  isCurrentRegion,
  normalizeRegion,
  getDefaultRegion
} = require('../regions');

describe('regions.js', () => {
  describe('REGIONS', () => {
    test('contém 6 clusters', () => {
      expect(Object.keys(REGIONS).length).toBe(6);
    });

    test('contém br (Brasil)', () => {
      expect(REGIONS['br']).toBeDefined();
      expect(REGIONS['br'].name).toBe('Brasil');
      expect(REGIONS['br'].language).toBe('pt');
    });

    test('contém na (North America)', () => {
      expect(REGIONS['na']).toBeDefined();
      expect(REGIONS['na'].name_en).toBe('North America');
      expect(REGIONS['na'].language).toBe('en');
    });

    test('contém de/es/pl/fr (European clusters)', () => {
      expect(REGIONS['de']).toBeDefined();
      expect(REGIONS['es']).toBeDefined();
      expect(REGIONS['pl']).toBeDefined();
      expect(REGIONS['fr']).toBeDefined();
    });

    test('todas regiões têm name, name_en, flag e language', () => {
      Object.values(REGIONS).forEach(region => {
        expect(region).toHaveProperty('name');
        expect(region).toHaveProperty('name_en');
        expect(region).toHaveProperty('flag');
        expect(region).toHaveProperty('language');
      });
    });
  });

  describe('REGION_CODES', () => {
    test('retorna array de 6 códigos de cluster', () => {
      expect(Array.isArray(REGION_CODES)).toBe(true);
      expect(REGION_CODES.length).toBe(6);
      expect(REGION_CODES).toContain('br');
      expect(REGION_CODES).toContain('na');
      expect(REGION_CODES).toContain('de');
      expect(REGION_CODES).toContain('es');
      expect(REGION_CODES).toContain('pl');
      expect(REGION_CODES).toContain('fr');
    });
  });

  describe('LEGACY_MIGRATION', () => {
    test('mapeia eu → na (redundant EN cluster)', () => {
      expect(LEGACY_MIGRATION['eu']).toBe('na');
    });

    test('mapeia hk → na (DNS-dead zh cluster)', () => {
      expect(LEGACY_MIGRATION['hk']).toBe('na');
    });

    test('mapeia pt → br (legacy language code)', () => {
      expect(LEGACY_MIGRATION['pt']).toBe('br');
    });

    test('mapeia en → na (legacy language code)', () => {
      expect(LEGACY_MIGRATION['en']).toBe('na');
    });
  });

  describe('isValidRegion', () => {
    test('retorna true para clusters atuais', () => {
      expect(isValidRegion('br')).toBe(true);
      expect(isValidRegion('na')).toBe(true);
      expect(isValidRegion('de')).toBe(true);
      expect(isValidRegion('es')).toBe(true);
      expect(isValidRegion('pl')).toBe(true);
      expect(isValidRegion('fr')).toBe(true);
    });

    test('retorna true para códigos legacy (aceitos p/ migração)', () => {
      expect(isValidRegion('eu')).toBe(true);
      expect(isValidRegion('hk')).toBe(true);
      expect(isValidRegion('pt')).toBe(true);
      expect(isValidRegion('en')).toBe(true);
    });

    test('retorna false para códigos inválidos', () => {
      expect(isValidRegion('us')).toBe(false);
      expect(isValidRegion('invalid')).toBe(false);
      expect(isValidRegion('')).toBe(false);
      expect(isValidRegion(null)).toBe(false);
      expect(isValidRegion(undefined)).toBe(false);
      expect(isValidRegion(123)).toBe(false);
    });
  });

  describe('isCurrentRegion', () => {
    test('retorna true apenas para clusters atuais', () => {
      expect(isCurrentRegion('br')).toBe(true);
      expect(isCurrentRegion('na')).toBe(true);
      expect(isCurrentRegion('fr')).toBe(true);
    });

    test('retorna false para códigos legacy', () => {
      expect(isCurrentRegion('eu')).toBe(false);
      expect(isCurrentRegion('hk')).toBe(false);
      expect(isCurrentRegion('pt')).toBe(false);
      expect(isCurrentRegion('en')).toBe(false);
    });

    test('retorna false para inválidos', () => {
      expect(isCurrentRegion('invalid')).toBe(false);
      expect(isCurrentRegion(null)).toBe(false);
    });
  });

  describe('normalizeRegion', () => {
    test('clusters atuais passam inalterados', () => {
      expect(normalizeRegion('br')).toBe('br');
      expect(normalizeRegion('na')).toBe('na');
      expect(normalizeRegion('de')).toBe('de');
      expect(normalizeRegion('fr')).toBe('fr');
    });

    test('códigos legacy são migrados', () => {
      expect(normalizeRegion('eu')).toBe('na');
      expect(normalizeRegion('hk')).toBe('na');
      expect(normalizeRegion('pt')).toBe('br');
      expect(normalizeRegion('en')).toBe('na');
    });

    test('códigos desconhecidos retornam default (br)', () => {
      expect(normalizeRegion('invalid')).toBe('br');
      expect(normalizeRegion(null)).toBe('br');
      expect(normalizeRegion(undefined)).toBe('br');
      expect(normalizeRegion(123)).toBe('br');
    });
  });

  describe('getDefaultRegion', () => {
    test('retorna br como padrão', () => {
      expect(getDefaultRegion()).toBe('br');
    });
  });
});
