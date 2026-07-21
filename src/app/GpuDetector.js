/**
 * app/GpuDetector.js — Detecção real de GPU por marca (v1.0.0)
 *
 * Responsabilidade ÚNICA: identificar a GPU ativa do sistema (vendor + modelo)
 * para que o flags.js possa aplicar otimizações específicas por marca.
 *
 * Plataformas suportadas:
 *   - Linux: lê /proc/driver/nvidia (NVIDIA), /sys/class/drm/cardN/device (AMD/Intel),
 *            fallback lspci (se disponível). Detecta PRIME (Optimus laptops).
 *   - Windows: lê registry HKLM\SYSTEM\CurrentControlSet\Enum\PCI (vendor ID + desc).
 *   - macOS: sysctl igpu (Intel) / não suportado (Mac não roda Flash PPAPI).
 *
 * Cacheia o resultado em memória (detecção é cara, ~50ms com lspci).
 * Em AppImage, lspci pode não estar disponível — fallback para /sys/.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const logger = require('../utils/logger');

// PCI Vendor IDs padrão
const VENDOR_NVIDIA = 0x10de;
const VENDOR_AMD = 0x1002;
const VENDOR_INTEL = 0x8086;

// Mapa vendor ID → código interno
const VENDOR_MAP = {
  [VENDOR_NVIDIA]: 'nvidia',
  [VENDOR_AMD]: 'amd',
  [VENDOR_INTEL]: 'intel'
};

let _cache = null;

/**
 * Detecta se o sistema usa musl libc (Alpine Linux, Void Linux musl, etc).
 * musl NÃO usa arena-based malloc como glibc — MALLOC_ARENA_MAX é placebo lá.
 * Detecção: /lib/ld-musl-*.so.1 existe apenas em sistemas musl.
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
 * Detecta se o driver NVIDIA em uso é o proprietário (nvidia) ou o open-source (nouveau).
 * /proc/driver/nvidia só existe com o driver proprietário. nouveau expõe via
 * /sys/class/drm/cardN/device/driver = 'nouveau'.
 * Env vars __GL_* só funcionam com o driver proprietário — são placebo com nouveau.
 * @returns {boolean} true se driver proprietário NVIDIA carregado
 */
function _isNvidiaProprietary() {
  if (process.platform !== 'linux') return process.platform === 'win32'; // Win sempre proprietário
  try {
    return fs.existsSync('/proc/driver/nvidia');
  } catch (_) {
    return false;
  }
}

/**
 * Detecta PRIME (NVIDIA Optimus laptop com dGPU NVIDIA + iGPU Intel).
 * Em laptops Optimus, o X server roda na Intel e a NVIDIA é offload.
 * @returns {boolean}
 */
function _detectNvidiaPrimeLinux() {
  // Sinais de PRIME ativo
  if (process.env.__NV_PRIME_RENDER_OFFLOAD === '1') return true;
  if (process.env.DRI_PRIME === '1') return true;

  // /proc/driver/nvidia existe apenas quando o driver NVIDIA está carregado.
  // Em laptop com Intel iGPU + NVIDIA dGPU, ambos estão presentes.
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
 * Lista GPUs presentes no sistema Linux via /sys/class/drm.
 * Retorna array de { vendor: 'nvidia'|'amd'|'intel', vendorId, deviceId, description, cardN }.
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
        if (!code) continue; // desconhecido (provável não-GPU)

        const deviceRaw = fs.existsSync(devicePath)
          ? fs.readFileSync(devicePath, 'utf8').trim()
          : '0x0000';
        const deviceId = parseInt(deviceRaw, 16);

        // Tenta pegar descrição amigável do uevent (DRM_DRIVER=amdgpu etc)
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
 * Fallback: lista GPUs via `lspci` (se disponível).
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
      // Display controller ou VGA compatible controller
      if (!/VGA compatible controller|Display controller|3D controller/i.test(line)) continue;
      // Formato -nn -mm: "00:02.0 "VGA compatible controller" "Intel" "HD Graphics" [-device -vendor]"
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
 * Lista GPUs no Windows lendo o registry PCI.
 * @returns {Array<Object>}
 */
function _listGpusWindows() {
  if (process.platform !== 'win32') return [];
  // wmic está removido no Windows 11 24H2+ e Windows Server 2025.
  // Tenta wmic primeiro (rápido, ~1s), fallback PowerShell (mais lento ~3s).
  var gpus = _listGpusWindowsWmic();
  if (gpus.length > 0) return gpus;
  return _listGpusWindowsPowershell();
}

/**
 * Lista GPUs no Windows via wmic.
 * NOTA: wmic está DEPRECATED e foi REMOVIDO no Windows 11 24H2+.
 * Ainda funciona em Win10 e Win11 builds anteriores a 26100.
 * Se falhar, o fallback _listGpusWindowsPowershell() é usado.
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
 * Detecta a GPU ATIVA (a que está renderizando o Electron agora).
 *
 * Em desktop: a primeira GPU da lista.
 * Em laptop Optimus: detecta PRIME e marca a NVIDIA como ativa quando
 * __NV_PRIME_RENDER_OFFLOAD=1, senão a Intel é a ativa (mas a NVIDIA
 * está disponível para offload).
 *
 * @returns {Object} { vendor, vendorId, deviceId, description, isPrime, allGpus }
 */
function detect() {
  if (_cache) return _cache;

  let gpus = [];
  if (process.platform === 'linux') {
    // Detecta sandbox (Flatpak/Snap) — GPU detection via sysfs/lspci pode falhar
    var sandbox = detectLinuxSandbox();
    if (sandbox) {
      logger.info(
        'GpuDetector: detectado sandbox ' + sandbox + ' — GPU detection pode ser limitada'
      );
    }
    gpus = _listGpusLinuxSysfs();
    if (gpus.length === 0) gpus = _listGpusLinuxLspci();
    if (gpus.length === 0 && sandbox) {
      logger.warn(
        'GpuDetector: nenhuma GPU detectada em sandbox ' +
          sandbox +
          ' — o jogo usará renderização software (swiftshader). ' +
          'Para GPU passthrough, use flatpak override ou snap interface gpu.'
      );
    }
  } else if (process.platform === 'win32') {
    gpus = _listGpusWindows();
  }

  const isPrime = process.platform === 'linux' && _detectNvidiaPrimeLinux();

  // Determina GPU ativa:
  // - Em PRIME ativo (__NV_PRIME_RENDER_OFFLOAD=1), NVIDIA é a ativa.
  // - Senão, em PRIME passivo (Intel iGPU + NVIDIA dGPU disponível), Intel é a ativa.
  // - Senão, primeira GPU da lista.
  let active = null;
  if (gpus.length > 0) {
    if (isPrime && process.env.__NV_PRIME_RENDER_OFFLOAD === '1') {
      active =
        gpus.find(function (g) {
          return g.vendor === 'nvidia';
        }) || gpus[0];
    } else if (isPrime) {
      // PRIME passivo: Intel iGPU está ativa (X server roda nela)
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
 * Retorna as variáveis de ambiente específicas da GPU ativa.
 * Estas são aplicadas NO PROCESSO DO ELECTRON ANTES do Chromium iniciar o
 * GPU process — portanto devem ser setadas em main.js top-level ou flags.js.
 *
 * @param {string} preset - 'performance'|'balanced'|'quality'
 * @returns {Object} env vars to set
 */
function getEnvVars(preset) {
  const gpu = detect();
  const env = {};

  // ── Comum a todas as GPUs ──
  // Reduz fragmentação de memória do V8/Flash (glibc malloc).
  // 2 arenas é o suficiente para single-threaded-heavy workload como Flash.
  // PLACEBO em musl libc (Alpine, Void musl) — musl não usa arena-based malloc.
  if (!_isMusl()) {
    env.MALLOC_ARENA_MAX = '2';
  } else {
    logger.info('GpuDetector: musl libc detectado — MALLOC_ARENA_MAX skipado (placebo)');
  }

  if (gpu.vendor === 'nvidia') {
    // __GL_* vars só funcionam com driver NVIDIA proprietário. Com nouveau são placebo.
    if (!_isNvidiaProprietary()) {
      logger.info('GpuDetector: nouveau detectado — __GL_* vars skipadas (placebo com nouveau)');
    } else {
      // Threaded optimizations: driver NVIDIA cria threads auxiliares para
      // upload de texturas e command buffer building. OFF por default em alguns
      // drivers. ON = ganho real de FPS em Flash (que é CPU-bound no renderer).
      env.__GL_THREADED_OPTIMIZATIONS = '1';

      // Vsync controlado pelo Chromium (não pelo driver). Performance preset
      // desabilita vsync do driver pra reduzir input lag.
      if (preset === 'performance') {
        env.__GL_SYNC_TO_VBLANK = '0';
      }

      // PRIME offload: se a NVIDIA está disponível mas não ativa, força offload
      // para renderizar na dGPU (ganho real em laptops Optimus).
      if (gpu.isPrime && process.env.__NV_PRIME_RENDER_OFFLOAD !== '1') {
        env.__NV_PRIME_RENDER_OFFLOAD = '1';
        env.__GLX_VENDOR_LIBRARY_NAME = 'nvidia';
        logger.info('GpuDetector: PRIME offload ativado (dGPU NVIDIA forçada)');
      }
    }
  } else if (gpu.vendor === 'amd') {
    // Mesa radeonsi (AMD open-source). zerovram = zera VRAM em context destroy
    // (evita leak de memória de texturas não-liberadas — Flash é ruim nisso).
    // Documentação: https://docs.mesa3d.org/envvars.html
    env.RADEONSI_ZERO_VRAM = '1';
    // RADEONSI_CLEAR_DB_SHADER_CACHE removido — não é uma env var reconhecida
    // pelo Mesa radeonsi. Setá-la era placebo. O cache de DB shader é
    // gerenciado automaticamente pelo driver (limpo em context destroy).

    // MESA_SHADER_CACHE: mantém cache habilitado em todos os presets (default).
    // Desabilitar (MESA_SHADER_CACHE_DISABLE=1) só ajuda em benchmarks sintéticos
    // — no uso real, o cache economiza 1-3s no warm-up de shaders. Removido.
  } else if (gpu.vendor === 'intel') {
    // NOTE: LIBVA_DRIVER_NAME removido — VAAPI é para HTML5 <video> hardware decode.
    // Flash PPAPI faz decode de vídeo internamente; VAAPI não afeta Flash.

    if (preset === 'performance') {
      // norbc = NO Render Buffer Compression. É um flag de DEBUG de estabilidade
      // (desabilita CCS que pode causar artefatos em Flash), NÃO de performance.
      // Mantém por estabilidade em drivers Intel problemáticos.
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
 * Fallback: lista GPUs no Windows via PowerShell Get-CimInstance.
 * Funciona em Win11 24H2+ (onde wmic foi removido) e Windows Server.
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
 * Executa Get-CimInstance via um binário PowerShell específico.
 * @param {string} bin - 'powershell' ou 'pwsh'
 * @returns {string|null} stdout ou null se falhou
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
 * Detecta se o launcher está rodando dentro de um sandbox Linux (Flatpak, Snap).
 * Nestes ambientes, /sys/class/drm e /proc/driver/nvidia podem não estar acessíveis.
 * A detecção de GPU via sysfs/lspci falha silenciosamente — logamos um aviso.
 * @returns {string|null} 'flatpak'|'snap'|null
 */
function detectLinuxSandbox() {
  if (process.platform !== 'linux') return null;
  // Flatpak: FLATPAK_ID é setado pelo runtime
  if (process.env.FLATPAK_ID) return 'flatpak';
  // Snap: SNAP_NAME é setado pelo snapd
  if (process.env.SNAP_NAME) return 'snap';
  return null;
}

module.exports = {
  detect: detect,
  getEnvVars: getEnvVars,
  // expostos p/ testes
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
