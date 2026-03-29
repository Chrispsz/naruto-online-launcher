/**
 * Naruto Online Launcher v1.9.1
 * Bugs corrigidos: memory leaks, F7 save, will-navigate
 * 
 * SINGLE WINDOW - Flash PPAPI
 */

'use strict';

const { app } = require('electron');

// ============================================================
// SINGLE INSTANCE LOCK - DEVE SER PRIMEIRO!
// ============================================================
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Agora importa o resto
const os = require('os');
const logger = require('./utils/logger');
const { loadConfig, saveConfig } = require('./config/settings');
const { findFlashPlugin, configureFlash } = require('./flash/plugin');
const { createMmsCfg } = require('./flash/mms');
const { applyFlags } = require('./chromium/flags');
const { createWindow, getMainWindow, preconnectServers } = require('./window/create');
const { setupMenu } = require('./window/menu');
const { cleanup: cleanupCookies } = require('./network/cookies');

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
  'cpu': os.constants.priority.PRIORITY_BELOW_NORMAL,
  'legacy': os.constants.priority.PRIORITY_NORMAL,
  'modern': os.constants.priority.PRIORITY_NORMAL
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
// Segunda instância - foca na primeira
app.on('second-instance', () => {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.focus();
  }
});

// Carrega config antes de app.ready
config = loadConfig();
applyFlags(config.hardwareProfile);

app.on('ready', () => {
  setProcessPriority(config.hardwareProfile);
  
  createMmsCfg(config.hardwareProfile);
  setupMenu(config, saveConfig, getMainWindow);
  createWindow(config, saveConfig);
  
  // Preconnect em background
  setImmediate(() => preconnectServers());
  
  logger.info('v1.9.1 Iniciado');
});

// Cleanup no shutdown
app.on('window-all-closed', () => {
  cleanupCookies();
  app.exit(0);
});

// Erros não tratados
process.on('uncaughtException', (e) => logger.error('Exceção não tratada', e.message));
process.on('SIGTERM', () => {
  cleanupCookies();
  app.exit(0);
});
process.on('SIGINT', () => {
  cleanupCookies();
  app.exit(0);
});
