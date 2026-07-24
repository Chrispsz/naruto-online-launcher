/**
 * memory/GcDaemon.js — Daemon periódico de GC + collect() (Fase 3f split)
 *
 * Responsabilidade ÚNICA (SRP): executar a coleta de lixo (GC) do processo
 * main em intervalos adaptativos, respeitando threshold e Modo Batata.
 *
 * FIX BLACK SCREEN (v5.0 — pendência herdada):
 *   O GC causava TELA PRETA no jogo porque collect() chamava
 *   session.clearCache() + clearStorageData({storages:['cachestorage','shadercache']})
 *   em TODAS as partitions de perfil — incluindo as que tinham um jogo Flash
 *   ATIVO. Limpar shadercache/cachestorage mid-session força recompilação de
 *   GPU shaders e disrupta o carregamento de recursos do Flash PPAPI →
 *   canvas fica preto.
 *
 *   CORREÇÃO:
 *     1. NUNCA limpar cache de partitions com jogo ativo (consulta
 *        MemoryGuard.getActiveProfileIds()). Só limpa partitions ociosas.
 *     2. Removido 'shadercache' do clearStorageData em TUDO (era o principal
 *        culpado — recompilação de shaders blanka o canvas).
 *     3. process.gc(true) (V8 major GC no MAIN) continua — é seguro porque
 *        não toca no renderer onde o Flash roda.
 *
 *   Hipótese confirmada pela análise do código v4.9.2: o webview GC
 *   (window.gc() no renderer) já foi desativado em v4.9.1, mas o
 *   session.clearCache/shadercache nas partitions ativas permanecia — essa
 *   era a causa remanescente da tela preta.
 */

'use strict';

const { session } = require('electron');
const logger = require('../utils/logger');
const MemoryGuard = require('./MemoryGuard');

const THROTTLE_MS = 30 * 1000;

let _timer = null;
let _lastGC = 0;
let _collecting = false;

/**
 * Coleta forçada — 2 camadas efetivas. Nunca lança.
 * Anti-reentrada: flag _collecting bloqueia chamadas concorrentes.
 * @param {Object} [opts] - { manual: boolean } para telemetria
 * @returns {Promise<{beforeMB:number, afterMB:number, savedMB:number, throttled:boolean, busy?:boolean}>}
 */
async function collect(opts) {
  if (_collecting) {
    logger.debug('GcDaemon: collect() já em execução — skip');
    return { busy: true };
  }

  const now = Date.now();
  if (now - _lastGC < THROTTLE_MS) {
    logger.debug('GcDaemon: GC throttled (último há ' + Math.round((now - _lastGC) / 1000) + 's)');
    return { throttled: true };
  }
  _lastGC = now;
  _collecting = true;

  const isManual = !!(opts && opts.manual);

  try {
    const before = MemoryGuard.getStats().totalMB;

    // ── Camada 1: session cache clearing (BLACK SCREEN FIX v5.0) ──
    // Só limpa partitions SEM jogo ativo. shadercache REMOVIDO (causa tela preta).
    try {
      await _clearIdleSessions();
    } catch (e) {
      logger.debug('GcDaemon: camada 1 (clearCache) erro: ' + e.message);
    }

    // ── Camada 2: V8 major GC no MAIN process (seguro — não toca renderer) ──
    try {
      if (typeof process.gc === 'function') {
        process.gc(true);
      }
    } catch (e) {
      logger.debug('GcDaemon: process.gc falhou: ' + e.message);
    }

    try {
      if (process.platform === 'win32') {
        await _emptyWorkingSetWindows();
      }
    } catch (e) {
      logger.debug('GcDaemon: camada 2 (OS trim) erro: ' + e.message);
    }

    await new Promise(function (r) {
      const t = setTimeout(r, 200);
      if (typeof t.unref === 'function') t.unref();
    });
    const after = MemoryGuard.getStats().totalMB;
    const saved = before - after;

    var deltaStr = saved > 0 ? '(-' + saved + 'MB)' : saved < 0 ? '(+' + -saved + 'MB)' : '(±0MB)';
    logger.info(
      'GcDaemon: GC ' +
        before +
        'MB → ' +
        after +
        'MB ' +
        deltaStr +
        (MemoryGuard.isBatata() ? ' [BATATA]' : '') +
        (isManual ? ' [MANUAL]' : '')
    );

    const result = {
      beforeMB: before,
      afterMB: after,
      savedMB: saved,
      throttled: false,
      timestamp: now
    };
    MemoryGuard._recordGC(isManual, result);
    return result;
  } finally {
    _collecting = false;
  }
}

/**
 * Limpa cache apenas de sessions OCIOSAS (sem jogo ativo).
 * BLACK SCREEN FIX: partitions com jogo ativo são puladas.
 * shadercache removido do clearStorageData.
 * @returns {Promise<void>}
 */
async function _clearIdleSessions() {
  // Default session (nenhum jogo roda aqui — seguro limpar)
  await session.defaultSession.clearCache().catch(function (e) {
    logger.debug('GcDaemon: clearCache default session error: ' + e.message);
  });
  await session.defaultSession.clearStorageData({ storages: ['cachestorage'] }).catch(function (e) {
    logger.debug('GcDaemon: clearStorageData default session error: ' + e.message);
  });

  const store = require('../profiles/store');
  const partition = require('../profiles/partition');
  const activeIds = MemoryGuard.getActiveProfileIds();
  const profiles = store.getAll();

  for (let i = 0; i < profiles.length; i++) {
    const pid = profiles[i].id;
    if (activeIds.indexOf(pid) !== -1) {
      // BLACK SCREEN FIX: perfil com jogo ativo — NÃO limpar cache.
      logger.debug('GcDaemon: skip clearCache p/ perfil ativo (black screen fix) — ' + pid);
      continue;
    }
    try {
      const partName = partition.getPartitionName(profiles[i]);
      const ps = session.fromPartition(partName);
      await ps.clearCache().catch(function (e) {
        logger.debug('GcDaemon: clearCache partition error (' + pid + '): ' + e.message);
      });
      await ps.clearStorageData({ storages: ['cachestorage'] }).catch(function (e) {
        logger.debug('GcDaemon: clearStorageData partition error (' + pid + '): ' + e.message);
      });
    } catch (_) {
      /* partition não carregada — ok */
    }
  }
}

/**
 * Windows: EmptyWorkingSet via PowerShell (psapi.dll).
 * Fallback: SetProcessWorkingSetSize via PowerShell if psapi fails.
 * On Server Core / Nano Server where PowerShell may be unavailable, silently skip.
 */
function _emptyWorkingSetWindows() {
  return new Promise(function (resolve) {
    const { exec } = require('child_process');
    const cmd =
      'powershell -NoProfile -Command "[psapi]::EmptyWorkingSet([diagnostics.process]::GetCurrentProcess().Handle)"';
    const child = exec(cmd, { timeout: 5000, windowsHide: true }, function (err) {
      // If psapi type not available (Server Core), try alternative
      if (err) {
        const alt = exec(
          'powershell -NoProfile -Command "[System.Diagnostics.Process]::GetCurrentProcess().MinWorkingSet = [System.IntPtr]::Zero; [System.Diagnostics.Process]::GetCurrentProcess().MaxWorkingSet = [System.IntPtr]::Zero"',
          { timeout: 5000, windowsHide: true },
          function () {
            resolve();
          }
        );
        const tAlt = setTimeout(function () {
          try {
            alt.kill();
          } catch (_) {
            /* ignore */
          }
          resolve();
        }, 6000);
        if (typeof tAlt.unref === 'function') tAlt.unref();
        return;
      }
      resolve();
    });
    const tChild = setTimeout(function () {
      try {
        child.kill();
      } catch (_) {
        /* ignore */
      }
      resolve();
    }, 6000);
    if (typeof tChild.unref === 'function') tChild.unref();
  });
}

/**
 * Inicia o daemon. A cada interval: notifica stats; se > threshold OU
 * batata preventive, chama collect().
 */
function start() {
  if (_timer) return;
  const intervalMs = MemoryGuard.getIntervalMs();
  const thresholdMB = MemoryGuard.getThreshold();
  logger.info(
    'GcDaemon: daemon iniciado — interval ' +
      intervalMs / 1000 +
      's, threshold ' +
      thresholdMB +
      'MB, batata=' +
      MemoryGuard.isBatata() +
      ', ramen=' +
      MemoryGuard.isRamen()
  );

  _timer = setInterval(function () {
    const stats = MemoryGuard.getStats();
    MemoryGuard._notify();
    const shouldGC =
      stats.totalMB > MemoryGuard.getThreshold() ||
      (MemoryGuard.isBatata() && MemoryGuard.isPreventive());
    if (shouldGC) {
      collect().catch(function (e) {
        logger.error('GcDaemon: auto-collect falhou: ' + e.message);
      });
    }
  }, intervalMs);

  if (_timer.unref) _timer.unref();
}

/**
 * Stop the GC daemon interval timer.
 */
function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('GcDaemon: daemon parado');
  }
}

module.exports = {
  collect: collect,
  start: start,
  stop: stop,
  // exposto p/ testes
  _clearIdleSessions: _clearIdleSessions,
  THROTTLE_MS: THROTTLE_MS
};
