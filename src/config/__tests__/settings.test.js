/**
 * Testes para src/config/settings.js
 * Nota: Este módulo depende de electron.app, então testamos a lógica de validação
 */

// Mock do electron
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/userData')
  }
}));

// Mock do fs
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));

const { validateConfig } = require('../settings');

describe('settings.js - validateConfig', () => {
  test('retorna defaults para config vazia', () => {
    const result = validateConfig({});
    expect(result.region).toBe('pt');
    expect(result.hardwareProfile).toBe('modern');
  });

  test('retorna defaults para config undefined', () => {
    const result = validateConfig(undefined);
    expect(result.region).toBe('pt');
    expect(result.hardwareProfile).toBe('modern');
  });

  test('retorna defaults para config null', () => {
    const result = validateConfig(null);
    expect(result.region).toBe('pt');
    expect(result.hardwareProfile).toBe('modern');
  });

  test('mantém região válida', () => {
    const result = validateConfig({ region: 'en' });
    expect(result.region).toBe('en');
  });

  test('mantém perfil válido', () => {
    const result = validateConfig({ hardwareProfile: 'legacy' });
    expect(result.hardwareProfile).toBe('legacy');
  });

  test('mantém ambos valores válidos', () => {
    const result = validateConfig({ 
      region: 'de', 
      hardwareProfile: 'cpu' 
    });
    expect(result.region).toBe('de');
    expect(result.hardwareProfile).toBe('cpu');
  });

  test('sanitiza região inválida', () => {
    const result = validateConfig({ region: 'invalid' });
    expect(result.region).toBe('pt'); // fallback para default
  });

  test('sanitiza perfil inválido', () => {
    const result = validateConfig({ hardwareProfile: 'invalid' });
    expect(result.hardwareProfile).toBe('modern'); // fallback para default
  });

  test('ignora propriedades desconhecidas', () => {
    const result = validateConfig({ 
      region: 'fr',
      unknownProp: 'should be ignored' 
    });
    expect(result.region).toBe('fr');
    expect(result).not.toHaveProperty('unknownProp');
  });
});
