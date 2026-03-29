/**
 * Naruto Online Launcher v1.7.1
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
const { applyFlags } = require('./chromium/flags');
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
// APP LIFECYCLE
// ============================================================
// Carrega config antes de app.ready
config = loadConfig();
applyFlags(config.hardwareProfile);

app.on('ready', () => {
  try { 
    process.priority = 1; 
  } catch (e) {
    logger.warn('N\u00E3o foi poss\u00EDvel definir prioridade do processo');
  }
  
  createMmsCfg(config.hardwareProfile);
  setupMenu(config, saveConfig);
  createWindow(config);
  
  logger.info('v1.7.1 Iniciado');
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
