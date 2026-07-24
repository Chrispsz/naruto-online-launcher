/**
 * Testes para src/config/settings.js
 * Cobertura: validateConfig, loadConfig, saveConfig
 */

// Mock do electron (local — este arquivo precisa de app.getPath)
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/userData')
  }
}));

// Mock do fs
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockRenameSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  renameSync: mockRenameSync
}));

const settings = require('../settings');
const validateConfig = settings.validateConfig;
const loadConfig = settings.loadConfig;
const saveConfig = settings.saveConfig;

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockStatSync.mockReturnValue({ size: 512 });
});

describe('settings.js - validateConfig', () => {
  test('retorna defaults para config vazia', () => {
    const result = validateConfig({});
    expect(result.region).toBe('br');
    expect(result.hardwareProfile).toBe('modern');
  });

  test('retorna defaults para config undefined', () => {
    const result = validateConfig(undefined);
    expect(result.region).toBe('br');
    expect(result.hardwareProfile).toBe('modern');
  });

  test('retorna defaults para config null', () => {
    const result = validateConfig(null);
    expect(result.region).toBe('br');
    expect(result.hardwareProfile).toBe('modern');
  });

  test('mantém região válida (current cluster)', () => {
    const result = validateConfig({ region: 'na' });
    expect(result.region).toBe('na');
  });

  test('normaliza região legacy (en → na)', () => {
    const result = validateConfig({ region: 'en' });
    expect(result.region).toBe('na');
  });

  test('normaliza região legacy (pt → br)', () => {
    const result = validateConfig({ region: 'pt' });
    expect(result.region).toBe('br');
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
    expect(result.region).toBe('br');
  });

  test('sanitiza perfil inválido', () => {
    const result = validateConfig({ hardwareProfile: 'invalid' });
    expect(result.hardwareProfile).toBe('modern');
  });

  test('ignora propriedades desconhecidas', () => {
    const result = validateConfig({
      region: 'fr',
      unknownProp: 'should be ignored'
    });
    expect(result.region).toBe('fr');
    expect(result).not.toHaveProperty('unknownProp');
  });

  // ── v5.13.0: language field (EN default, PT supported) ──

  test('default language é en (v5.13.0: EN is the global default)', () => {
    expect(validateConfig({}).language).toBe('en');
  });

  test('aceita idiomas suportados (pt, en)', () => {
    ['pt', 'en'].forEach(lang => {
      expect(validateConfig({ language: lang }).language).toBe(lang);
    });
  });

  test('rejeita idiomas não suportados (de, es, pl, fr) e usa en', () => {
    ['de', 'es', 'pl', 'fr', 'ru', 'ja'].forEach(lang => {
      expect(validateConfig({ language: lang }).language).toBe('en');
    });
  });

  test('rejeita idioma inválido e usa en como fallback', () => {
    expect(validateConfig({ language: 'ru' }).language).toBe('en');
    expect(validateConfig({ language: 'ja' }).language).toBe('en');
    expect(validateConfig({ language: '' }).language).toBe('en');
    expect(validateConfig({ language: 123 }).language).toBe('en');
  });

  // ── forceLowSpec ──

  test('forceLowSpec true é preservado', () => {
    expect(validateConfig({ forceLowSpec: true }).forceLowSpec).toBe(true);
  });

  test('forceLowSpec false é preservado', () => {
    expect(validateConfig({ forceLowSpec: false }).forceLowSpec).toBe(false);
  });

  test('forceLowSpec undefined resulta undefined', () => {
    expect(validateConfig({}).forceLowSpec).toBeUndefined();
  });

  test('forceLowSpec com valor truthy não-booleano resulta undefined', () => {
    expect(validateConfig({ forceLowSpec: 'yes' }).forceLowSpec).toBeUndefined();
    expect(validateConfig({ forceLowSpec: 1 }).forceLowSpec).toBeUndefined();
  });

  // ── mutedEvents ──

  test('mutedEvents true é preservado', () => {
    expect(validateConfig({ mutedEvents: true }).mutedEvents).toBe(true);
  });

  test('mutedEvents false (explícito) é false', () => {
    expect(validateConfig({ mutedEvents: false }).mutedEvents).toBe(false);
  });

  test('mutedEvents undefined é false', () => {
    expect(validateConfig({}).mutedEvents).toBe(false);
  });

  // ── windowBounds ──

  test('windowBounds é preservado', () => {
    const bounds = { x: 100, y: 200, width: 800, height: 600 };
    expect(validateConfig({ windowBounds: bounds }).windowBounds).toEqual(bounds);
  });

  test('windowBounds null é null', () => {
    expect(validateConfig({ windowBounds: null }).windowBounds).toBeNull();
  });

  test('windowBounds undefined é null', () => {
    expect(validateConfig({}).windowBounds).toBeNull();
  });

  // ── firstBoot (v5.13.0: setup wizard removed, firstBoot is always false) ──

  test('firstBoot default é false (v5.13.0: setup wizard skipped)', () => {
    expect(validateConfig({}).firstBoot).toBe(false);
  });

  test('firstBoot false é preservado', () => {
    expect(validateConfig({ firstBoot: false }).firstBoot).toBe(false);
  });

  test('firstBoot true é forçado para false (v5.13.0: setup disabled)', () => {
    expect(validateConfig({ firstBoot: true }).firstBoot).toBe(false);
  });

  // ── advancedMode ──

  test('advancedMode default é false', () => {
    expect(validateConfig({}).advancedMode).toBe(false);
  });

  test('advancedMode true é preservado', () => {
    expect(validateConfig({ advancedMode: true }).advancedMode).toBe(true);
  });

  test('advancedMode com valor não-booleano é false', () => {
    expect(validateConfig({ advancedMode: 'yes' }).advancedMode).toBe(false);
  });
});

describe('settings.js - loadConfig', () => {
  test('retorna defaults quando arquivo não existe', () => {
    mockExistsSync.mockReturnValue(false);
    const config = loadConfig();
    expect(config.region).toBe('br');
    expect(config.hardwareProfile).toBe('modern');
  });

  test('lê e valida config do arquivo', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        region: 'en',
        hardwareProfile: 'legacy',
        language: 'en',
        advancedMode: true
      })
    );
    const config = loadConfig();
    // 'en' is a legacy code, normalized to 'na'
    expect(config.region).toBe('na');
    expect(config.hardwareProfile).toBe('legacy');
    expect(config.language).toBe('en');
    expect(config.advancedMode).toBe(true);
  });

  test('rejeita arquivo config > 1MB (OOM protection)', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 2 * 1024 * 1024 }); // 2MB
    const config = loadConfig();
    expect(config.region).toBe('br'); // fallback defaults
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  test('aceita arquivo config de exatamente 1MB', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 1 * 1024 * 1024 }); // exactly 1MB
    mockReadFileSync.mockReturnValue(JSON.stringify({ region: 'fr' }));
    const config = loadConfig();
    expect(config.region).toBe('fr');
  });

  test('retorna defaults para JSON inválido', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 512 });
    mockReadFileSync.mockReturnValue('not json{{{');
    const config = loadConfig();
    expect(config.region).toBe('br');
  });

  test('retorna defaults quando readFileSync lança erro', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 512 });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    const config = loadConfig();
    expect(config.region).toBe('br');
  });

  test('sanitiza valores inválidos do arquivo', () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 512 });
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        region: 'invalid_region',
        hardwareProfile: 'unknown_profile',
        language: 'ru'
      })
    );
    const config = loadConfig();
    expect(config.region).toBe('br');
    expect(config.hardwareProfile).toBe('modern');
    // v5.13.0: invalid language now falls back to 'en' (was 'pt')
    expect(config.language).toBe('en');
  });
});

describe('settings.js - saveConfig', () => {
  test('escreve config como JSON com indentação', () => {
    const result = saveConfig({
      region: 'br',
      hardwareProfile: 'modern',
      language: 'pt'
    });
    expect(result).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    expect(mockRenameSync).toHaveBeenCalledTimes(1);

    // Verifica que escreveu JSON válido
    const written = mockWriteFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.region).toBe('br');
    expect(parsed.language).toBe('pt');
  });

  test('usa atomic write (tmp + rename)', () => {
    saveConfig({ region: 'br', hardwareProfile: 'modern' });
    const tmpPath = mockWriteFileSync.mock.calls[0][0];
    const destPath = mockRenameSync.mock.calls[0][1];
    expect(tmpPath).toMatch(/\.tmp$/);
    expect(destPath).not.toMatch(/\.tmp$/);
    // rename moves tmp → original
    expect(mockRenameSync).toHaveBeenCalledWith(tmpPath, destPath);
  });

  test('retorna false em erro de escrita', () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    const result = saveConfig({ region: 'br' });
    expect(result).toBe(false);
  });

  test('windowBounds null é serializado como null', () => {
    saveConfig({
      region: 'br',
      hardwareProfile: 'modern',
      windowBounds: null
    });
    const written = mockWriteFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.windowBounds).toBeNull();
  });

  test('firstBoot false é preservado no save', () => {
    saveConfig({
      region: 'br',
      hardwareProfile: 'modern',
      firstBoot: false
    });
    const written = mockWriteFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.firstBoot).toBe(false);
  });

  test('firstBoot true (default) é forçado para false no save (v5.13.0)', () => {
    saveConfig({
      region: 'br',
      hardwareProfile: 'modern',
      firstBoot: true
    });
    const written = mockWriteFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    // v5.13.0: firstBoot is hardcoded to false (setup wizard removed)
    expect(parsed.firstBoot).toBe(false);
  });

  test('language default en é salvo corretamente (v5.13.0)', () => {
    saveConfig({ region: 'br', hardwareProfile: 'modern' });
    const written = mockWriteFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    // v5.13.0: default language is now 'en' (was 'pt')
    expect(parsed.language).toBe('en');
  });

  test('não inclui propriedades extras', () => {
    saveConfig({
      region: 'br',
      hardwareProfile: 'modern',
      extraField: 'should not be saved'
    });
    const written = mockWriteFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed).not.toHaveProperty('extraField');
  });
});
