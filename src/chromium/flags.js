/**
 * Chromium Flags Configuration
 * NOTA: Electron 11 usa Chromium 87 - flags de Cr88+ causam crash no Linux
 */

'use strict';

const { app } = require('electron');
const logger = require('../utils/logger');

// Flags universais
const UNIVERSAL_FLAGS = [
  'disable-background-timer-throttling',
  'disable-renderer-backgrounding',
  'disable-backgrounding-occluded-windows',
  'memory-pressure-off',
  'enable-highres-timer',
  'disable-hang-monitor'
];

// Cache flags
const CACHE_FLAGS = {
  'disk-cache-size': '524288000',
  'media-cache-size': '134217728'
};

// Funções de perfil
const PROFILE_APPLIERS = {
  modern: () => {
    ['ignore-gpu-blocklist', 'enable-gpu-rasterization', 'enable-zero-copy', 'enable-accelerated-video-decode']
      .forEach(f => app.commandLine.appendSwitch(f));
    
    // Linux precisa de use-gl: desktop, não use-angle (causa crash no Chromium 87)
    if (process.platform === 'linux') {
      app.commandLine.appendSwitch('use-gl', 'desktop');
      app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
      logger.info('Flags: GPU, GL desktop, VA-API');
    } else {
      app.commandLine.appendSwitch('use-angle', 'd3d11');
      app.commandLine.appendSwitch('enable-features', 'D3D11VideoDecoder,DirectComposition');
      logger.info('Flags: GPU, D3D11, zero-copy');
    }
  },
  
  legacy: () => {
    ['ignore-gpu-blocklist', 'in-process-gpu', 'enable-accelerated-video-decode']
      .forEach(f => app.commandLine.appendSwitch(f));
    
    if (process.platform === 'linux') {
      app.commandLine.appendSwitch('use-gl', 'desktop');
      logger.info('Flags: GPU, in-process, GL desktop');
    } else {
      app.commandLine.appendSwitch('use-angle', 'd3d11');
      logger.info('Flags: GPU, in-process, D3D11');
    }
  },
  
  cpu: () => {
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('use-angle', 'swiftshader');
    logger.info('Flags: CPU only');
  }
};

/**
 * Aplica flags do Chromium baseado no perfil
 * @param {string} profile - 'modern', 'legacy', ou 'cpu'
 */
function applyFlags(profile) {
  UNIVERSAL_FLAGS.forEach(flag => app.commandLine.appendSwitch(flag));
  Object.entries(CACHE_FLAGS).forEach(([k, v]) => app.commandLine.appendSwitch(k, v));
  
  logger.info(`Perfil: ${profile}`);
  (PROFILE_APPLIERS[profile] || PROFILE_APPLIERS.cpu)();
}

module.exports = { applyFlags };
