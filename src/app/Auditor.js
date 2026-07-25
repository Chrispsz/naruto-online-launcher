/**
 * app/Auditor.js — Session metadata collection per profile (Phase 1, no UI)
 *
 * Purpose: record usage metrics and events for each profile, in memory +
 * persist to userData/audit/<profileId>.json. Enables post-mortem analysis
 * of stability, performance and usage patterns.
 *
 * Metadata collected:
 *   - playtimeMs: total time (ms) with game window open
 *   - sessionCount: number of sessions (each attach = 1 session)
 *   - eventsTriggered: { exp: N, pvp: N, war: N, other: N }
 *   - stallsDetected: { count: N, lastAt: ts, reasons: [] }
 *   - networkErrors: { count: N, byType: { auth: N, game: N, ... } }
 *   - crashes: { count: N, reasons: [] }
 *   - autoReloads: { count: N, lastAt: ts }
 *
 * Phase 1: NO UI. Only collection + persistence. UI comes in Phase 2.
 *
 * Persistence:
 *   - Throttled: persists every PERSIST_INTERVAL_MS (30s) if dirty
 *   - Atomic write: tmp + rename
 *   - Retention: max 90 days (old data is deleted on init)
 *
 * Integration (external hooks call Auditor.record*):
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
var MAX_REASONS_KEPT = 20; // cap reasons array to prevent unbounded growth

/**
 * Cria um Auditor para um profile.
 * @param {string} profileId
 * @param {Object} [opts] - { userDataPath (string), now (fn override for deterministic time) }
 * @returns {Object} auditor instance
 */
function create(profileId, opts) {
  if (typeof profileId !== 'string' || !profileId) {
    throw new Error('Auditor: profileId is required');
  }
  opts = opts || {};

  var _userDataPath = opts.userDataPath;
  if (!_userDataPath) {
    try {
      var { app } = require('electron');
      _userDataPath = app.getPath('userData');
    } catch (e) {
      throw new Error('Auditor: userDataPath is required when Electron is unavailable');
    }
  }

  var _now = opts.now || function () { return Date.now(); };

  // In-memory state (loaded from disk if exists)
  var _state = _loadInitialState();
  var _dirty = false;
  var _persistTimer = null;
  var _sessionStartTs = null;
  var _destroyed = false;

  // ── Internal state ──
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
      // Merge: new fields in default don't overwrite loaded ones
      var merged = Object.assign({}, defaultState, loaded);
      merged.eventsTriggered = Object.assign(defaultState.eventsTriggered, loaded.eventsTriggered || {});
      merged.stallsDetected = Object.assign(defaultState.stallsDetected, loaded.stallsDetected || {});
      merged.networkErrors = Object.assign(defaultState.networkErrors, loaded.networkErrors || {});
      merged.crashes = Object.assign(defaultState.crashes, loaded.crashes || {});
      merged.autoReloads = Object.assign(defaultState.autoReloads, loaded.autoReloads || {});
      merged.profileId = profileId; // ensures correct identity after Object.assign merge
      return merged;
    } catch (e) {
      logger.warn('Auditor: failed to load ' + fp + ' — ' + e.message + ' (using default)');
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
      logger.error('Auditor: failed to create dir ' + dir + ' — ' + e.message);
      return false;
    }
  }

  function _markDirty() {
    _dirty = true;
    _state.updatedAt = _now();
  }

  /**
   * Persist state to disk (atomic: tmp + rename).
   * Called by the throttled timer or on destroy.
   * Note: _destroyed does not block persist — destroy() needs to persist
   * final state. The guard against double-persist is _dirty (reset after write).
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
      logger.error('Auditor: persist failed (' + profileId + ') — ' + e.message);
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* best-effort cleanup */ }
      return false;
    }
  }

  /**
   * Start the throttled persistence timer.
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
   * Record session start (game window opened).
   */
  function sessionStart() {
    _state.sessionCount++;
    _sessionStartTs = _now();
    _markDirty();
    logger.debug('Auditor: sessionStart — ' + profileId + ' (#' + _state.sessionCount + ')');
  }

  /**
   * Record session end (window closed). Accumulates playtime.
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
   * Record a triggered event (exp/pvp/war/other).
   * @param {string} type - exp|pvp|war|other
   */
  function recordEvent(type) {
    if (!Object.prototype.hasOwnProperty.call(_state.eventsTriggered, type)) type = 'other';
    _state.eventsTriggered[type]++;
    _markDirty();
  }

  /**
   * Record a stall detected by StallDetector.
   * @param {string} reason - stall reason
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
   * Record a network error.
   * @param {string} type - auth|game|api|other
   */
  function recordNetworkError(type) {
    _state.networkErrors.count++;
    type = type || 'other';
    _state.networkErrors.byType[type] = (_state.networkErrors.byType[type] || 0) + 1;
    _markDirty();
  }

  /**
   * Record a render process crash.
   * @param {string} reason - render-process-gone reason
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
   * Record an auto-reload (StallDetector or crash recovery).
   */
  function recordReload() {
    _state.autoReloads.count++;
    _state.autoReloads.lastAt = _now();
    _markDirty();
  }

  // ── Public API: query methods ──

  /**
   * Return state snapshot (deep copy).
   */
  function getStats() {
    // If session active, include current playtime
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
   * Return compact summary (for future IPC/UI).
   * Reads _state directly — avoids the JSON roundtrip deep clone in getStats().
   */
  function getSummary() {
    var currentPlaytime = _state.playtimeMs;
    if (_sessionStartTs !== null) {
      currentPlaytime += _now() - _sessionStartTs;
    }
    return {
      profileId: _state.profileId,
      playtimeMinutes: Math.round(currentPlaytime / 60000),
      sessionCount: _state.sessionCount,
      totalEvents: _state.eventsTriggered.exp + _state.eventsTriggered.pvp + _state.eventsTriggered.war + _state.eventsTriggered.other,
      stallCount: _state.stallsDetected.count,
      crashCount: _state.crashes.count,
      reloadCount: _state.autoReloads.count,
      lastActivity: _state.updatedAt
    };
  }

  /**
   * Resets all accumulated state (profile switch or manual reset).
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
   * Destroy auditor: persist final state, stop timer.
   */
  function destroy() {
    if (_destroyed) return;
    _destroyed = true;
    sessionEnd(); // accumulates final playtime
    stopPersistTimer();
    persist();
    logger.debug('Auditor: destroyed — ' + profileId);
  }

  // ── Initialization ──
  _cleanupOldAudits();
  startPersistTimer();

  /**
   * Clean old audit files (> MAX_RETENTION_DAYS) from all profiles.
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
    // internal inspection
    _isDirty: function () { return _dirty; },
    _isDestroyed: function () { return _destroyed; },
    _state: function () { return _state; }
  };
}

module.exports = {
  create: create
};
