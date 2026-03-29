/**
 * Chromium Flags Configuration
 * Configura flags do Chromium baseado no perfil de hardware
 */

'use strict';

const { app } = require('electron');
const logger = require('../utils/logger');

// Flags universais (aplicadas em todos os perfis)
const UNIVERSAL_FLAGS = [
  'disable-background-timer-throttling',
  'disable-renderer-backgrounding',
  'disable-backgrounding-occluded-windows',
  'memory-pressure-off',
  'enable-highres-timer',
  'disable-hang-monitor'
];

// Flags de cache
const CACHE_FLAGS = {
  'disk-cache-size': '524288000',   // 500MB
  'media-cache-size': '134217728'   // 128MB
};

/**
 * Aplica flags para perfil Moderno
 * GPUs: RX 6000+, RTX 3000+, GTX 1600+
 */
function applyModernFlags() {
  const flags = [
    'ignore-gpu-blocklist',
    'enable-gpu-rasterization',
    'enable-zero-copy',
    'enable-native-gpu-memory-buffers',
    'canvas-oop-rasterization',
    'enable-accelerated-video-decode'
  ];
  
  flags.forEach(f => app.commandLine.appendSwitch(f));
  
  // D3D11 no Windows, OpenGL no Linux
  app.commandLine.appendSwitch('use-angle', process.platform === 'win32' ? 'd3d11' : 'gl');
  
  const features = process.platform === 'win32' 
    ? 'D3D11VideoDecoder,DirectComposition' 
    : 'VaapiVideoDecoder';
  app.commandLine.appendSwitch('enable-features', features);
  
  logger.info('Flags: D3D11/GL, GPU rasterization, zero-copy');
}

/**
 * Aplica flags para perfil Legacy
 * GPUs: GTX 900/1000, Radeon HD/RX 500, Intel HD
 */
function applyLegacyFlags() {
  const flags = [
    'ignore-gpu-blocklist',
    'in-process-gpu',
    'enable-accelerated-video-decode'
  ];
  
  flags.forEach(f => app.commandLine.appendSwitch(f));
  app.commandLine.appendSwitch('use-angle', process.platform === 'win32' ? 'd3d11' : 'gl');
  
  logger.info('Flags: D3D11/OpenGL, in-process-gpu');
}

/**
 * Aplica flags para perfil CPU Only
 * Para máquinas sem GPU dedicada ou com problemas de GPU
 */
function applyCpuFlags() {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  
  logger.info('Flags: CPU only (SwiftShader)');
}

/**
 * Aplica todas as flags do Chromium baseado no perfil de hardware
 * @param {string} profile - Perfil de hardware: 'modern', 'legacy', ou 'cpu'
 */
function applyFlags(profile) {
  // Flags universais
  UNIVERSAL_FLAGS.forEach(flag => app.commandLine.appendSwitch(flag));
  
  // Flags de cache
  Object.entries(CACHE_FLAGS).forEach(([key, value]) => {
    app.commandLine.appendSwitch(key, value);
  });
  
  logger.info(`Perfil de hardware: ${profile}`);
  
  // Flags específicas do perfil
  switch (profile) {
    case 'modern':
      applyModernFlags();
      break;
    case 'legacy':
      applyLegacyFlags();
      break;
    case 'cpu':
    default:
      applyCpuFlags();
      break;
  }
}

module.exports = {
  applyFlags,
  applyModernFlags,
  applyLegacyFlags,
  applyCpuFlags,
  UNIVERSAL_FLAGS,
  CACHE_FLAGS
};
