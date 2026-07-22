/**
 * app/Auditor.js — Coleta de metadata de sessão por profile (Phase 1, sem UI)
 *
 * Objetivo: registrar metricas de uso e eventos de cada profile, em memoria +
 * persistir em userData/audit/<profileId>.json. Permite analise post-mortem
 * de稳定性, performance e padroes de uso.
 *
 * Metadata coletada:
 *   - playtimeMs: tempo total (ms) com janela de jogo aberta
 *   - sessionCount: número de sessões (cada attach = 1 sessão)
 *   - eventsTriggered: { exp: N, pvp: N, war: N, other: N }
 *   - stallsDetected: { count: N, lastAt: ts, reasons: [] }
 *   - networkErrors: { count: N, byType: { auth: N, game: N, ... } }
 *   - crashes: { count: N, reasons: [] }
 *   - autoReloads: { count: N, lastAt: ts }
 *
 * Phase 1: SEM UI. So coleta + persistencia. UI virá em Phase 2.
 *
 * Persistencia:
 *   - Throttled: persiste a cada PERSIST_INTERVAL_MS (30s) se dirty
 *   - Atomic write: tmp + rename
 *   - Retention: max 90 dias (cargas antigas sao deletadas no init)
 *
 * Integração (hooks externos chamam Auditor.record*):
 *   - SessionLifecycle.attach() → auditor.sessionStart()
 *   - SessionLifecycle close handler → auditor.sessionEnd()
 *   - StallDetector.triggerStall() → auditor.recordStall(reason)
 *   - EventTimers.fire() → auditor.recordEvent(type)
 *   - SessionLifecycle render-process-gone → auditor.recordCrash(reason)
 *   - SessionLifecycle auto-reload → auditor.recordReload()
 */

'use strict';

var fs = require('fs');
var path = require('path');
var logger = require('../utils/logger');

var PERSIST_INTERVAL_MS = 30000; // 30s
var MAX_RETENTION_DAYS = 90;
var MAX_REASONS_KEPT = 20; // limita array de reasons pra não crescer indefinidamente

/**
 * Cria um Auditor para um profile.
 * @param {string} profileId
 * @param {Object} [opts] - { userDataPath (string), now (fn p/ testes) }
 * @returns {Object} auditor instance
 */
function create(profileId, opts) {
  if (typeof profileId !== 'string' || !profileId) {
    throw new Error('Auditor: profileId obrigatorio');
  }
  opts = opts || {};

  var _userDataPath = opts.userDataPath;
  if (!_userDataPath) {
    try {
      var { app } = require('electron');
      _userDataPath = app.getPath('userData');
    } catch (e) {
      throw new Error('Auditor: userDataPath obrigatorio quando Electron indisponivel');
    }
  }

  var _now = opts.now || function () { return Date.now(); };

  // Estado em memória (carregado do disco se existir)
  var _state = _loadInitialState();
  var _dirty = false;
  var _persistTimer = null;
  var _sessionStartTs = null;
  var _destroyed = false;

  // ── Estado interno ──
  function _loadInitialState() {
    var defaultState = {
      profileId: profileId,
      createdAt: _now(),
      updatedAt: _now(),
      playtimeMs: 0,
      sessionCount: 0,
      eventsTriggered: { exp: 0, pvp: 0, war: 0, other: 0 },
      stallsDetected: { count: 0, lastAt: null, reasons: [] },
      networkErrors: { count: 0, byType: {} },
      crashes: { count: 0, reasons: [] },
      autoReloads: { count: 0, lastAt: null }
    };

    var fp = _getFilePath();
    try {
      if (!fs.existsSync(fp)) return defaultState;
      var raw = fs.readFileSync(fp, 'utf8');
      var loaded = JSON.parse(raw);
      // Merge: campos novos no default não sobrescrevem os carregados
      var merged = Object.assign({}, defaultState, loaded);
      merged.eventsTriggered = Object.assign(defaultState.eventsTriggered, loaded.eventsTriggered || {});
      merged.stallsDetected = Object.assign(defaultState.stallsDetected, loaded.stallsDetected || {});
      merged.networkErrors = Object.assign(defaultState.networkErrors, loaded.networkErrors || {});
      merged.crashes = Object.assign(defaultState.crashes, loaded.crashes || {});
      merged.autoReloads = Object.assign(defaultState.autoReloads, loaded.autoReloads || {});
      merged.profileId = profileId; // garante
      return merged;
    } catch (e) {
      logger.warn('Auditor: falhou load de ' + fp + ' — ' + e.message + ' (usando default)');
      return defaultState;
    }
  }

  function _getAuditDir() {
    return path.join(_userDataPath, 'audit');
  }

  function _getFilePath() {
    return path.join(_getAuditDir(), profileId + '.json');
  }

  function _ensureAuditDir() {
    var dir = _getAuditDir();
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return true;
    } catch (e) {
      logger.error('Auditor: nao criou dir ' + dir + ' — ' + e.message);
      return false;
    }
  }

  function _markDirty() {
    _dirty = true;
    _state.updatedAt = _now();
  }

  /**
   * Persiste o estado em disco (atomic: tmp + rename).
   * Chamado pelo timer throttled ou no destroy.
   * Nota: _destroyed não bloqueia persist — destroy() precisa persistir
   * estado final. O guard contra double-persist é _dirty (resetado após write).
   */
  function persist() {
    if (!_dirty) return false;
    if (!_ensureAuditDir()) return false;

    var fp = _getFilePath();
    var tmp = fp + '.tmp';
    try {
      var data = JSON.stringify(_state, null, 2);
      fs.writeFileSync(tmp, data, 'utf8');
      fs.renameSync(tmp, fp);
      _dirty = false;
      return true;
    } catch (e) {
      logger.error('Auditor: persist falhou (' + profileId + ') — ' + e.message);
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* best-effort cleanup */ }
      return false;
    }
  }

  /**
   * Inicia o timer de persistência throttled.
   */
  function startPersistTimer() {
    if (_persistTimer) return;
    _persistTimer = setInterval(function () {
      if (_dirty) persist();
    }, PERSIST_INTERVAL_MS);
    if (_persistTimer.unref) _persistTimer.unref();
  }

  function stopPersistTimer() {
    if (_persistTimer) {
      clearInterval(_persistTimer);
      _persistTimer = null;
    }
  }

  // ── Public API: recording methods ──

  /**
   * Registra início de sessão (janela de jogo aberta).
   */
  function sessionStart() {
    _state.sessionCount++;
    _sessionStartTs = _now();
    _markDirty();
    logger.debug('Auditor: sessionStart — ' + profileId + ' (#' + _state.sessionCount + ')');
  }

  /**
   * Registra fim de sessão (janela fechada). Acumula playtime.
   */
  function sessionEnd() {
    if (_sessionStartTs !== null) {
      var duration = _now() - _sessionStartTs;
      _state.playtimeMs += duration;
      _sessionStartTs = null;
      _markDirty();
      logger.debug('Auditor: sessionEnd — ' + profileId + ' (+ ' + duration + 'ms)');
    }
  }

  /**
   * Registra um evento disparado (exp/pvp/war/other).
   * @param {string} type - exp|pvp|war|other
   */
  function recordEvent(type) {
    if (!Object.prototype.hasOwnProperty.call(_state.eventsTriggered, type)) type = 'other';
    _state.eventsTriggered[type]++;
    _markDirty();
  }

  /**
   * Registra um stall detectado pelo StallDetector.
   * @param {string} reason - motivo do stall
   */
  function recordStall(reason) {
    _state.stallsDetected.count++;
    _state.stallsDetected.lastAt = _now();
    _state.stallsDetected.reasons.push(reason || 'unknown');
    if (_state.stallsDetected.reasons.length > MAX_REASONS_KEPT) {
      _state.stallsDetected.reasons.shift();
    }
    _markDirty();
  }

  /**
   * Registra um erro de rede.
   * @param {string} type - auth|game|api|other
   */
  function recordNetworkError(type) {
    _state.networkErrors.count++;
    type = type || 'other';
    _state.networkErrors.byType[type] = (_state.networkErrors.byType[type] || 0) + 1;
    _markDirty();
  }

  /**
   * Registra um crash do render process.
   * @param {string} reason - reason do render-process-gone
   */
  function recordCrash(reason) {
    _state.crashes.count++;
    _state.crashes.reasons.push(reason || 'unknown');
    if (_state.crashes.reasons.length > MAX_REASONS_KEPT) {
      _state.crashes.reasons.shift();
    }
    _markDirty();
  }

  /**
   * Registra um auto-reload (StallDetector ou crash recovery).
   */
  function recordReload() {
    _state.autoReloads.count++;
    _state.autoReloads.lastAt = _now();
    _markDirty();
  }

  // ── Public API: query methods ──

  /**
   * Retorna snapshot do estado (cópia profunda).
   */
  function getStats() {
    // Se sessão ativa, inclui playtime corrente
    var currentPlaytime = _state.playtimeMs;
    if (_sessionStartTs !== null) {
      currentPlaytime += _now() - _sessionStartTs;
    }
    return JSON.parse(JSON.stringify(Object.assign({}, _state, {
      playtimeMs: currentPlaytime,
      sessionActive: _sessionStartTs !== null
    })));
  }

  /**
   * Retorna resumo compacto (para IPC/UI futura).
   */
  function getSummary() {
    var s = getStats();
    return {
      profileId: s.profileId,
      playtimeMinutes: Math.round(s.playtimeMs / 60000),
      sessionCount: s.sessionCount,
      totalEvents: s.eventsTriggered.exp + s.eventsTriggered.pvp + s.eventsTriggered.war + s.eventsTriggered.other,
      stallCount: s.stallsDetected.count,
      crashCount: s.crashes.count,
      reloadCount: s.autoReloads.count,
      lastActivity: s.updatedAt
    };
  }

  /**
   * Reseta o estado (para testes ou reset manual via UI futura).
   */
  function reset() {
    _state = {
      profileId: profileId,
      createdAt: _now(),
      updatedAt: _now(),
      playtimeMs: 0,
      sessionCount: 0,
      eventsTriggered: { exp: 0, pvp: 0, war: 0, other: 0 },
      stallsDetected: { count: 0, lastAt: null, reasons: [] },
      networkErrors: { count: 0, byType: {} },
      crashes: { count: 0, reasons: [] },
      autoReloads: { count: 0, lastAt: null }
    };
    _sessionStartTs = null;
    _markDirty();
    persist();
  }

  /**
   * Destrói o auditor: persiste estado final, para timer.
   */
  function destroy() {
    if (_destroyed) return;
    _destroyed = true;
    sessionEnd(); // acumula playtime final
    stopPersistTimer();
    persist();
    logger.debug('Auditor: destroyed — ' + profileId);
  }

  // ── Inicialização ──
  _cleanupOldAudits();
  startPersistTimer();

  /**
   * Limpa arquivos de audit antigos (> MAX_RETENTION_DAYS) de todos profiles.
   */
  function _cleanupOldAudits() {
    var dir = _getAuditDir();
    try {
      if (!fs.existsSync(dir)) return;
      var files = fs.readdirSync(dir);
      var cutoff = _now() - MAX_RETENTION_DAYS * 86400000;
      for (var i = 0; i < files.length; i++) {
        if (!files[i].endsWith('.json')) continue;
        var fp = path.join(dir, files[i]);
        try {
          var stats = fs.statSync(fp);
          if (stats.mtimeMs < cutoff) fs.unlinkSync(fp);
        } catch (_) { /* ignore stat/unlink errors */ }
      }
    } catch (_) { /* ignore readdir errors */ }
  }

  return {
    sessionStart: sessionStart,
    sessionEnd: sessionEnd,
    recordEvent: recordEvent,
    recordStall: recordStall,
    recordNetworkError: recordNetworkError,
    recordCrash: recordCrash,
    recordReload: recordReload,
    getStats: getStats,
    getSummary: getSummary,
    reset: reset,
    persist: persist,
    destroy: destroy,
    // exposto pra testes
    _isDirty: function () { return _dirty; },
    _isDestroyed: function () { return _destroyed; },
    _state: function () { return _state; }
  };
}

/**
 * Carrega o summary de todos os profiles auditados (para UI futura).
 * @param {string} userDataPath
 * @returns {Array<Object>} lista de summaries
 */
function loadAllSummaries(userDataPath) {
  var dir = path.join(userDataPath, 'audit');
  var out = [];
  try {
    if (!fs.existsSync(dir)) return out;
    var files = fs.readdirSync(dir);
    for (var i = 0; i < files.length; i++) {
      if (!files[i].endsWith('.json')) continue;
      try {
        var raw = fs.readFileSync(path.join(dir, files[i]), 'utf8');
        var data = JSON.parse(raw);
        out.push({
          profileId: data.profileId,
          playtimeMinutes: Math.round((data.playtimeMs || 0) / 60000),
          sessionCount: data.sessionCount || 0,
          stallCount: (data.stallsDetected && data.stallsDetected.count) || 0,
          crashCount: (data.crashes && data.crashes.count) || 0,
          updatedAt: data.updatedAt
        });
      } catch (_) { /* ignore individual file parse errors */ }
    }
  } catch (_) { /* ignore dir read errors */ }
  return out;
}

module.exports = {
  create: create,
  loadAllSummaries: loadAllSummaries,
  PERSIST_INTERVAL_MS: PERSIST_INTERVAL_MS,
  MAX_RETENTION_DAYS: MAX_RETENTION_DAYS,
  MAX_REASONS_KEPT: MAX_REASONS_KEPT
};
