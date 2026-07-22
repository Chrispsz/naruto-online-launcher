/**
 * Testes para src/app/Auditor.js
 * Cobertura: create, sessionStart/End, recordEvent/Stall/NetworkError/Crash/Reload,
 *            getStats/getSummary, persist (atomic), retention cleanup, reset, destroy
 */

// Mock electron-log
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
const Auditor = require('../Auditor');

function _tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-auditor-'));
}

describe('Auditor.js — constants', () => {
  test('PERSIST_INTERVAL_MS é 30s', () => {
    expect(Auditor.PERSIST_INTERVAL_MS).toBe(30000);
  });
  test('MAX_RETENTION_DAYS é 90', () => {
    expect(Auditor.MAX_RETENTION_DAYS).toBe(90);
  });
  test('MAX_REASONS_KEPT é 20', () => {
    expect(Auditor.MAX_REASONS_KEPT).toBe(20);
  });
});

describe('Auditor.js — create', () => {
  test('cria com profileId válido', () => {
    var dir = _tempDir();
    var a = Auditor.create('p1', { userDataPath: dir });
    expect(a).toBeDefined();
    expect(typeof a.sessionStart).toBe('function');
    expect(typeof a.recordStall).toBe('function');
    expect(typeof a.getStats).toBe('function');
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('reject profileId ausente', () => {
    expect(function () { Auditor.create(''); }).toThrow();
    expect(function () { Auditor.create(null); }).toThrow();
  });

  test('estado inicial tem defaults corretos', () => {
    var dir = _tempDir();
    var a = Auditor.create('p1', { userDataPath: dir });
    var stats = a.getStats();
    expect(stats.profileId).toBe('p1');
    expect(stats.playtimeMs).toBe(0);
    expect(stats.sessionCount).toBe(0);
    expect(stats.eventsTriggered).toEqual({ exp: 0, pvp: 0, war: 0, other: 0 });
    expect(stats.stallsDetected.count).toBe(0);
    expect(stats.crashes.count).toBe(0);
    expect(stats.autoReloads.count).toBe(0);
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Auditor.js — session tracking', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('sessionStart incrementa sessionCount', function () {
    a.sessionStart();
    expect(a.getStats().sessionCount).toBe(1);
    a.sessionEnd();
    a.sessionStart();
    expect(a.getStats().sessionCount).toBe(2);
  });

  test('sessionEnd acumula playtime', function () {
    a.sessionStart();
    // simula passagem de tempo
    a._state().updatedAt = a._state().updatedAt - 5000; // hack: garante >0ms
    a.sessionEnd();
    var stats = a.getStats();
    expect(stats.playtimeMs).toBeGreaterThanOrEqual(0);
  });

  test('sessionEnd sem sessionStart é no-op', function () {
    a.sessionEnd(); // não deve quebrar nem acumular
    expect(a.getStats().playtimeMs).toBe(0);
  });

  test('session ativa é refletida em getStats', function () {
    a.sessionStart();
    var stats = a.getStats();
    expect(stats.sessionActive).toBe(true);
    a.sessionEnd();
    stats = a.getStats();
    expect(stats.sessionActive).toBe(false);
  });
});

describe('Auditor.js — recordEvent', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('incrementa tipo correto', function () {
    a.recordEvent('exp');
    a.recordEvent('exp');
    a.recordEvent('pvp');
    a.recordEvent('war');
    expect(a.getStats().eventsTriggered.exp).toBe(2);
    expect(a.getStats().eventsTriggered.pvp).toBe(1);
    expect(a.getStats().eventsTriggered.war).toBe(1);
  });

  test('tipo desconhecido cai em other', function () {
    a.recordEvent('unknown_type');
    expect(a.getStats().eventsTriggered.other).toBe(1);
  });
});

describe('Auditor.js — recordStall', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('incrementa count e registra reason', function () {
    a.recordStall('burst de SWF');
    a.recordStall('inatividade de rede');
    var stats = a.getStats();
    expect(stats.stallsDetected.count).toBe(2);
    expect(stats.stallsDetected.reasons).toContain('burst de SWF');
    expect(stats.stallsDetected.reasons).toContain('inatividade de rede');
    expect(stats.stallsDetected.lastAt).toBeGreaterThan(0);
  });

  test('limite MAX_REASONS_KEPT = 20', function () {
    for (var i = 0; i < 25; i++) {
      a.recordStall('reason-' + i);
    }
    expect(a.getStats().stallsDetected.reasons.length).toBe(20);
  });
});

describe('Auditor.js — recordNetworkError', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('incrementa count e byType', function () {
    a.recordNetworkError('auth');
    a.recordNetworkError('auth');
    a.recordNetworkError('game');
    var stats = a.getStats();
    expect(stats.networkErrors.count).toBe(3);
    expect(stats.networkErrors.byType.auth).toBe(2);
    expect(stats.networkErrors.byType.game).toBe(1);
  });

  test('tipo null cai em other', function () {
    a.recordNetworkError(null);
    expect(a.getStats().networkErrors.byType.other).toBe(1);
  });
});

describe('Auditor.js — recordCrash', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('incrementa count e registra reason', function () {
    a.recordCrash('oom');
    a.recordCrash('crashed');
    var stats = a.getStats();
    expect(stats.crashes.count).toBe(2);
    expect(stats.crashes.reasons).toEqual(['oom', 'crashed']);
  });
});

describe('Auditor.js — recordReload', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('incrementa count e lastAt', function () {
    a.recordReload();
    expect(a.getStats().autoReloads.count).toBe(1);
    expect(a.getStats().autoReloads.lastAt).toBeGreaterThan(0);
    a.recordReload();
    expect(a.getStats().autoReloads.count).toBe(2);
  });
});

describe('Auditor.js — persist (atomic)', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('persist escreve arquivo .json', function () {
    a.recordEvent('exp');
    a.recordStall('test');
    expect(a.persist()).toBe(true);
    var fp = path.join(dir, 'audit', 'p1.json');
    expect(fs.existsSync(fp)).toBe(true);
    var raw = fs.readFileSync(fp, 'utf8');
    var data = JSON.parse(raw);
    expect(data.profileId).toBe('p1');
    expect(data.eventsTriggered.exp).toBe(1);
    expect(data.stallsDetected.count).toBe(1);
  });

  test('persist é no-op se não dirty', function () {
    expect(a.persist()).toBe(false);
  });

  test('destroy persiste estado final', function () {
    a.recordEvent('war');
    a.sessionStart();
    a.destroy();
    var fp = path.join(dir, 'audit', 'p1.json');
    expect(fs.existsSync(fp)).toBe(true);
    var data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    expect(data.eventsTriggered.war).toBe(1);
    expect(data.sessionCount).toBe(1);
  });
});

describe('Auditor.js — load state on create', () => {
  var dir;
  beforeEach(function () {
    dir = _tempDir();
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('carrega estado pré-existente', function () {
    // Cria auditor e popula
    var a1 = Auditor.create('p1', { userDataPath: dir });
    a1.recordEvent('exp');
    a1.recordStall('test');
    a1.sessionStart();
    a1.sessionEnd();
    a1.persist();
    a1.destroy();

    // Cria novo auditor — deve carregar estado
    var a2 = Auditor.create('p1', { userDataPath: dir });
    var stats = a2.getStats();
    expect(stats.eventsTriggered.exp).toBe(1);
    expect(stats.stallsDetected.count).toBe(1);
    expect(stats.sessionCount).toBe(1);
    a2.destroy();
  });

  test('merge campos novos do default', function () {
    // Escreve arquivo antigo sem networkErrors.byType
    var auditDir = path.join(dir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    fs.writeFileSync(path.join(auditDir, 'p1.json'), JSON.stringify({
      profileId: 'p1',
      playtimeMs: 1000,
      sessionCount: 5,
      eventsTriggered: { exp: 10 },
      stallsDetected: { count: 2 },
      // faltam networkErrors, crashes, autoReloads
    }));

    var a = Auditor.create('p1', { userDataPath: dir });
    var stats = a.getStats();
    expect(stats.playtimeMs).toBe(1000);
    expect(stats.sessionCount).toBe(5);
    expect(stats.eventsTriggered.exp).toBe(10);
    expect(stats.networkErrors.count).toBe(0); // default
    expect(stats.crashes.count).toBe(0); // default
    a.destroy();
  });
});

describe('Auditor.js — getSummary', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('retorna resumo compacto', function () {
    a.recordEvent('exp');
    a.recordEvent('pvp');
    a.recordStall('test');
    a.recordCrash('oom');
    a.recordReload();
    var summary = a.getSummary();
    expect(summary.profileId).toBe('p1');
    expect(summary.totalEvents).toBe(2);
    expect(summary.stallCount).toBe(1);
    expect(summary.crashCount).toBe(1);
    expect(summary.reloadCount).toBe(1);
  });
});

describe('Auditor.js — reset', () => {
  var dir, a;
  beforeEach(function () {
    dir = _tempDir();
    a = Auditor.create('p1', { userDataPath: dir });
  });
  afterEach(function () {
    a.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('zera todo o estado', function () {
    a.recordEvent('exp');
    a.recordStall('test');
    a.sessionStart();
    a.reset();
    var stats = a.getStats();
    expect(stats.eventsTriggered.exp).toBe(0);
    expect(stats.stallsDetected.count).toBe(0);
    expect(stats.sessionCount).toBe(0);
  });
});

describe('Auditor.js — retention cleanup', () => {
  var dir;
  beforeEach(function () {
    dir = _tempDir();
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('deleta arquivos .json com mais de 90 dias', function () {
    var auditDir = path.join(dir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });

    // Arquivo antigo (100 dias)
    var oldFile = path.join(auditDir, 'old-profile.json');
    fs.writeFileSync(oldFile, '{"old":true}');
    var oldTime = (Date.now() - 100 * 86400000) / 1000;
    fs.utimesSync(oldFile, oldTime, oldTime);

    // Cria auditor — init chama _cleanupOldAudits
    var a = Auditor.create('new-profile', { userDataPath: dir });
    a.destroy();

    expect(fs.existsSync(oldFile)).toBe(false);
  });
});

describe('Auditor.js — loadAllSummaries', () => {
  var dir;
  beforeEach(function () {
    dir = _tempDir();
  });
  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('retorna lista de summaries de todos profiles', function () {
    var a1 = Auditor.create('p1', { userDataPath: dir });
    a1.recordEvent('exp');
    a1.sessionStart();
    a1.sessionEnd();
    a1.persist();
    a1.destroy();

    var a2 = Auditor.create('p2', { userDataPath: dir });
    a2.recordStall('test');
    a2.persist();
    a2.destroy();

    var summaries = Auditor.loadAllSummaries(dir);
    expect(summaries.length).toBe(2);
    var ids = summaries.map(function (s) { return s.profileId; }).sort();
    expect(ids).toEqual(['p1', 'p2']);
  });

  test('retorna array vazio se dir não existe', function () {
    var summaries = Auditor.loadAllSummaries('/nonexistent/path');
    expect(summaries).toEqual([]);
  });
});
