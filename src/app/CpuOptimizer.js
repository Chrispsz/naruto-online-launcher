/**
 * app/CpuOptimizer.js — CPU optimizations for Flash Player (v1.0.0)
 *
 * Single Responsibility: apply CPU/Scheduler optimizations to the process
 * Electron renderer process where Flash PPAPI runs.
 *
 * CRITICAL CONTEXT — Flash is SINGLE-THREADED:
 *   ActionScript (Naruto Online game logic) runs in a SINGLE thread inside the
 *   Electron renderer process. Even if the CPU has 16 cores, Flash only uses
 *   1 for the main logic. The Linux/Windows scheduler moves this thread between
 *   cores (cache thrashing) - pinning to a P-core (performance) reduces cache
 *   misses and gives a real FPS gain (5-15% on hybrid CPUs).
 *
 * Applied optimizations:
 *   LINUX:
 *     1. CPU affinity via `taskset -cp <cores> <pid>` (pins renderer to P-cores).
 *     2. Nice priority via `renice -n <priority> -p <pid>` (-5 performance).
 *     3. oom_score_adj=-500 via /proc/<pid>/oom_score_adj (kernel won't kill on OOM).
 *
 *   WINDOWS (Win10/11):
 *     1. CPU affinity via PowerShell `Set-Process -ProcessorAffinity <mask>`.
 *     2. Process priority via Node.js `os.setPriority()` (cross-platform, REAL).
 *     3. No oom_score_adj equivalent (Windows has no OOM killer like Linux).
 *
 *   macOS: no-op (Mac doesn't run Flash PPAPI — no plugin support).
 *
 * Since Electron doesn't expose setAffinity directly, we use external processes.
 * In AppImage without taskset / Windows without PowerShell, fails silently.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const logger = require('../utils/logger');

// Windows priority constants — resolved lazily inside _applyWindowsPriority
// (mocks in tests lack constants.priority, so it can't be top-level).
let _winPrioCache = null;
function _winPrioConstants() {
  if (_winPrioCache) return _winPrioCache;
  _winPrioCache = {
    aboveNormal: os.constants.priority.PRIORITY_ABOVE_NORMAL,
    normal: os.constants.priority.PRIORITY_NORMAL,
    belowNormal: os.constants.priority.PRIORITY_BELOW_NORMAL
  };
  return _winPrioCache;
}

let _appliedPids = new Set(); // already-optimized PIDs (avoids reapply)

/**
 * Attempts to run a command via PowerShell (Windows).
 * Win11 24H2+ and Windows Server Core may not have powershell.exe (v5.1).
 * Fallback: pwsh.exe (PowerShell 7+), which may be installed separately.
 * If neither is available, fails silently.
 * @param {string} script - PowerShell command (without -Command wrapper)
 * @param {number} timeout - timeout in ms
 * @returns {Promise<{ok: boolean, stdout?: string, error?: string}>}
 */
function _execPowershell(script, timeout) {
  return new Promise(function (resolve) {
    _tryPwsh('powershell', script, timeout, function (result) {
      if (result.ok) return resolve(result);
      // Fallback: pwsh.exe (PowerShell 7+)
      _tryPwsh('pwsh', script, timeout, function (result2) {
        resolve(result2);
      });
    });
  });
}

function _tryPwsh(bin, script, timeout, callback) {
  execFile(
    bin,
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: timeout, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    function (err, stdout) {
      if (err) {
        return callback({ ok: false, error: bin + ': ' + err.message });
      }
      callback({ ok: true, stdout: stdout });
    }
  );
}

/**
 * Detect P-core vs E-core layout in hybrid CPUs.
 *
 * On Intel Alder Lake+ (12th gen+), the Linux kernel exposes
 * /sys/devices/cpu_atom/cpus (E-cores) and /sys/devices/cpu_core/cpus (P-cores).
 *
 * @returns {Object} { pCores: [0,1,2,3], eCores: [4,5,6,7], isHybrid: bool }
 */
function detectCoreTopology() {
  const totalCores = os.cpus().length;
  const pCores = [];
  const eCores = [];

  if (process.platform === 'linux') {
    try {
      // P-cores (cpu_core): high-performance
      if (fs.existsSync('/sys/devices/cpu_core/cpus')) {
        const raw = fs.readFileSync('/sys/devices/cpu_core/cpus', 'utf8').trim();
        // Format: "0-7" or "0 1 2 3" or "0,2,4,6"
        _parseCpuList(raw).forEach(function (n) {
          pCores.push(n);
        });
      }
      // E-cores (cpu_atom): efficient
      if (fs.existsSync('/sys/devices/cpu_atom/cpus')) {
        const raw = fs.readFileSync('/sys/devices/cpu_atom/cpus', 'utf8').trim();
        _parseCpuList(raw).forEach(function (n) {
          eCores.push(n);
        });
      }
      // NixOS fallback: /sys/devices/system/cpu/cpu*/topology/core_type
      // NixOS expõe topology diferente de distros padrão. Se cpu_core/cpu_atom
      // não existem, tenta detectar via core_type (disponível no kernel 5.17+).
      if (pCores.length === 0 && eCores.length === 0) {
        var cpuDir = '/sys/devices/system/cpu';
        try {
          var cpuEntries = fs.readdirSync(cpuDir).filter(function (n) {
            return /^cpu\d+$/.test(n);
          });
          for (var i = 0; i < cpuEntries.length; i++) {
            try {
              var coreTypePath = cpuDir + '/' + cpuEntries[i] + '/topology/core_type';
              if (fs.existsSync(coreTypePath)) {
                var coreType = fs.readFileSync(coreTypePath, 'utf8').trim();
                var cpuNum = parseInt(cpuEntries[i].replace('cpu', ''), 10);
                if (coreType === 'efficiency') {
                  eCores.push(cpuNum);
                } else {
                  // 'performance' or unknown → assume P-core
                  pCores.push(cpuNum);
                }
              }
            } catch (_) {
              /* skip individual CPU */
            }
          }
        } catch (_) {
          /* cpuDir doesn't exist — very unlikely */
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  // Fallback: if no separate P/E found, all cores are P (uniform CPU).
  // On AMD or Intel non-hybrid CPUs, the scheduler already does good work distribution.
  if (pCores.length === 0 && eCores.length === 0) {
    for (let i = 0; i < totalCores; i++) pCores.push(i);
  }

  return {
    pCores: pCores,
    eCores: eCores,
    isHybrid: pCores.length > 0 && eCores.length > 0,
    totalCores: totalCores
  };
}

/**
 * Parser for kernel CPU lists (/sys/devices/.../cpus).
 * Supported formats: "0-7", "0,2,4-6", "0 1 2", "0-3,8-11".
 * @param {string} raw
 * @returns {number[]}
 */
function _parseCpuList(raw) {
  if (!raw || raw === '\n') return [];
  const out = [];
  // Can have comma or space as separator
  const parts = raw.split(/[,\s]+/).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      for (let i = start; i <= end; i++) out.push(i);
    } else if (/^\d+$/.test(part)) {
      out.push(parseInt(part, 10));
    }
  }
  return out;
}

/**
 * Applies CPU affinity to PID via `taskset -cp <cores> <pid>`.
 * @param {number} pid - Process ID
 * @param {number[]} cores - Core list (e.g.: [0,1,2,3])
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function _applyTaskset(pid, cores) {
  return new Promise(function (resolve) {
    if (process.platform !== 'linux') {
      return resolve({ ok: false, error: 'not-linux' });
    }
    if (!pid || cores.length === 0) {
      return resolve({ ok: false, error: 'invalid-args' });
    }
    const coresArg = cores.join(',');
    execFile(
      'taskset',
      ['-cp', coresArg, String(pid)],
      {
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'pipe']
      },
      function (err) {
        if (err) {
          // taskset unavailable (minimal AppImage) or no permission
          logger.debug(
            'CpuOptimizer: taskset failed pid=' + pid + ' cores=' + coresArg + ' — ' + err.message
          );
          return resolve({ ok: false, error: err.message });
        }
        logger.info('CpuOptimizer: affinity applied pid=' + pid + ' cores=[' + coresArg + ']');
        resolve({ ok: true });
      }
    );
  });
}

/**
 * Applies nice priority via `renice -n <priority> -p <pid>`.
 * Unprivileged user can set nice 0-19 (lower priority). For negative nice
 * (-5, higher priority), needs CAP_SYS_NICE. We try -5, if it fails fall back to 0.
 * @param {number} pid
 * @param {number} priority - nice value (-20 to 19)
 * @returns {Promise<{ok: boolean, priority?: number, error?: string}>}
 */
function _applyRenice(pid, priority) {
  return new Promise(function (resolve) {
    if (process.platform !== 'linux') {
      return resolve({ ok: false, error: 'not-linux' });
    }
    execFile(
      'renice',
      ['-n', String(priority), '-p', String(pid)],
      {
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'pipe']
      },
      function (err) {
        if (err) {
          logger.debug(
            'CpuOptimizer: renice failed pid=' + pid + ' n=' + priority + ' — ' + err.message
          );
          return resolve({ ok: false, error: err.message });
        }
        logger.info('CpuOptimizer: nice=' + priority + ' applied pid=' + pid);
        resolve({ ok: true, priority: priority });
      }
    );
  });
}

/**
 * Sets oom_score_adj to -500 (kernel prefers killing other processes on OOM).
 * Escreve diretamente em /proc/<pid>/oom_score_adj (não precisa de root se for
 * o próprio processo ou filho). Em AppImage, o renderer é filho → permitido.
 * @param {number} pid
 * @param {number} score - valor de -1000 (nunca matar) a 1000 (sempre matar)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function _applyOomScoreAdj(pid, score) {
  return new Promise(function (resolve) {
    if (process.platform !== 'linux') {
      return resolve({ ok: false, error: 'not-linux' });
    }
    const path = '/proc/' + pid + '/oom_score_adj';
    fs.writeFile(path, String(score), function (err) {
      if (err) {
        logger.debug('CpuOptimizer: oom_score_adj failed pid=' + pid + ' — ' + err.message);
        return resolve({ ok: false, error: err.message });
      }
      logger.info('CpuOptimizer: oom_score_adj=' + score + ' applied pid=' + pid);
      resolve({ ok: true });
    });
  });
}

/**
 * Applies CPU affinity on Windows via PowerShell `Set-Process -ProcessorAffinity`.
 * Windows usa bitmask: bit N = core N. cores [0,1,2,3] → 0b1111 = 15.
 * PowerShell é o método mais confiável no Win10/11 (wmic está deprecated).
 * @param {number} pid
 * @param {number[]} cores
 * @returns {Promise<{ok: boolean, mask?: number, error?: string}>}
 */
function _applyWindowsAffinity(pid, cores) {
  return new Promise(function (resolve) {
    if (process.platform !== 'win32') {
      return resolve({ ok: false, error: 'not-windows' });
    }
    if (!pid || cores.length === 0) {
      return resolve({ ok: false, error: 'invalid-args' });
    }
    // Bitmask: bit N = core N (max 64 cores supported by Windows)
    let mask = 0;
    cores.forEach(function (c) {
      if (c >= 0 && c < 64) mask |= 1 << c;
    });
    if (mask === 0) {
      return resolve({ ok: false, error: 'empty-mask' });
    }
    var script = '(Get-Process -Id ' + pid + ').ProcessorAffinity = ' + mask;
    _execPowershell(script, 3000).then(function (result) {
      if (result.ok) {
        logger.info(
          'CpuOptimizer: win affinity applied pid=' +
            pid +
            ' mask=' +
            mask +
            ' cores=[' +
            cores.join(',') +
            ']'
        );
        resolve({ ok: true, mask: mask });
      } else {
        logger.debug(
          'CpuOptimizer: win affinity failed pid=' + pid + ' mask=' + mask + ' — ' + result.error
        );
        resolve({ ok: false, error: result.error });
      }
    });
  });
}

/**
 * Applies process priority on Windows via Node.js os.setPriority (cross-platform).
 * Mapeia nice-like targets (-5/0/+5) para Windows priority classes:
 *   -5 → ABOVE_NORMAL (performance preset)
 *    0 → NORMAL (balanced preset)
 *   +5 → BELOW_NORMAL (quality preset)
 * Não usa HIGH/REALTIME (causa instabilidade no sistema — mouse/teclado travam).
 * @param {number} pid
 * @param {number} niceTarget - valor nice-like (-5 a +5)
 * @returns {Promise<{ok: boolean, priority?: number, error?: string}>}
 */
function _applyWindowsPriority(pid, niceTarget) {
  return new Promise(function (resolve) {
    if (process.platform !== 'win32') {
      return resolve({ ok: false, error: 'not-windows' });
    }
    let prio;
    const c = _winPrioConstants();
    if (niceTarget < 0) prio = c.aboveNormal;
    else if (niceTarget > 0) prio = c.belowNormal;
    else prio = c.normal;
    try {
      os.setPriority(pid, prio);
      logger.info('CpuOptimizer: win priority applied pid=' + pid + ' prio=' + prio);
      resolve({ ok: true, priority: prio });
    } catch (e) {
      // EPERM se pid pertence a outro user, ou EINVAL se pid não existe mais
      logger.debug('CpuOptimizer: win priority failed pid=' + pid + ' — ' + e.message);
      resolve({ ok: false, error: e.message });
    }
  });
}

/**
 * Applies all CPU optimizations to a renderer PID (cross-platform).
 *
 * LINUX: taskset (affinity) + renice (priority) + oom_score_adj (OOM protection).
 * WINDOWS: PowerShell (affinity) + os.setPriority (priority). Sem OOM protection.
 * macOS: no-op.
 *
 * @param {number} pid - PID do processo renderer do Electron
 * @param {Object} opts - { preset: 'performance'|'balanced'|'quality',
 *                          topology: detectCoreTopology() result (optional) }
 * @returns {Promise<{affinity, nice, oom}>}
 */
async function optimizeRenderer(pid, opts) {
  opts = opts || {};
  const preset = opts.preset || 'balanced';

  if (!pid || pid <= 0) {
    return {
      affinity: { ok: false, error: 'invalid-pid' },
      nice: { ok: false, error: 'invalid-pid' },
      oom: { ok: false, error: 'invalid-pid' }
    };
  }

  // Idempotent: if already applied for same PID, skip (but re-applies on reload).
  // Em reload, o PID pode ser reutilizado — checamos o Set antes de pular.
  // Removido: o renderer PID muda em cada reload (novo processo), então o Set
  // cresce indefinidamente. Limpar a cada 50 entradas (antes de adicionar a 51ª).
  if (_appliedPids.has(pid)) {
    return {
      affinity: { ok: true, skipped: true },
      nice: { ok: true, skipped: true },
      oom: { ok: true, skipped: true }
    };
  }
  if (_appliedPids.size >= 50) _appliedPids.clear();
  _appliedPids.add(pid);

  const topology = opts.topology || detectCoreTopology();

  // Performance: pins to P-cores + 1 E-core reserve (so V8 GC doesn't compete
  // com o thread principal do Flash).
  // Balanced: pins to P-cores only (leaves E-cores free for other apps).
  // Quality: NÃO aplica affinity (deixa scheduler decidir — melhor pra multi-task).
  let cores = [];
  if (preset === 'quality') {
    // Sem affinity
  } else if (preset === 'performance') {
    // P-cores + 1 E-core (if hybrid) so GC doesn't compete with Flash thread
    if (topology.isHybrid && topology.pCores.length > 0) {
      cores = topology.pCores.slice();
      if (topology.eCores.length > 0) cores.push(topology.eCores[0]);
    } else {
      // Uniform CPU: first min(4, total) cores
      cores = topology.pCores.slice(0, Math.min(4, topology.pCores.length));
    }
  } else {
    // Balanced: P-cores only (or first 2 if uniform)
    if (topology.isHybrid) {
      cores = topology.pCores.slice(0, Math.max(1, Math.min(topology.pCores.length, 4)));
    } else {
      cores = topology.pCores.slice(0, Math.min(2, topology.pCores.length));
    }
  }

  // Nice-like target: -5 performance / 0 balanced / +5 quality
  // (mapeado para Windows priority class em _applyWindowsPriority)
  let niceTarget = preset === 'performance' ? -5 : preset === 'balanced' ? 0 : 5;

  // OOM protection: -500 em performance/balanced, 0 em quality (Linux only)
  const oomScore = preset === 'quality' ? 0 : -500;

  let affinityPromise, nicePromise, oomPromise;

  if (process.platform === 'win32') {
    // ── WINDOWS: PowerShell affinity + os.setPriority. Sem oom_score_adj. ──
    affinityPromise =
      cores.length > 0
        ? _applyWindowsAffinity(pid, cores)
        : Promise.resolve({ ok: true, skipped: 'quality-preset' });
    nicePromise = _applyWindowsPriority(pid, niceTarget);
    oomPromise = Promise.resolve({ ok: true, skipped: 'no-windows-equivalent' });
  } else if (process.platform === 'linux') {
    // ── LINUX: taskset + renice + oom_score_adj ──
    affinityPromise =
      cores.length > 0
        ? _applyTaskset(pid, cores)
        : Promise.resolve({ ok: true, skipped: 'quality-preset' });
    nicePromise = _applyRenice(pid, niceTarget).then(function (res) {
      if (!res.ok && niceTarget < 0) {
        // Retry with 0 (no CAP_SYS_NICE needed)
        return _applyRenice(pid, 0);
      }
      return res;
    });
    oomPromise = _applyOomScoreAdj(pid, oomScore);
  } else {
    // ── macOS/other: no-op ──
    affinityPromise = Promise.resolve({ ok: true, skipped: 'platform-' + process.platform });
    nicePromise = Promise.resolve({ ok: true, skipped: 'platform-' + process.platform });
    oomPromise = Promise.resolve({ ok: true, skipped: 'platform-' + process.platform });
  }

  const [affinity, nice, oom] = await Promise.all([affinityPromise, nicePromise, oomPromise]);

  logger.info(
    'CpuOptimizer: pid=' +
      pid +
      ' preset=' +
      preset +
      ' affinity=' +
      (affinity.ok ? '✓' : '✗') +
      ' nice=' +
      (nice.ok ? (nice.priority !== undefined ? nice.priority : '✓') : '✗') +
      ' oom=' +
      (oom.ok ? '✓' : '✗')
  );

  return { affinity: affinity, nice: nice, oom: oom, cores: cores };
}

/**
 * Snapshot do estado atual (para UI mostrar ao user).
 * @returns {Object}
 */
function getStats() {
  const topo = detectCoreTopology();
  return {
    topology: topo,
    appliedPids: _appliedPids.size,
    platform: process.platform
  };
}

/**
 * Reseta estado interno (para testes).
 */
function _reset() {
  _appliedPids.clear();
  _winPrioCache = null; // clear Windows constants cache
}

module.exports = {
  detectCoreTopology: detectCoreTopology,
  optimizeRenderer: optimizeRenderer,
  getStats: getStats,
  // exposed for tests
  _reset: _reset,
  _parseCpuList: _parseCpuList,
  _applyTaskset: _applyTaskset,
  _applyRenice: _applyRenice,
  _applyOomScoreAdj: _applyOomScoreAdj,
  _applyWindowsAffinity: _applyWindowsAffinity,
  _applyWindowsPriority: _applyWindowsPriority,
  _winPrioConstants: _winPrioConstants
};
