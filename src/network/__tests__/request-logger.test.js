/**
 * Testes para src/network/request-logger.js
 * Cobertura: create, enable/disable, entry building, header redaction,
 *            file rotation, retention cleanup, settings update, queue flush
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

const fs = require('fs');
const path = require('path');
const os = require('os');
const requestLogger = require('../request-logger');

// Helper: create temp dir for test logs
function _tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-reqlog-'));
}

// Helper: create a mock session
function mockSession() {
  var handlers = {};
  return {
    webRequest: {
      onBeforeRequest: jest.fn(function (arg1, arg2) {
        var cb = typeof arg2 === 'function' ? arg2 : typeof arg1 === 'function' ? arg1 : null;
        if (cb) handlers.onBeforeRequest = cb;
      }),
      onResponseStarted: jest.fn(function (arg1, arg2) {
        var cb = typeof arg2 === 'function' ? arg2 : typeof arg1 === 'function' ? arg1 : null;
        if (cb) handlers.onResponseStarted = cb;
      }),
      _handlers: handlers
    }
  };
}

// Helper: create a fake request details object (Electron webRequest details)
function fakeDetails(overrides) {
  return Object.assign({
    id: 1,
    url: 'https://passport.oasgames.com/index.php?m=login',
    method: 'GET',
    timestamp: Date.now(),
    statusCode: null,
    resourceType: 'xhr',
    requestHeaders: { 'User-Agent': 'Shinobi/1.0', Cookie: 'oas_user=jwt_secret_here' },
    responseHeaders: null,
    fromCache: false,
    error: null
  }, overrides || {});
}

describe('request-logger.js — constants', () => {
  test('MAX_FILE_SIZE é 5MB', () => {
    expect(requestLogger.MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
  });
  test('RETENTION_DAYS é 3', () => {
    expect(requestLogger.RETENTION_DAYS).toBe(3);
  });
  test('REDACTED_HEADERS inclui cookie e authorization', () => {
    expect(requestLogger.REDACTED_HEADERS).toContain('cookie');
    expect(requestLogger.REDACTED_HEADERS).toContain('authorization');
    expect(requestLogger.REDACTED_HEADERS).toContain('set-cookie');
  });
});

describe('request-logger.js — create', () => {
  test('cria logger com profileId válido', () => {
    var dir = _tempDir();
    var rl = requestLogger.create('test-profile', { userDataPath: dir });
    expect(rl).toBeDefined();
    expect(typeof rl.enable).toBe('function');
    expect(typeof rl.disable).toBe('function');
    expect(typeof rl.getStats).toBe('function');
    expect(rl.isEnabled()).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('reject profileId ausente', () => {
    expect(function () { requestLogger.create(''); }).toThrow();
    expect(function () { requestLogger.create(null); }).toThrow();
    expect(function () { requestLogger.create(123); }).toThrow();
  });

  test('usa electron app.getPath se userDataPath não fornecido', () => {
    // Em ambiente de teste, electron pode estar disponível ou não.
    // Se disponível, deve funcionar. Se não, deve throw.
    try {
      var rl = requestLogger.create('p1');
      // Se não throw, electron estava disponível — tudo certo
      expect(rl).toBeDefined();
      rl.destroy();
    } catch (e) {
      // Se throw, mensagem deve mencionar userDataPath
      expect(e.message).toContain('userDataPath');
    }
  });
});

describe('request-logger.js — _redactHeaders', () => {
  var rl;
  beforeEach(function () {
    rl = requestLogger.create('p', { userDataPath: _tempDir() });
  });
  afterEach(function () {
    rl.destroy();
  });

  test('redacted Cookie, Authorization, set-cookie', function () {
    var out = rl._redactHeaders({
      'User-Agent': 'Shinobi/1.0',
      Cookie: 'oas_user=secret',
      Authorization: 'Bearer token123',
      'set-cookie': 'session=abc'
    });
    expect(out['User-Agent']).toBe('Shinobi/1.0');
    expect(out.Cookie).toBe('[REDACTED]');
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out['set-cookie']).toBe('[REDACTED]');
  });

  test('preserva headers não-sensíveis', function () {
    var out = rl._redactHeaders({ 'Content-Type': 'application/json', Accept: '*/*' });
    expect(out['Content-Type']).toBe('application/json');
    expect(out.Accept).toBe('*/*');
  });

  test('retorna null para input null', function () {
    expect(rl._redactHeaders(null)).toBeNull();
    expect(rl._redactHeaders(undefined)).toBeNull();
  });
});

describe('request-logger.js — _buildEntry', () => {
  var rl;
  beforeAll(function () {
    rl = requestLogger.create('p', { userDataPath: _tempDir() });
  });

  test('builda entry de request corretamente', function () {
    var details = fakeDetails();
    var entry = rl._buildEntry(details, 'request');
    expect(entry.kind).toBe('request');
    expect(entry.method).toBe('GET');
    expect(entry.url).toContain('passport.oasgames.com');
    expect(entry.status).toBeNull();
    expect(entry.reqHeaders.Cookie).toBe('[REDACTED]');
    expect(entry.resHeaders).toBeNull();
    expect(entry.fromCache).toBe(false);
    expect(entry.error).toBeNull();
  });

  test('builda entry de response com status e headers', function () {
    var details = fakeDetails({
      statusCode: 200,
      responseHeaders: { 'Content-Type': 'text/html', 'set-cookie': 'sess=xyz' }
    });
    var entry = rl._buildEntry(details, 'response');
    expect(entry.kind).toBe('response');
    expect(entry.status).toBe(200);
    expect(entry.resHeaders['Content-Type']).toBe('text/html');
    expect(entry.resHeaders['set-cookie']).toBe('[REDACTED]');
  });

  test('timestamp default é Date.now()', function () {
    var before = Date.now();
    var entry = rl._buildEntry(fakeDetails({ timestamp: null }), 'request');
    var after = Date.now();
    expect(entry.ts).toBeGreaterThanOrEqual(before);
    expect(entry.ts).toBeLessThanOrEqual(after);
  });
});

describe('request-logger.js — enable/disable', () => {
  var dir, rl;
  beforeEach(function () {
    dir = _tempDir();
    rl = requestLogger.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    rl.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('enable cria o diretório logs e o arquivo do dia', function () {
    rl.enable();
    expect(rl.isEnabled()).toBe(true);
    var logDir = path.join(dir, 'logs');
    expect(fs.existsSync(logDir)).toBe(true);
    var files = fs.readdirSync(logDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^p1-requests-\d{4}-\d{2}-\d{2}\.jsonl$/);
  });

  test('disable fecha o arquivo e drena a queue', function () {
    rl.enable();
    // Simula um request pra popular a queue
    rl._onBeforeRequest(fakeDetails());
    rl.disable();
    expect(rl.isEnabled()).toBe(false);
    // Arquivo deve ter conteúdo (pelo menos 1 linha)
    var files = fs.readdirSync(path.join(dir, 'logs'));
    var content = fs.readFileSync(path.join(dir, 'logs', files[0]), 'utf8');
    expect(content).toContain('"kind":"request"');
  });

  test('enable é idempotente', function () {
    rl.enable();
    rl.enable(); // não deve quebrar
    expect(rl.isEnabled()).toBe(true);
  });

  test('disable é idempotente', function () {
    rl.disable(); // sequer ligou — não deve quebrar
    expect(rl.isEnabled()).toBe(false);
  });
});

describe('request-logger.js — escrita no arquivo', () => {
  var dir, rl;
  beforeEach(function () {
    dir = _tempDir();
    rl = requestLogger.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    rl.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('onBeforeRequest escreve JSONL válido', function () {
    rl.enable();
    rl._onBeforeRequest(fakeDetails({ id: 42, url: 'https://example.com/api' }));
    rl.disable(); // flush

    var files = fs.readdirSync(path.join(dir, 'logs'));
    var content = fs.readFileSync(path.join(dir, 'logs', files[0]), 'utf8');
    var lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    var entry = JSON.parse(lines[0]);
    expect(entry.id).toBe(42);
    expect(entry.url).toBe('https://example.com/api');
    expect(entry.kind).toBe('request');
  });

  test('onResponseStarted escreve JSONL com status', function () {
    rl.enable();
    rl._onResponseStarted(fakeDetails({
      id: 7,
      statusCode: 200,
      responseHeaders: { 'Content-Type': 'application/json' }
    }));
    rl.disable();

    var files = fs.readdirSync(path.join(dir, 'logs'));
    var content = fs.readFileSync(path.join(dir, 'logs', files[0]), 'utf8');
    var entry = JSON.parse(content.trim());
    expect(entry.id).toBe(7);
    expect(entry.kind).toBe('response');
    expect(entry.status).toBe(200);
  });

  test('múltiplos requests viram múltiplas linhas JSONL', function () {
    rl.enable();
    for (var i = 0; i < 5; i++) {
      rl._onBeforeRequest(fakeDetails({ id: i }));
    }
    rl.disable();

    var files = fs.readdirSync(path.join(dir, 'logs'));
    var content = fs.readFileSync(path.join(dir, 'logs', files[0]), 'utf8');
    var lines = content.trim().split('\n');
    expect(lines.length).toBe(5);
    // Cada linha é JSON válido
    lines.forEach(function (line) {
      expect(function () { JSON.parse(line); }).not.toThrow();
    });
  });
});

describe('request-logger.js — updateSettings', () => {
  var dir, rl;
  beforeEach(function () {
    dir = _tempDir();
    rl = requestLogger.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    rl.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('updateSettings(true) liga o logger', function () {
    rl.updateSettings(true);
    expect(rl.isEnabled()).toBe(true);
  });

  test('updateSettings(false) desliga o logger', function () {
    rl.updateSettings(true);
    rl.updateSettings(false);
    expect(rl.isEnabled()).toBe(false);
  });

  test('updateSettings com mesmo valor é no-op', function () {
    rl.updateSettings(true);
    rl.updateSettings(true);
    expect(rl.isEnabled()).toBe(true);
  });
});

describe('request-logger.js — retention cleanup', () => {
  var dir, rl;
  beforeEach(function () {
    dir = _tempDir();
    rl = requestLogger.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    rl.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('deleta logs com mais de RETENTION_DAYS', function () {
    var logDir = path.join(dir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    // Cria arquivo "antigo" (5 dias atrás)
    var oldDate = new Date(Date.now() - 5 * 86400000);
    var oldDateStr = oldDate.getFullYear() + '-' +
      String(oldDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(oldDate.getDate()).padStart(2, '0');
    var oldFile = path.join(logDir, 'p1-requests-' + oldDateStr + '.jsonl');
    fs.writeFileSync(oldFile, '{"old":true}\n');

    // Mtime precisa ser antigo tb
    var oldTime = (Date.now() - 5 * 86400000) / 1000;
    fs.utimesSync(oldFile, oldTime, oldTime);

    expect(fs.existsSync(oldFile)).toBe(true);

    // enable() chama _cleanupOldLogs()
    rl.enable();
    rl.disable();

    expect(fs.existsSync(oldFile)).toBe(false);
  });

  test('preserva logs de outro profile', function () {
    var logDir = path.join(dir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    var oldDate = new Date(Date.now() - 5 * 86400000);
    var oldDateStr = oldDate.getFullYear() + '-' +
      String(oldDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(oldDate.getDate()).padStart(2, '0');
    var otherFile = path.join(logDir, 'other-profile-requests-' + oldDateStr + '.jsonl');
    fs.writeFileSync(otherFile, '{"other":true}\n');
    var oldTime = (Date.now() - 5 * 86400000) / 1000;
    fs.utimesSync(otherFile, oldTime, oldTime);

    rl.enable();
    rl.disable();

    expect(fs.existsSync(otherFile)).toBe(true);
  });
});

describe('request-logger.js — getStats', () => {
  var dir, rl;
  beforeEach(function () {
    dir = _tempDir();
    rl = requestLogger.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    rl.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('retorna stats corretos', function () {
    var stats = rl.getStats();
    expect(stats.profileId).toBe('p1');
    expect(stats.enabled).toBe(false);
    expect(stats.queueLength).toBe(0);
    expect(stats.listenersAttached).toBe(false);

    rl.enable();
    stats = rl.getStats();
    expect(stats.enabled).toBe(true);
    expect(stats.filePath).toMatch(/p1-requests-\d{4}-\d{2}-\d{2}\.jsonl$/);
    expect(stats.listenersAttached).toBe(false); // não passamos session
  });
});

describe('request-logger.js — session listeners', () => {
  var dir, rl, ses;
  beforeEach(function () {
    dir = _tempDir();
    rl = requestLogger.create('p1', { userDataPath: dir });
    ses = mockSession();
  });
  afterEach(function () {
    rl.destroy(ses);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('enable(ses) anexa listeners na session', function () {
    rl.enable(ses);
    expect(ses.webRequest.onBeforeRequest).toHaveBeenCalled();
    expect(ses.webRequest.onResponseStarted).toHaveBeenCalled();
    expect(rl.getStats().listenersAttached).toBe(true);
  });

  test('disable(ses) desanexa listeners', function () {
    rl.enable(ses);
    rl.disable(ses);
    // onBeforeRequest chamado 2x (1 attach, 1 detach com null)
    expect(ses.webRequest.onBeforeRequest).toHaveBeenCalledTimes(2);
    expect(rl.getStats().listenersAttached).toBe(false);
  });
});
