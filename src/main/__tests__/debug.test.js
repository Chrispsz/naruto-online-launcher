/**
 * Testes para src/main/debug.js (Fase 3a — SHINOBI_DEBUG feature flag)
 */

describe('main/debug.js', () => {
  let origEnv;

  beforeEach(() => {
    origEnv = process.env.SHINOBI_DEBUG;
    jest.resetModules();
  });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.SHINOBI_DEBUG;
    else process.env.SHINOBI_DEBUG = origEnv;
    jest.resetModules();
  });

  function loadDebug() {
    return require('../debug');
  }

  test('DEBUG é false quando SHINOBI_DEBUG não está setado', () => {
    delete process.env.SHINOBI_DEBUG;
    const d = loadDebug();
    expect(d.DEBUG).toBe(false);
    expect(d.isEnabled()).toBe(false);
  });

  test('DEBUG é true quando SHINOBI_DEBUG=1', () => {
    process.env.SHINOBI_DEBUG = '1';
    const d = loadDebug();
    expect(d.DEBUG).toBe(true);
    expect(d.isEnabled()).toBe(true);
  });

  test('DEBUG é true quando SHINOBI_DEBUG=true', () => {
    process.env.SHINOBI_DEBUG = 'true';
    const d = loadDebug();
    expect(d.DEBUG).toBe(true);
  });

  test('DEBUG é false para valores inválidos', () => {
    process.env.SHINOBI_DEBUG = '0';
    expect(loadDebug().DEBUG).toBe(false);
    process.env.SHINOBI_DEBUG = 'false';
    expect(loadDebug().DEBUG).toBe(false);
    process.env.SHINOBI_DEBUG = 'yes';
    expect(loadDebug().DEBUG).toBe(false);
  });

  test('isEnabled() retorna boolean', () => {
    delete process.env.SHINOBI_DEBUG;
    expect(typeof loadDebug().isEnabled()).toBe('boolean');
  });
});
