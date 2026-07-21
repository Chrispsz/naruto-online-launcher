/**
 * Testes para src/network/inspector.js
 * Cobertura: create, classify, tryExtractJwt, record, enable/disable, getEntries, getStats, on, clear
 */

// Mock electron-log (must match logger.js expectations)
jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  silly: jest.fn(),
  verbose: jest.fn(),
  transports: {
    file: { level: 'info', fileName: 'main.log', format: null },
    console: { level: 'debug', format: null }
  },
  level: 'info',
  log: jest.fn()
}));

// Mock jwt module
jest.mock('../../utils/jwt', () => ({
  decode: jest.fn()
}));

const jwt = require('../../utils/jwt');
const inspector = require('../inspector');
const { KNOWN_ENDPOINTS } = inspector;

// Helper: create a mock session
function mockSession() {
  const handlers = {};
  return {
    webRequest: {
      // Electron 11: onBeforeRequest(filter, cb) ou onBeforeRequest(cb).
      // O inspector agora usa filter-based registration.
      onBeforeRequest: jest.fn((arg1, arg2) => {
        const cb = typeof arg2 === 'function' ? arg2 : typeof arg1 === 'function' ? arg1 : null;
        if (cb) handlers.onBeforeRequest = cb;
      }),
      onResponseStarted: jest.fn((arg1, arg2) => {
        const cb = typeof arg2 === 'function' ? arg2 : typeof arg1 === 'function' ? arg1 : null;
        if (cb) handlers.onResponseStarted = cb;
      }),
      _handlers: handlers
    }
  };
}

describe('inspector.js - KNOWN_ENDPOINTS', () => {
  test('contém endpoints conhecidos', () => {
    expect(KNOWN_ENDPOINTS['passport.oasgames.com']).toBeDefined();
    expect(KNOWN_ENDPOINTS['odp3.oasgames.com']).toBeDefined();
    expect(KNOWN_ENDPOINTS['naruto-pl.oasgames.com']).toBeDefined();
  });

  test('cada endpoint tem type e label', () => {
    Object.keys(KNOWN_ENDPOINTS).forEach(domain => {
      expect(KNOWN_ENDPOINTS[domain].type).toBeDefined();
      expect(KNOWN_ENDPOINTS[domain].label).toBeDefined();
    });
  });
});

describe('inspector.js - create', () => {
  let insp;

  beforeEach(() => {
    const session = mockSession();
    insp = inspector.create(session, 'test-profile-1');
    jwt.decode.mockClear();
  });

  test('retorna objeto com métodos esperados', () => {
    expect(typeof insp.enable).toBe('function');
    expect(typeof insp.disable).toBe('function');
    expect(typeof insp.isEnabled).toBe('function');
    expect(typeof insp.getEntries).toBe('function');
    expect(typeof insp.getStats).toBe('function');
    expect(typeof insp.on).toBe('function');
    expect(typeof insp.clear).toBe('function');
    expect(insp.profileId).toBe('test-profile-1');
  });

  test('isEnabled retorna false antes de enable()', () => {
    expect(insp.isEnabled()).toBe(false);
  });

  test('isEnabled retorna true depois de enable()', () => {
    insp.enable();
    expect(insp.isEnabled()).toBe(true);
  });

  test('enable() é idempotente', () => {
    const session = mockSession();
    const insp2 = inspector.create(session, 'test-profile-2');
    insp2.enable();
    insp2.enable(); // segunda chamada
    expect(session.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1);
  });

  test('disable() desativa inspector', () => {
    insp.enable();
    insp.disable();
    expect(insp.isEnabled()).toBe(false);
  });

  test('disable() é idempotente', () => {
    insp.enable();
    insp.disable();
    insp.disable(); // segunda chamada sem erro
    expect(insp.isEnabled()).toBe(false);
  });
});

describe('inspector.js - getEntries', () => {
  let session;
  let insp;

  beforeEach(() => {
    session = mockSession();
    insp = inspector.create(session, 'test-entry');
    jwt.decode.mockClear();
  });

  test('retorna array vazio antes de qualquer captura', () => {
    expect(insp.getEntries()).toEqual([]);
  });

  test('retorna todas entries sem filtro', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://example.com/test',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'mainFrame'
    });
    session.webRequest._handlers.onBeforeRequest({
      id: 2,
      url: 'https://passport.oasgames.com/login',
      method: 'POST',
      timestamp: Date.now(),
      requestHeaders: {},
      resourceType: 'xhr'
    });
    expect(insp.getEntries().length).toBe(2);
  });

  test('filtra por type', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/login',
      method: 'POST',
      timestamp: Date.now(),
      requestHeaders: {},
      resourceType: 'xhr'
    });
    session.webRequest._handlers.onBeforeRequest({
      id: 2,
      url: 'https://other.com/page',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'mainFrame'
    });
    const authEntries = insp.getEntries({ type: 'auth' });
    expect(authEntries.length).toBe(1);
    expect(authEntries[0].type).toBe('auth');
  });

  test('filtra por kind', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://example.com/a',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });
    session.webRequest._handlers.onResponseStarted({
      id: 1,
      url: 'https://example.com/a',
      method: 'GET',
      timestamp: Date.now(),
      statusCode: 200,
      resourceType: 'script'
    });
    const responses = insp.getEntries({ kind: 'response' });
    expect(responses.length).toBe(1);
    expect(responses[0].kind).toBe('response');
  });

  test('filtra por domain', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/a',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'xhr'
    });
    session.webRequest._handlers.onBeforeRequest({
      id: 2,
      url: 'https://other.com/b',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });
    const entries = insp.getEntries({ domain: 'passport.oasgames.com' });
    expect(entries.length).toBe(1);
    expect(entries[0].domain).toBe('passport.oasgames.com');
  });

  test('filtro composto (type + kind)', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/a',
      method: 'GET',
      timestamp: Date.now(),
      requestHeaders: {},
      resourceType: 'xhr'
    });
    session.webRequest._handlers.onResponseStarted({
      id: 1,
      url: 'https://passport.oasgames.com/a',
      method: 'GET',
      timestamp: Date.now(),
      statusCode: 200,
      resourceType: 'xhr'
    });
    const entries = insp.getEntries({ type: 'auth', kind: 'response' });
    expect(entries.length).toBe(1);
  });

  test('filtro sem match retorna array vazio', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://example.com/a',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });
    expect(insp.getEntries({ type: 'auth' })).toEqual([]);
  });
});

describe('inspector.js - getStats', () => {
  let session;
  let insp;

  beforeEach(() => {
    session = mockSession();
    insp = inspector.create(session, 'test-stats');
  });

  test('retorna stats iniciais', () => {
    const stats = insp.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.entriesCount).toBe(0);
    expect(typeof stats.uptime).toBe('number');
    expect(typeof stats.requestsPerMin).toBe('number');
  });

  test('totalRequests incrementa com cada captura', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://a.com/x',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });
    session.webRequest._handlers.onBeforeRequest({
      id: 2,
      url: 'https://b.com/y',
      method: 'POST',
      timestamp: Date.now(),
      resourceType: 'xhr'
    });
    const stats = insp.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.entriesCount).toBe(2);
  });

  test('byType conta tipos corretamente', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/login',
      method: 'POST',
      timestamp: Date.now(),
      requestHeaders: {},
      resourceType: 'xhr'
    });
    session.webRequest._handlers.onBeforeRequest({
      id: 2,
      url: 'https://unknown.com/page',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'mainFrame'
    });
    const stats = insp.getStats();
    expect(stats.byType.auth).toBe(1);
    expect(stats.byType.other).toBe(1);
  });

  test('stats é uma cópia (não referência)', () => {
    insp.enable();
    const stats1 = insp.getStats();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://a.com/x',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });
    const stats2 = insp.getStats();
    expect(stats1.totalRequests).toBe(0);
    expect(stats2.totalRequests).toBe(1);
  });
});

describe('inspector.js - on (capture event)', () => {
  let session;
  let insp;

  beforeEach(() => {
    session = mockSession();
    insp = inspector.create(session, 'test-on');
  });

  test('callback é chamado em cada captura', () => {
    const cb = jest.fn();
    insp.on('capture', cb);
    insp.enable();

    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://example.com/test',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toHaveProperty('url');
    expect(cb.mock.calls[0][0]).toHaveProperty('type');
  });

  test('erro no callback não quebra o inspector', () => {
    const cb = jest.fn(() => {
      throw new Error('cb error');
    });
    insp.on('capture', cb);
    insp.enable();

    // Should not throw
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://example.com/test',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });

    expect(cb).toHaveBeenCalled();
  });

  test('eventos ignorados (não "capture") são ignorados', () => {
    const cb = jest.fn();
    insp.on('other', cb);
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://example.com/test',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });
    expect(cb).not.toHaveBeenCalled();
  });

  test('múltiplos listeners são chamados', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    insp.on('capture', cb1);
    insp.on('capture', cb2);
    insp.enable();

    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://example.com/test',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

describe('inspector.js - clear', () => {
  let session;
  let insp;

  beforeEach(() => {
    session = mockSession();
    insp = inspector.create(session, 'test-clear');
  });

  test('clear reseta entries e stats', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/a',
      method: 'GET',
      timestamp: Date.now(),
      requestHeaders: { Cookie: 'oas_user=test123' },
      resourceType: 'xhr'
    });
    expect(insp.getEntries().length).toBe(1);
    expect(insp.getStats().totalRequests).toBe(1);

    insp.clear();

    expect(insp.getEntries()).toEqual([]);
    expect(insp.getStats().totalRequests).toBe(0);
    expect(insp.getStats().entriesCount).toBe(0);
  });

  test('clear reseta capturedCookies e capturedJwts', () => {
    insp.enable();
    jwt.decode.mockReturnValue({ sub: 'test' });
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/a',
      method: 'GET',
      timestamp: Date.now(),
      requestHeaders: { Cookie: 'oas_user=abcdef1234567890abcdef1234567890abcdef12' },
      resourceType: 'xhr'
    });

    let stats = insp.getStats();
    expect(stats.capturedCookies.length).toBe(1);

    insp.clear();
    stats = insp.getStats();
    expect(stats.capturedCookies).toEqual([]);
    expect(stats.capturedJwts).toEqual([]);
  });
});

describe('inspector.js - JWT extraction', () => {
  let session;
  let insp;

  beforeEach(() => {
    session = mockSession();
    insp = inspector.create(session, 'test-jwt');
    jwt.decode.mockClear();
  });

  test('extrai JWT de cookie oas_user em auth requests', () => {
    jwt.decode.mockReturnValue({ sub: 'user1', exp: 999 });
    insp.enable();

    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/login',
      method: 'POST',
      timestamp: Date.now(),
      requestHeaders: { Cookie: 'oas_user=mytoken123' },
      resourceType: 'xhr'
    });

    expect(jwt.decode).toHaveBeenCalledWith('mytoken123');
    const stats = insp.getStats();
    expect(stats.capturedJwts).toContain('mytoken123');
    expect(stats.capturedCookies.length).toBe(1);
  });

  test('não extrai JWT de requests não-auth', () => {
    jwt.decode.mockReturnValue({ sub: 'user1' });
    insp.enable();

    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://unknown.com/page',
      method: 'GET',
      timestamp: Date.now(),
      requestHeaders: { Cookie: 'oas_user=mytoken' },
      resourceType: 'mainFrame'
    });

    expect(jwt.decode).not.toHaveBeenCalled();
  });

  test('não duplica JWT capturado no array', () => {
    jwt.decode.mockReturnValue({ sub: 'user1' });
    insp.enable();

    // Same token twice — decode is called both times, but only stored once
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/a',
      method: 'POST',
      timestamp: Date.now(),
      requestHeaders: { Cookie: 'oas_user=sametoken' },
      resourceType: 'xhr'
    });
    session.webRequest._handlers.onBeforeRequest({
      id: 2,
      url: 'https://passport.oasgames.com/a',
      method: 'POST',
      timestamp: Date.now(),
      requestHeaders: { Cookie: 'oas_user=sametoken' },
      resourceType: 'xhr'
    });

    // decode IS called twice (dedup check is after decode), but stored only once
    expect(jwt.decode).toHaveBeenCalledTimes(2);
    expect(insp.getStats().capturedJwts.length).toBe(1);
  });

  test('sem cookie header não tenta extrair JWT', () => {
    insp.enable();

    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/a',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'xhr'
    });

    expect(jwt.decode).not.toHaveBeenCalled();
  });
});

describe('inspector.js - classify (URL parsing)', () => {
  let session;
  let insp;

  beforeEach(() => {
    session = mockSession();
    insp = inspector.create(session, 'test-classify');
  });

  test('classifica passport como auth', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://passport.oasgames.com/api/login',
      method: 'POST',
      timestamp: Date.now(),
      resourceType: 'xhr'
    });
    expect(insp.getEntries()[0].type).toBe('auth');
  });

  test('classifica odp3 como api', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://odp3.oasgames.com/servers',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'xhr'
    });
    expect(insp.getEntries()[0].type).toBe('api');
  });

  test('classifica naruto-pl como game', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://naruto-pl.oasgames.com/game',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'xhr'
    });
    expect(insp.getEntries()[0].type).toBe('game');
  });

  test('classifica URL inválida como other', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'not-a-valid-url',
      method: 'GET',
      timestamp: Date.now(),
      resourceType: 'script'
    });
    expect(insp.getEntries()[0].type).toBe('other');
  });

  test('subdomínio de conhecido é classificado', () => {
    insp.enable();
    session.webRequest._handlers.onBeforeRequest({
      id: 1,
      url: 'https://api.passport.oasgames.com/v1/auth',
      method: 'POST',
      timestamp: Date.now(),
      resourceType: 'xhr'
    });
    expect(insp.getEntries()[0].type).toBe('auth');
  });
});

describe('inspector.js - max entries (500)', () => {
  let session;
  let insp;

  beforeEach(() => {
    session = mockSession();
    insp = inspector.create(session, 'test-max');
  });

  test('entries são limitados a 500 (FIFO)', () => {
    insp.enable();
    // Send 510 requests
    for (let i = 0; i < 510; i++) {
      session.webRequest._handlers.onBeforeRequest({
        id: i,
        url: 'https://example.com/req/' + i,
        method: 'GET',
        timestamp: Date.now(),
        resourceType: 'script'
      });
    }
    const entries = insp.getEntries();
    expect(entries.length).toBe(500);
    // First 10 should have been dropped
    expect(entries[0].url).toContain('/req/10');
  });
});
