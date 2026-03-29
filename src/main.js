/**
 * Naruto Online Launcher v2.0.0
 * First Public Release
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
function setProcessPriority(profile) {
  try {
    const priority = profile === 'cpu' 
      ? os.constants.priority.PRIORITY_BELOW_NORMAL 
      : os.constants.priority.PRIORITY_NORMAL;
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

// Ler versão do package.json
const { version } = require('../package.json');

app.on('ready', () => {
  setProcessPriority(config.hardwareProfile);
  
  createMmsCfg(config.hardwareProfile);
  setupMenu(config, saveConfig, getMainWindow);
  createWindow(config, saveConfig);
  
  // Preconnect em background
  setImmediate(() => preconnectServers(config.region));
  
  logger.info(`v${version} Iniciado`);
});

// Cleanup no shutdown
app.on('window-all-closed', () => {
  app.exit(0);
});

// Erros não tratados
process.on('uncaughtException', (e) => logger.error('Exceção não tratada', e.message));
process.on('SIGTERM', () => app.exit(0));
process.on('SIGINT', () => app.exit(0));
