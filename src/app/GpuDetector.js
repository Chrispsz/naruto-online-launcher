/**
 * app/GpuDetector.js — Real GPU detection by brand
 *
 * Single Responsibility: identify the active GPU (vendor + model)
 * so flags.js can apply brand-specific optimizations.
 *
 * Supported platforms:
 *   - Linux: reads /proc/driver/nvidia (NVIDIA), /sys/class/drm/cardN/device (AMD/Intel),
 *            fallback lspci (if available). Detects PRIME (Optimus laptops).
 *   - Windows: reads registry HKLM\SYSTEM\CurrentControlSet\Enum\PCI (vendor ID + desc).
 *   - macOS: sysctl igpu (Intel) / not supported (Mac doesn't run Flash PPAPI).
 *
 * Caches result in memory (detection is expensive, ~50ms with lspci).
 * In AppImage, lspci may not be available — fallback to /sys/.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const logger = require('../utils/logger');

// Standard PCI Vendor IDs
const VENDOR_NVIDIA = 0x10de;
const VENDOR_AMD = 0x1002;
const VENDOR_INTEL = 0x8086;

// Vendor ID → internal code map
const VENDOR_MAP = {
  [VENDOR_NVIDIA]: 'nvidia',
  [VENDOR_AMD]: 'amd',
  [VENDOR_INTEL]: 'intel'
};

let _cache = null;

/**
 * Detects if the system uses musl libc (Alpine Linux, Void Linux musl, etc).
 * musl does NOT use arena-based malloc like glibc — MALLOC_ARENA_MAX is placebo there.
 * Detection: /lib/ld-musl-*.so.1 exists only on musl systems.
 * @returns {boolean}
 */
function _isMusl() {
  if (process.platform !== 'linux') return false;
  try {
    const libDir = fs.readdirSync('/lib');
    return libDir.some(function (f) {
      return /^ld-musl-/.test(f);
    });
  } catch (_) {
    return false;
  }
}

/**
 * Detects if the NVIDIA driver in use is proprietary (nvidia) or open-source (nouveau).
 * /proc/driver/nvidia only exists with the proprietary driver. nouveau exposes via
 * /sys/class/drm/cardN/device/driver = 'nouveau'.
 * Env vars __GL_* only work with the proprietary driver — they are placebo with nouveau.
 * @returns {boolean} true if proprietary NVIDIA driver loaded
 */
function _isNvidiaProprietary() {
  if (process.platform !== 'linux') return process.platform === 'win32'; // Win always proprietary
  try {
    return fs.existsSync('/proc/driver/nvidia');
  } catch (_) {
    return false;
  }
}

/**
 * Detects PRIME (NVIDIA Optimus laptop with NVIDIA dGPU + Intel iGPU).
 * On Optimus laptops, the X server runs on Intel and NVIDIA is offload.
 * @returns {boolean}
 */
function _detectNvidiaPrimeLinux() {
  // Signs of active PRIME
  if (process.env.__NV_PRIME_RENDER_OFFLOAD === '1') return true;
  if (process.env.DRI_PRIME === '1') return true;

  // /proc/driver/nvidia only exists when NVIDIA driver is loaded.
  // On laptop with Intel iGPU + NVIDIA dGPU, both are present.
  try {
    const hasNvidia = fs.existsSync('/proc/driver/nvidia');
    const hasIntel =
      fs.existsSync('/sys/class/drm/card0/device/vendor') &&
      fs.readFileSync('/sys/class/drm/card0/device/vendor', 'utf8').trim() === '0x8086';
    return hasNvidia && hasIntel;
  } catch (_) {
    return false;
  }
}

/**
 * Lists GPUs present on Linux via /sys/class/drm.
 * Returns array of { vendor: 'nvidia'|'amd'|'intel', vendorId, deviceId, description, cardN }.
 * @returns {Array<Object>}
 */
function _listGpusLinuxSysfs() {
  const gpus = [];
  try {
    const drmDir = '/sys/class/drm';
    if (!fs.existsSync(drmDir)) return gpus;

    const cards = fs.readdirSync(drmDir).filter(function (n) {
      return /^card\d+$/.test(n);
    });

    for (const cardN of cards) {
      const vendorPath = path.join(drmDir, cardN, 'device', 'vendor');
      const devicePath = path.join(drmDir, cardN, 'device', 'device');
      const ueventPath = path.join(drmDir, cardN, 'device', 'uevent');
      try {
        if (!fs.existsSync(vendorPath)) continue;
        const vendorRaw = fs.readFileSync(vendorPath, 'utf8').trim();
        const vendorId = parseInt(vendorRaw, 16);
        const code = VENDOR_MAP[vendorId];
        if (!code) continue; // unknown (likely not a GPU)

        const deviceRaw = fs.existsSync(devicePath)
          ? fs.readFileSync(devicePath, 'utf8').trim()
          : '0x0000';
        const deviceId = parseInt(deviceRaw, 16);

        // Try to get friendly description from uevent (DRM_DRIVER=amdgpu etc)
        let driver = '';
        let description = code.toUpperCase() + ' GPU';
        if (fs.existsSync(ueventPath)) {
          const uevent = fs.readFileSync(ueventPath, 'utf8');
          const m = uevent.match(/DRM_DRIVER=(\S+)/);
          if (m) driver = m[1];
          const m2 = uevent.match(/PCI_CLASS=(\S+)/);
          if (m2 && m2[1].toUpperCase().startsWith('030000')) {
            // 030000 = Display controller (VGA)
            description = code.toUpperCase() + ' (' + driver + ')';
          }
        }

        gpus.push({
          vendor: code,
          vendorId: vendorId,
          deviceId: deviceId,
          driver: driver,
          description: description,
          cardN: cardN
        });
      } catch (_) {
        /* skip */
      }
    }
  } catch (_) {
    /* skip */
  }
  return gpus;
}

/**
 * Fallback: lists GPUs via `lspci` (if available).
 * @returns {Array<Object>}
 */
function _listGpusLinuxLspci() {
  try {
    const out = execFileSync('lspci', ['-nn', '-mm'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const gpus = [];
    const lines = out.split('\n');
    for (const line of lines) {
      // Display controller or VGA compatible controller
      if (!/VGA compatible controller|Display controller|3D controller/i.test(line)) continue;
      // Format -nn -mm: "00:02.0 "VGA compatible controller" "Intel" "HD Graphics" [-device -vendor]"
      const m = line.match(/"([^"]+)"\s+"([^"]+)"\s+"([^"]*)"(?:\s+\[([0-9a-f]+):([0-9a-f]+)\])?/i);
      if (!m) continue;
      const vendorName = m[2].toLowerCase();
      let code = null;
      if (vendorName.indexOf('nvidia') !== -1) code = 'nvidia';
      else if (
        vendorName.indexOf('amd') !== -1 ||
        vendorName.indexOf('advanced micro devices') !== -1 ||
        vendorName.indexOf('radeon') !== -1
      )
        code = 'amd';
      else if (vendorName.indexOf('intel') !== -1) code = 'intel';
      if (!code) continue;

      const vendorId = m[4] ? parseInt(m[4], 16) : 0;
      const deviceId = m[5] ? parseInt(m[5], 16) : 0;
      gpus.push({
        vendor: code,
        vendorId: vendorId,
        deviceId: deviceId,
        driver: '',
        description: m[2] + ' ' + (m[3] || ''),
        cardN: null
      });
    }
    return gpus;
  } catch (_) {
    return [];
  }
}

/**
 * Lists GPUs on Windows by reading the PCI registry.
 * @returns {Array<Object>}
 */
function _listGpusWindows() {
  if (process.platform !== 'win32') return [];
  // wmic was removed in Windows 11 24H2+ and Windows Server 2025.
  // Tries wmic first (fast, ~1s), fallback PowerShell (slower ~3s).
  var gpus = _listGpusWindowsWmic();
  if (gpus.length > 0) return gpus;
  return _listGpusWindowsPowershell();
}

/**
 * Lists GPUs on Windows via wmic.
 * NOTE: wmic is DEPRECATED and was REMOVED in Windows 11 24H2+.
 * Still works on Win10 and Win11 builds prior to 26100.
 * If it fails, the fallback _listGpusWindowsPowershell() is used.
 * @returns {Array<Object>}
 */
function _listGpusWindowsWmic() {
  try {
    const out = execFileSync(
      'wmic',
      ['path', 'win32_VideoController', 'get', 'AdapterCompatibility,Name,PNPDeviceID'],
      { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const gpus = [];
    const lines = out.split('\n').slice(1); // skip header
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(/\s{2,}/).filter(Boolean);
      if (parts.length < 3) continue;
      const vendorName = parts[0].toLowerCase();
      const name = parts[1];
      const pnp = parts[2];

      let code = null;
      if (vendorName.indexOf('nvidia') !== -1) code = 'nvidia';
      else if (vendorName.indexOf('amd') !== -1 || vendorName.indexOf('radeon') !== -1)
        code = 'amd';
      else if (vendorName.indexOf('intel') !== -1) code = 'intel';
      if (!code) continue;

      // PNPDeviceID: PCI\VEN_10DE&DEV_...
      const m = pnp.match(/VEN_([0-9A-Fa-f]{4})&DEV_([0-9A-Fa-f]{4})/);
      const vendorId = m ? parseInt(m[1], 16) : 0;
      const deviceId = m ? parseInt(m[2], 16) : 0;

      gpus.push({
        vendor: code,
        vendorId: vendorId,
        deviceId: deviceId,
        driver: '',
        description: name,
        cardN: null
      });
    }
    return gpus;
  } catch (_) {
    return [];
  }
}

/**
 * Detects the ACTIVE GPU (the one rendering Electron now).
 *
 * On desktop: the first GPU in the list.
 * On Optimus laptop: detects PRIME and marks NVIDIA as active when
 * __NV_PRIME_RENDER_OFFLOAD=1, otherwise Intel is the active one (but NVIDIA
 * is available for offload).
 *
 * @returns {Object} { vendor, vendorId, deviceId, description, isPrime, allGpus }
 */
function detect() {
  if (_cache) return _cache;

  let gpus = [];
  if (process.platform === 'linux') {
    // Detect sandbox (Flatpak/Snap) — GPU detection via sysfs/lspci may fail
    var sandbox = detectLinuxSandbox();
    if (sandbox) {
      logger.info(
        'GpuDetector: detected sandbox ' + sandbox + ' — GPU detection may be limited'
      );
    }
    gpus = _listGpusLinuxSysfs();
    if (gpus.length === 0) gpus = _listGpusLinuxLspci();
    if (gpus.length === 0 && sandbox) {
      logger.warn(
        'GpuDetector: no GPU detected in sandbox ' +
          sandbox +
          ' — the game will use software rendering (swiftshader). ' +
          'For GPU passthrough, use flatpak override or snap interface gpu.'
      );
    }
  } else if (process.platform === 'win32') {
    gpus = _listGpusWindows();
  }

  const isPrime = process.platform === 'linux' && _detectNvidiaPrimeLinux();

  // Determines active GPU:
  // - With active PRIME (__NV_PRIME_RENDER_OFFLOAD=1), NVIDIA is the active one.
  // - Otherwise, with passive PRIME (Intel iGPU + NVIDIA dGPU available), Intel is active.
  // - Otherwise, first GPU in the list.
  let active = null;
  if (gpus.length > 0) {
    if (isPrime && process.env.__NV_PRIME_RENDER_OFFLOAD === '1') {
      active =
        gpus.find(function (g) {
          return g.vendor === 'nvidia';
        }) || gpus[0];
    } else if (isPrime) {
      // Passive PRIME: Intel iGPU is active (X server runs on it)
      active =
        gpus.find(function (g) {
          return g.vendor === 'intel';
        }) || gpus[0];
    } else {
      active = gpus[0];
    }
  }

  _cache = {
    vendor: active ? active.vendor : 'unknown',
    vendorId: active ? active.vendorId : 0,
    deviceId: active ? active.deviceId : 0,
    description: active ? active.description : 'Unknown GPU',
    isPrime: isPrime,
    hasNvidia: gpus.some(function (g) {
      return g.vendor === 'nvidia';
    }),
    hasAmd: gpus.some(function (g) {
      return g.vendor === 'amd';
    }),
    hasIntel: gpus.some(function (g) {
      return g.vendor === 'intel';
    }),
    allGpus: gpus
  };

  logger.info(
    'GpuDetector: active=' +
      _cache.vendor +
      ' (' +
      _cache.description +
      ')' +
      (isPrime ? ' [PRIME]' : '') +
      ' all=[' +
      gpus
        .map(function (g) {
          return g.vendor;
        })
        .join(',') +
      ']'
  );

  return _cache;
}

/**
 * Returns GPU-specific environment variables.
 * These are applied TO THE ELECTRON PROCESS BEFORE Chromium starts the
 * GPU process — therefore must be set in main.js top-level or flags.js.
 *
 * @param {string} preset - 'performance'|'balanced'|'quality'
 * @returns {Object} env vars to set
 */
function getEnvVars(preset) {
  const gpu = detect();
  const env = {};

  // ── Common to all GPUs ──
  // Reduces V8/Flash memory fragmentation (glibc malloc).
  // 2 arenas is sufficient for single-threaded-heavy workload like Flash.
  // PLACEBO on musl libc (Alpine, Void musl) — musl doesn't use arena-based malloc.
  if (!_isMusl()) {
    env.MALLOC_ARENA_MAX = '2';
  } else {
    logger.info('GpuDetector: musl libc detected — MALLOC_ARENA_MAX skipped (placebo)');
  }

  if (gpu.vendor === 'nvidia') {
    // __GL_* vars only work with proprietary NVIDIA driver. With nouveau they are placebo.
    if (!_isNvidiaProprietary()) {
      logger.info('GpuDetector: nouveau detected — __GL_* vars skipped (placebo with nouveau)');
    } else {
      // Threaded optimizations: NVIDIA driver creates auxiliary threads for
      // texture upload and command buffer building. OFF by default on some
      // drivers. ON = real FPS gain in Flash (which is CPU-bound on the renderer).
      env.__GL_THREADED_OPTIMIZATIONS = '1';

      // Vsync controlled by Chromium (not by the driver). Performance preset
      // disables driver vsync to reduce input lag.
      if (preset === 'performance') {
        env.__GL_SYNC_TO_VBLANK = '0';
      }

      // PRIME offload: if NVIDIA is available but not active, forces offload
      // para renderizar na dGPU (ganho real em laptops Optimus).
      if (gpu.isPrime && process.env.__NV_PRIME_RENDER_OFFLOAD !== '1') {
        env.__NV_PRIME_RENDER_OFFLOAD = '1';
        env.__GLX_VENDOR_LIBRARY_NAME = 'nvidia';
        logger.info('GpuDetector: PRIME offload activated (dGPU NVIDIA forced)');
      }
    }
  } else if (gpu.vendor === 'amd') {
    // Mesa radeonsi (AMD open-source). zerovram = zera VRAM em context destroy
    // (prevents memory leak of unreleased textures — Flash is bad at this).
    // Documentação: https://docs.mesa3d.org/envvars.html
    env.RADEONSI_ZERO_VRAM = '1';
    // RADEONSI_CLEAR_DB_SHADER_CACHE removed — is not a recognized env var
    // by Mesa radeonsi. Setting it was placebo. The DB shader cache is
    // managed automatically by the driver (cleared on context destroy).

    // MESA_SHADER_CACHE: keeps cache enabled in all presets (default).
    // Disabling (MESA_SHADER_CACHE_DISABLE=1) only helps in synthetic benchmarks
    // — in real usage, the cache saves 1-3s on shader warm-up. Removed.
  } else if (gpu.vendor === 'intel') {
    // NOTE: LIBVA_DRIVER_NAME removed — VAAPI is for HTML5 <video> hardware decode.
    // Flash PPAPI does video decode internally; VAAPI doesn't affect Flash.

    if (preset === 'performance') {
      // norbc = NO Render Buffer Compression. It is a DEBUG flag for stability
      // (disables CCS which can cause artifacts in Flash), NOT for performance.
      // Kept for stability on problematic Intel drivers.
      env.INTEL_DEBUG = 'norbc';
    }
  }

  // ── MESA comum (AMD/Intel) ──
  if (gpu.vendor === 'amd' || gpu.vendor === 'intel') {
    // vblank_mode: 0=never sync, 1=sync if desktop compositor active, 3=default
    if (preset === 'performance') {
      env.vblank_mode = '0'; // sem vsync
    }
  }

  return env;
}

/**
 * Reseta o cache (para testes).
 */
function _resetCache() {
  _cache = null;
}

/**
 * Fallback: lists GPUs on Windows via PowerShell Get-CimInstance.
 * Works on Win11 24H2+ (where wmic was removed) and Windows Server.
 * Tenta powershell.exe (v5.1) primeiro, fallback pwsh.exe (PowerShell 7+).
 * Get-CimInstance é o substituto moderno do wmic.
 * @returns {Array<Object>}
 */
function _listGpusWindowsPowershell() {
  try {
    // Tenta powershell.exe primeiro, fallback pwsh.exe
    var out = _tryPowershellGpu('powershell');
    if (!out) out = _tryPowershellGpu('pwsh');
    if (!out) return [];
    return _parsePowershellGpuCsv(out);
  } catch (_) {
    return [];
  }
}

/**
 * Executes Get-CimInstance via a specific PowerShell binary.
 * @param {string} bin - 'powershell' or 'pwsh'
 * @returns {string|null} stdout or null if failed
 */
function _tryPowershellGpu(bin) {
  try {
    var out = execFileSync(
      bin,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object AdapterCompatibility,Name,PNPDeviceID | ConvertTo-Csv -NoTypeInformation'
      ],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out;
  } catch (_) {
    return null;
  }
}

/**
 * Parseia CSV do Get-CimInstance Win32_VideoController.
 * @param {string} out
 * @returns {Array<Object>}
 */
function _parsePowershellGpuCsv(out) {
  var gpus = [];
  var lines = out.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.indexOf('#') === 0) continue;
    // CSV: "AdapterCompatibility","Name","PNPDeviceID"
    var parts = [];
    var current = '';
    var inQuotes = false;
    for (var j = 0; j < line.length; j++) {
      var ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current.trim());
    if (parts.length < 3) continue;
    var vendorName = parts[0].toLowerCase();
    var name = parts[1];
    var pnp = parts[2];

    var code = null;
    if (vendorName.indexOf('nvidia') !== -1) code = 'nvidia';
    else if (vendorName.indexOf('amd') !== -1 || vendorName.indexOf('radeon') !== -1) code = 'amd';
    else if (vendorName.indexOf('intel') !== -1) code = 'intel';
    if (!code) continue;

    var m = pnp.match(/VEN_([0-9A-Fa-f]{4})&DEV_([0-9A-Fa-f]{4})/);
    var vendorId = m ? parseInt(m[1], 16) : 0;
    var deviceId = m ? parseInt(m[2], 16) : 0;

    gpus.push({
      vendor: code,
      vendorId: vendorId,
      deviceId: deviceId,
      driver: '',
      description: name,
      cardN: null
    });
  }
  return gpus;
}

/**
 * Detects if launcher is running inside a Linux sandbox (Flatpak, Snap).
 * In these environments, /sys/class/drm and /proc/driver/nvidia may not be accessible.
 * GPU detection via sysfs/lspci fails silently — we log a warning.
 * @returns {string|null} 'flatpak'|'snap'|null
 */
function detectLinuxSandbox() {
  if (process.platform !== 'linux') return null;
  // Flatpak: FLATPAK_ID is set by the runtime
  if (process.env.FLATPAK_ID) return 'flatpak';
  // Snap: SNAP_NAME is set by snapd
  if (process.env.SNAP_NAME) return 'snap';
  return null;
}

module.exports = {
  detect: detect,
  getEnvVars: getEnvVars,
  // exposed for tests
  _resetCache: _resetCache,
  _listGpusLinuxSysfs: _listGpusLinuxSysfs,
  _listGpusLinuxLspci: _listGpusLinuxLspci,
  _listGpusWindowsWmic: _listGpusWindowsWmic,
  _listGpusWindowsPowershell: _listGpusWindowsPowershell,
  _detectNvidiaPrimeLinux: _detectNvidiaPrimeLinux,
  _isMusl: _isMusl,
  _isNvidiaProprietary: _isNvidiaProprietary,
  detectLinuxSandbox: detectLinuxSandbox,
  VENDOR_NVIDIA: VENDOR_NVIDIA,
  VENDOR_AMD: VENDOR_AMD,
  VENDOR_INTEL: VENDOR_INTEL,
  VENDOR_MAP: VENDOR_MAP
};
