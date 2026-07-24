/**
 * memory/MemoryGuard.js — Telemetria de memória + Modo Leve (low-spec)
 *
 * Responsabilidade ÚNICA (SRP): observar e reportar o estado de memória do
 * processo main + detectar máquinas low-spec (Modo Leve / Ramen).
 *
 * NÃO executa GC. O V8 cuida do main process sozinho — um launcher passa 99%
 * do tempo idle, e o jogo roda num processo renderer isolado que o main nunca
 * toca. GC forçado em main de 50–100MB é otimização inútil (removido em v1.1.2).
 */

'use strict';

const os = require('os');
const logger = require('../utils/logger');

const TOTAL_RAM_GB = os.totalmem() / (1024 * 1024 * 1024);
const IS_LOW_SPEC = TOTAL_RAM_GB < 4; // Modo Leve auto-detect
const IS_RAMEN = TOTAL_RAM_GB < 2; // Ramen Mode — manager-only (sem UI)

const CONFIG = {
  normal: { thresholdMB: 700 },
  batata: { thresholdMB: 450 }
};
const MODE = IS_LOW_SPEC ? CONFIG.batata : CONFIG.normal;

let _thresholdMB = MODE.thresholdMB;
let _forceBatata = false;

// ── Telemetria ──
const _startedAt = Date.now();
let _crashCount = 0;

function isBatata() {
  return _forceBatata || IS_LOW_SPEC;
}

function isRamen() {
  return IS_RAMEN;
}

function getThreshold() {
  return _thresholdMB;
}

/**
 * Força ou desforça o Modo Leve. Recalcula threshold.
 * @param {boolean} force
 */
function setForceBatata(force) {
  _forceBatata = !!force;
  _thresholdMB = isBatata() ? CONFIG.batata.thresholdMB : CONFIG.normal.thresholdMB;
  try {
    const partition = require('../profiles/partition');
    partition.setBatataMode(isBatata());
  } catch (_) {
    /* partition module may not be loaded yet — ok */
  }
  logger.info('MemoryGuard: Modo Leve = ' + isBatata() + ' (threshold ' + _thresholdMB + 'MB)');
}

/**
 * Retorna snapshot do estado de memória do processo main.
 * @returns {Object} stats
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
    startedAt: _startedAt
  };
}

/** Incrementa o contador de crashes registrados. */
function reportCrash() {
  _crashCount++;
  logger.warn('MemoryGuard: crash registrado (total: ' + _crashCount + ')');
}

module.exports = {
  // Mantido (não remover): APIs de detecção de low-spec usadas pelo Modo Leve
  // em máquinas com <4GB de RAM — getStats, isBatata, isRamen, IS_LOW_SPEC,
  // SYSTEM_RAM_GB, getThreshold, setForceBatata, reportCrash.
  getStats: getStats,
  isBatata: isBatata,
  isRamen: isRamen,
  getThreshold: getThreshold,
  setForceBatata: setForceBatata,
  reportCrash: reportCrash,
  IS_LOW_SPEC: IS_LOW_SPEC,
  IS_RAMEN: IS_RAMEN,
  SYSTEM_RAM_GB: Math.round(TOTAL_RAM_GB * 10) / 10
};
