/**
 * memory/MemoryGuard.js — Monitoramento de memória + Modo Leve (low-spec)
 *
 * Responsabilidade ÚNICA (SRP): observar e reportar o estado de memória do
 * processo main + detectar máquinas low-spec (Modo Leve / Minimal).
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
const IS_MINIMAL = TOTAL_RAM_GB < 2; // Minimal Mode — manager-only (sem UI)

const CONFIG = {
  normal: { thresholdMB: 700 },
  lowSpec: { thresholdMB: 450 }
};
const MODE = IS_LOW_SPEC ? CONFIG.lowSpec : CONFIG.normal;

let _thresholdMB = MODE.thresholdMB;
let _forceLowSpec = false;

// ── Monitoramento ──
const _startedAt = Date.now();
let _crashCount = 0;

function isLowSpecMode() {
  return _forceLowSpec || IS_LOW_SPEC;
}

function isMinimal() {
  return IS_MINIMAL;
}

function getThreshold() {
  return _thresholdMB;
}

/**
 * Força ou desforça o Modo Leve. Recalcula threshold.
 * @param {boolean} force
 */
function setForceLowSpec(force) {
  _forceLowSpec = !!force;
  _thresholdMB = isLowSpecMode() ? CONFIG.lowSpec.thresholdMB : CONFIG.normal.thresholdMB;
  try {
    const partition = require('../profiles/partition');
    partition.setLowSpecMode(isLowSpecMode());
  } catch (_) {
    /* partition module may not be loaded yet — ok */
  }
  logger.info('MemoryGuard: Modo Leve = ' + isLowSpecMode() + ' (threshold ' + _thresholdMB + 'MB)');
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
    isLowSpecMode: isLowSpecMode(),
    isMinimal: isMinimal(),
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
  // em máquinas com <4GB de RAM — getStats, isLowSpecMode, isMinimal, IS_LOW_SPEC,
  // SYSTEM_RAM_GB, getThreshold, setForceLowSpec, reportCrash.
  getStats: getStats,
  isLowSpecMode: isLowSpecMode,
  isMinimal: isMinimal,
  getThreshold: getThreshold,
  setForceLowSpec: setForceLowSpec,
  reportCrash: reportCrash,
  IS_LOW_SPEC: IS_LOW_SPEC,
  IS_MINIMAL: IS_MINIMAL,
  SYSTEM_RAM_GB: Math.round(TOTAL_RAM_GB * 10) / 10
};
