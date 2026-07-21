/**
 * memory/MemoryGuard.js — Monitor de RSS + estado de memória (Fase 3f split)
 *
 * Responsabilidade ÚNICA (SRP): observar e reportar o estado de memória do
 * processo main + registrar quais webviews de jogo estão ativas. NÃO executa
 * GC — isso é papel do GcDaemon.
 *
 * Histórico: era parte do God Object guard.js (436 linhas). Split em 2:
 *   - MemoryGuard.js (este) — monitor + estado + registry de webviews
 *   - GcDaemon.js          — daemon periódico + collect() + FIX BLACK SCREEN
 *
 * O guard.js antigo continua existindo como FACADE fino que re-exporta ambos,
 * preservando a API pública (main.js / controller.js / manager.js não mudam).
 */

'use strict';

const os = require('os');
const logger = require('../utils/logger');

const TOTAL_RAM_GB = os.totalmem() / (1024 * 1024 * 1024);
const IS_LOW_SPEC = TOTAL_RAM_GB < 4; // Modo Batata auto-detect
const IS_RAMEN = TOTAL_RAM_GB < 2; // Ramen Mode — manager-only (sem UI)

const CONFIG = {
  normal: { intervalMs: 5 * 60 * 1000, thresholdMB: 700, preventiveGC: false },
  batata: { intervalMs: 2 * 60 * 1000, thresholdMB: 450, preventiveGC: true }
};
const MODE = IS_LOW_SPEC ? CONFIG.batata : CONFIG.normal;

let _thresholdMB = MODE.thresholdMB;
let _intervalMs = MODE.intervalMs;
let _preventive = MODE.preventiveGC;
let _forceBatata = false;
let _memListeners = [];
let _gcListeners = [];

// ── Telemetria ──
const _startedAt = Date.now();
let _crashCount = 0;
let _manualGCCount = 0;
let _autoGCCount = 0;

// ── Registry de webviews ativas (usado pelo GcDaemon p/ black screen fix) ──
// Map: profileId -> { webContents, lastGC, collected, registeredAt }
const _webviewRegistry = new Map();

/**
 * Registra um webContents de jogo ativo. Usado pelo GcDaemon para SABER quais
 * partitions NÃO devem ter cache limpo (causa tela preta no Flash PPAPI).
 * @param {string} profileId
 * @param {Electron.WebContents} webContents
 */
function registerGameWebContents(profileId, webContents) {
  if (!profileId || !webContents) return;
  _webviewRegistry.set(profileId, {
    webContents: webContents,
    lastGC: 0,
    collected: 0,
    registeredAt: Date.now()
  });
  logger.info('MemoryGuard: webview registrada — ' + profileId);
  try {
    webContents.once('destroyed', function () {
      _webviewRegistry.delete(profileId);
      logger.info('MemoryGuard: webview removida (destroyed) — ' + profileId);
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Remove um webContents de jogo do registry. Chamado quando o jogo fecha.
 * @param {string} profileId
 */
function unregisterGameWebContents(profileId) {
  if (_webviewRegistry.has(profileId)) {
    _webviewRegistry.delete(profileId);
    logger.info('MemoryGuard: webview desregistrada — ' + profileId);
  }
}

/**
 * Lista de profileIds com jogo ativo (webview viva).
 * Usado pelo GcDaemon.collect() para pular clearCache nessas partitions.
 * @returns {string[]}
 */
function getActiveProfileIds() {
  return Array.from(_webviewRegistry.keys());
}

// ── Modo Batata / Ramen ──

/** @returns {boolean} */
function isBatata() {
  return _forceBatata || IS_LOW_SPEC;
}
/** @returns {boolean} */
function isRamen() {
  return IS_RAMEN;
}
/** @returns {number} threshold in MB */
function getThreshold() {
  return _thresholdMB;
}
/** @returns {number} interval in ms */
function getIntervalMs() {
  return _intervalMs;
}
/** @returns {boolean} */
function isPreventive() {
  return _preventive;
}

/**
 * Define o threshold de memória (clamp 200–4096 MB).
 * @param {number} mb
 */
function setThreshold(mb) {
  _thresholdMB = Math.max(200, Math.min(4096, Math.floor(mb)));
  logger.info('MemoryGuard: threshold = ' + _thresholdMB + 'MB');
}

/**
 * Força ou desforça o modo Batata. Recalcula interval/threshold/preventive.
 * @param {boolean} force
 */
function setForceBatata(force) {
  _forceBatata = !!force;
  const m = isBatata() ? CONFIG.batata : CONFIG.normal;
  _intervalMs = m.intervalMs;
  _thresholdMB = m.thresholdMB;
  _preventive = m.preventiveGC;
  try {
    const partition = require('../profiles/partition');
    partition.setBatataMode(isBatata());
  } catch (_) {
    /* partition module may not be loaded yet — ok */
  }
  logger.info(
    'MemoryGuard: Modo Batata = ' +
      isBatata() +
      ' (interval ' +
      _intervalMs +
      'ms, threshold ' +
      _thresholdMB +
      'MB)'
  );
}

// ── Stats ──

/**
 * Retorna snapshot do estado de memória do processo.
 * @returns {Object} stats (totalMB, thresholdMB, isBatata, isRamen, systemRAM, etc.)
 */
function getStats() {
  let totalMB = 0;
  try {
    const mu = process.memoryUsage();
    if (mu && typeof mu.rss === 'number') {
      totalMB = Math.round(mu.rss / 1024 / 1024);
    }
  } catch (e) {
    logger.debug('MemoryGuard: memoryUsage() falhou: ' + e.message);
  }
  const uptimeMs = Date.now() - _startedAt;
  return {
    totalMB: totalMB,
    thresholdMB: _thresholdMB,
    isBatata: isBatata(),
    isRamen: isRamen(),
    systemRAM: Math.round(TOTAL_RAM_GB * 10) / 10,
    timestamp: Date.now(),
    uptimeMs: uptimeMs,
    uptimeHours: Math.round((uptimeMs / 3600000) * 10) / 10,
    crashCount: _crashCount,
    manualGCCount: _manualGCCount,
    autoGCCount: _autoGCCount,
    totalGCCount: _manualGCCount + _autoGCCount,
    startedAt: _startedAt
  };
}

/** Incrementa o contador de crashes registrados. */
function reportCrash() {
  _crashCount++;
  logger.warn('MemoryGuard: crash registrado (total: ' + _crashCount + ')');
}

// ── Listeners (GcDaemon dispara onGC; este módulo dispara onMemoryUpdate) ──

/**
 * Registra listener para atualizações de memória.
 * @param {Function} cb - chamada com stats object
 */
function onMemoryUpdate(cb) {
  if (typeof cb === 'function') _memListeners.push(cb);
}
/**
 * Registra listener para eventos de GC.
 * @param {Function} cb - chamada com GC result object
 */
function onGC(cb) {
  if (typeof cb === 'function') _gcListeners.push(cb);
}

function _notify() {
  const stats = getStats();
  _memListeners.forEach(function (cb) {
    try {
      cb(stats);
    } catch (_) {
      /* ignore */
    }
  });
}

/**
 * Registra um GC executado (chamado pelo GcDaemon). Atualiza contadores e
 * dispara listeners onGC.
 * @param {boolean} isManual
 * @param {Object} result
 */
function _recordGC(isManual, result) {
  if (isManual) _manualGCCount++;
  else _autoGCCount++;
  _gcListeners.forEach(function (cb) {
    try {
      cb(result);
    } catch (_) {
      /* ignore */
    }
  });
}

// ── Webview GC no-ops (v4.9.1: DESATIVADO — causava tela preta no Flash) ──
// Mantidos como no-op pra não quebrar callers (main.js chama startWebviewGC,
// manager.js chama registerGameWebContents). O registry ainda é populado
// porque o GcDaemon o usa para o black screen fix.

const WEBVIEW_GC_INTERVAL_NORMAL = 15 * 60 * 1000;
const WEBVIEW_GC_INTERVAL_BATATA = 7 * 60 * 1000;

/**
 * NO-OP v4.9.1: window.gc() no renderer pausa o Flash PPAPI.
 * @returns {Promise<{ok: boolean, savedMB: number, disabled: boolean}>}
 */
async function injectGC() {
  // NO-OP v4.9.1: window.gc() no renderer pausa o Flash PPAPI → tela preta.
  return { ok: true, savedMB: 0, disabled: true };
}

/** NO-OP: daemon desativado pra evitar tela preta no Flash. */
function startWebviewGC() {
  // NO-OP v4.9.1: daemon desativado pra evitar tela preta no Flash.
  logger.info('MemoryGuard: daemon window.gc() DESATIVADO (v4.9.1 — causava tela preta no Flash)');
}

/** NO-OP: daemon nunca inicia. Mantido p/ compat de API. */
function stopWebviewGC() {
  // NO-OP (daemon nunca inicia). Mantido p/ compat de API.
}

/**
 * Retorna estatísticas das webviews ativas.
 * @returns {{active: number, totalGCs: number, lastGCAt: number|null, intervalMin: number}}
 */
function getWebviewStats() {
  let totalGCs = 0;
  let lastGCAt = 0;
  _webviewRegistry.forEach(function (entry) {
    totalGCs += entry.collected;
    if (entry.lastGC > lastGCAt) lastGCAt = entry.lastGC;
  });
  return {
    active: _webviewRegistry.size,
    totalGCs: totalGCs,
    lastGCAt: lastGCAt || null,
    intervalMin: Math.round(
      (isBatata() ? WEBVIEW_GC_INTERVAL_BATATA : WEBVIEW_GC_INTERVAL_NORMAL) / 60000
    )
  };
}

module.exports = {
  // monitor + state
  getStats: getStats,
  isBatata: isBatata,
  isRamen: isRamen,
  getThreshold: getThreshold,
  getIntervalMs: getIntervalMs,
  isPreventive: isPreventive,
  setThreshold: setThreshold,
  setForceBatata: setForceBatata,
  // listeners
  onMemoryUpdate: onMemoryUpdate,
  onGC: onGC,
  _notify: _notify,
  _recordGC: _recordGC,
  // telemetria
  reportCrash: reportCrash,
  // webview registry
  registerGameWebContents: registerGameWebContents,
  unregisterGameWebContents: unregisterGameWebContents,
  getActiveProfileIds: getActiveProfileIds,
  // webview GC no-ops
  injectGC: injectGC,
  startWebviewGC: startWebviewGC,
  stopWebviewGC: stopWebviewGC,
  getWebviewStats: getWebviewStats,
  // constants
  IS_LOW_SPEC: IS_LOW_SPEC,
  IS_RAMEN: IS_RAMEN,
  SYSTEM_RAM_GB: Math.round(TOTAL_RAM_GB * 10) / 10
};
