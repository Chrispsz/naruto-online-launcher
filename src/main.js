/**
 * Naruto Online Launcher v1.7.0
 * Modularizado com logger estruturado e validação
 * 
 * SINGLE WINDOW - Flash PPAPI
 */

'use strict';

const { app } = require('electron');
const logger = require('./utils/logger');
const { loadConfig, saveConfig } = require('./config/settings');
const { findFlashPlugin, configureFlash } = require('./flash/plugin');
const { createMmsCfg } = require('./flash/mms');
const { createWindow, getMainWindow } = require('./window/create');
const { setupMenu } = require('./window/menu');

// Estado global
let config = null;

// ============================================================
// FLASH PPAPI
// ============================================================
app.commandLine.appendSwitch('enable-plugin-loading');

const flashPath = findFlashPlugin();
if (flashPath) {
  configureFlash(flashPath);
}

// ============================================================
// CHROMIUM FLAGS
// ============================================================
function applyHardwareFlags(profile) {
  // Flags universais
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('memory-pressure-off');
  app.commandLine.appendSwitch('enable-highres-timer');
  app.commandLine.appendSwitch('disable-hang-monitor');
  
  // Cache expandido
  app.commandLine.appendSwitch('disk-cache-size', '524288000');    // 500MB
  app.commandLine.appendSwitch('media-cache-size', '134217728');   // 128MB
  
  logger.info(`Perfil de hardware: ${profile}`);
  
  if (profile === 'modern') {
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
    app.commandLine.appendSwitch('canvas-oop-rasterization');
    app.commandLine.appendSwitch('enable-accelerated-video-decode');
    app.commandLine.appendSwitch('use-angle', process.platform === 'win32' ? 'd3d11' : 'gl');
    app.commandLine.appendSwitch('enable-features', 
      process.platform === 'win32' ? 'D3D11VideoDecoder,DirectComposition' : 'VaapiVideoDecoder');
    logger.info('Flags: D3D11/GL, GPU rasterization, zero-copy');
    
  } else if (profile === 'legacy') {
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('in-process-gpu');
    app.commandLine.appendSwitch('use-angle', process.platform === 'win32' ? 'd3d11' : 'gl');
    app.commandLine.appendSwitch('enable-accelerated-video-decode');
    logger.info('Flags: D3D11/OpenGL, in-process-gpu');
    
  } else {
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('use-angle', 'swiftshader');
    logger.info('Flags: CPU only (SwiftShader)');
  }
}

// ============================================================
// APP LIFECYCLE
// ============================================================
// Carrega config antes de app.ready
config = loadConfig();
applyHardwareFlags(config.hardwareProfile);

app.on('ready', () => {
  try { 
    process.priority = 1; 
  } catch (e) {
    logger.warn('N\u00E3o foi poss\u00EDvel definir prioridade do processo');
  }
  
  createMmsCfg(config.hardwareProfile);
  setupMenu(config, saveConfig);
  createWindow(config);
  
  logger.info('v1.7.0 Iniciado');
});

// Single instance
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.focus();
    }
  });
}

app.on('window-all-closed', () => app.exit(0));

// Erros não tratados
process.on('uncaughtException', (e) => logger.error('Exce\u00E7\u00E3o n\u00E3o tratada', e.message));
process.on('SIGTERM', () => app.exit(0));
process.on('SIGINT', () => app.exit(0));
