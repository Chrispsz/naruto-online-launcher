/**
 * main/flags.js — Single source of truth: Chromium 87 command-line flags (v4.0.0)
 *
 * Consolidado e enxugado de v3.6.2.
 * Merge único de disable-features, enable-features e js-flags.
 */

'use strict';

const os = require('os');
const { app } = require('electron');

const TOTAL_RAM_GB = os.totalmem() / (1024 * 1024 * 1024);
const CPU_CORES = os.cpus().length;
const IS_WAYLAND = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;

const _disabled = new Set([
  'IsolateOrigins',
  'site-per-process',
  'Translate',
  'MediaRouter',
  'BackForwardCache'
]);
const _enabled = new Set(['VizDisplayCompositor']);
const _jsFlags = [];
let _applied = false;

/**
 * Compute the V8 heap size in MB based on available RAM.
 * @param {boolean} [forceLowSpec=false] - Force low-RAM mode
 * @returns {number} heap size in MB
 */
function _computeHeapMB(forceLowSpec) {
  const low = forceLowSpec || TOTAL_RAM_GB < 4;
  if (low) return 384;
  if (TOTAL_RAM_GB < 8) return 768;
  if (TOTAL_RAM_GB < 16) return 1024;
  return 1536;
}

/**
 * Aplica TODAS as flags. Idempotente (só roda 1x).
 * @param {Object} opts - { flashPath, flashVersion, hardwareProfile, forceLowSpec }
 */
function applyAll(opts) {
  opts = opts || {};
  if (_applied) return;
  _applied = true;

  const low = !!opts.forceLowSpec || TOTAL_RAM_GB < 4;

  // Sandbox (global — PPAPI precisa)
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-setuid-sandbox');

  // Plugins
  app.commandLine.appendSwitch('always-authorize-plugins');
  app.commandLine.appendSwitch('allow-outdated-plugins');

  // Background throttling off
  // NOTE: disable-background-networking, disable-component-update, disable-default-apps,
  // disable-extensions, disable-translate, disable-domain-reliability, disable-client-side-
  // phishing-detection são PLACEBO para Flash PPAPI (não afetam o plugin), mas são
  // harmlessness e reduzem ruído de rede/processos. Mantidos.
  [
    'disable-background-timer-throttling',
    'disable-renderer-backgrounding',
    'disable-backgrounding-occluded-windows',
    'disable-hang-monitor',
    'disable-background-networking',
    'disable-component-update',
    'disable-default-apps',
    'disable-extensions',
    'disable-translate',
    'disable-domain-reliability',
    'disable-client-side-phishing-detection'
  ].forEach(function (f) {
    app.commandLine.appendSwitch(f);
  });

  // GPU
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('disable-plugin-power-saver');

  // Cache
  app.commandLine.appendSwitch('disk-cache-size', low ? '134217728' : '268435456');

  // Hardware profile
  if (opts.hardwareProfile === 'cpu') {
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('num-raster-threads', String(Math.min(CPU_CORES, 4)));
    app.commandLine.appendSwitch('use-gl', process.platform === 'linux' ? 'swiftshader' : '');
  } else {
    // NOTE: enable-accelerated-video-decode is PLACEBO for Flash PPAPI.
    // Flash does its own video decoding internally; this flag only affects
    // HTML5 <video>. Kept because it's harmless and may help non-Flash content.
    app.commandLine.appendSwitch('enable-accelerated-video-decode');
    if (process.platform === 'linux' && !IS_WAYLAND) {
      app.commandLine.appendSwitch('use-gl', 'desktop');
      // NOTE: VaapiVideoDecoder is PLACEBO for Flash PPAPI.
      // VAAPI decode is for HTML5 <video>; Flash uses its own decoder.
      // Kept because it's harmless and may help non-Flash content.
      _enabled.add('VaapiVideoDecoder');
    }
  }

  // JS heap
  _jsFlags.push('--max-old-space-size=' + _computeHeapMB(opts.forceLowSpec));

  // Flash
  if (opts.flashPath) {
    app.commandLine.appendSwitch('ppapi-flash-path', opts.flashPath);
    if (opts.flashVersion) app.commandLine.appendSwitch('ppapi-flash-version', opts.flashVersion);
  }

  // Merge único
  app.commandLine.appendSwitch('disable-features', Array.from(_disabled).join(','));
  app.commandLine.appendSwitch('enable-features', Array.from(_enabled).join(','));
  app.commandLine.appendSwitch('js-flags', _jsFlags.join(' '));

  app.name = 'Naruto Online';
}

/**
 * Returns a snapshot of the applied flag state.
 * @returns {{ applied: boolean, heapMB: number, disabled: string[], enabled: string[], jsFlags: string[] }}
 */
function getAppliedSnapshot() {
  return {
    applied: _applied,
    heapMB: _computeHeapMB(false),
    disabled: Array.from(_disabled),
    enabled: Array.from(_enabled),
    jsFlags: _jsFlags.slice()
  };
}

module.exports = {
  applyAll,
  getAppliedSnapshot,
  IS_LOW_SPEC: TOTAL_RAM_GB < 4,
  IS_MINIMAL: TOTAL_RAM_GB < 2,
  IS_WAYLAND: IS_WAYLAND,
  SYSTEM_RAM_GB: Math.round(TOTAL_RAM_GB * 10) / 10
};
