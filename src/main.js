/**
 * Naruto Online Launcher v1.8.0
 * Otimizações: Trie blocker, debounce cookies, preconnect
 * 
 * SINGLE WINDOW - Flash PPAPI
 */

'use strict';

const { app } = require('electron');
const os = require('os');
const logger = require('./utils/logger');
const { loadConfig, saveConfig } = require('./config/settings');
const { findFlashPlugin, configureFlash } = require('./flash/plugin');
const { createMmsCfg } = require('./flash/mms');
const { applyFlags } = require('./chromium/flags');
const { createWindow, getMainWindow, preconnectServers } = require('./window/create');
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
// PROCESS PRIORITY
// ============================================================
const PRIORITY_MAP = {
  'cpu': os.constants.priority.PRIORITY_BELOW_NORMAL,  // 10
  'legacy': os.constants.priority.PRIORITY_NORMAL,     // 0
  'modern': os.constants.priority.PRIORITY_NORMAL      // 0
};

function setProcessPriority(profile) {
  try {
    const priority = PRIORITY_MAP[profile] ?? os.constants.priority.PRIORITY_NORMAL;
    os.setPriority(process.pid, priority);
    logger.info(`Process priority: ${priority} (${profile})`);
  } catch (err) {
    logger.warn(`Could not set process priority: ${err.message}`);
  }
}

// ============================================================
// APP LIFECYCLE
// ============================================================
// Carrega config antes de app.ready
config = loadConfig();
applyFlags(config.hardwareProfile);

app.on('ready', () => {
  setProcessPriority(config.hardwareProfile);
  
  createMmsCfg(config.hardwareProfile);
  setupMenu(config, saveConfig);
  createWindow(config);
  
  // Preconnect em background
  setImmediate(() => preconnectServers());
  
  logger.info('v1.8.0 Iniciado');
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
