/**
 * Detecção e Configuração do Flash PPAPI
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('../utils/logger');

const FLASH_VERSIONS = {
  win32: '34.0.0.376',
  linux: '34.0.0.137'
};

// Nomes conhecidos do plugin Flash
const FLASH_PLUGIN_NAMES = {
  win32: 'pepflashplayer.dll',
  linux: 'libpepflashplayer.so'
};

function findFlashPlugin() {
  const platform = process.platform;
  
  if (platform !== 'win32' && platform !== 'linux') {
    logger.warn('Plataforma não suportada para Flash');
    return null;
  }
  
  const pluginName = FLASH_PLUGIN_NAMES[platform];
  const searchPaths = [
    path.join(process.resourcesPath, 'flash', pluginName),
    path.join(__dirname, '..', '..', 'flash', pluginName)
  ];
  
  for (const pluginPath of searchPaths) {
    try {
      if (fs.existsSync(pluginPath)) {
        const stats = fs.statSync(pluginPath);
        if (stats.size > 5000000) {
          logger.info(`Flash encontrado: ${pluginPath}`);
          return pluginPath;
        }
      }
    } catch (e) {
      // Continua procurando
    }
  }
  
  logger.warn('Flash PPAPI não encontrado');
  return null;
}

function configureFlash(flashPath) {
  if (!flashPath) return false;
  
  const version = FLASH_VERSIONS[process.platform] || '34.0.0.0';
  
  app.commandLine.appendSwitch('ppapi-flash-path', flashPath);
  app.commandLine.appendSwitch('ppapi-flash-version', version);
  app.commandLine.appendSwitch('plugin-power-saver', 'disable');
  app.commandLine.appendSwitch('ppapi-flash-args', [
    'enable_hardware_pepper_video_decoder=1',
    'enable_stagevideo_auto=1',
    'enable_hw_accel=1',
    'enable_request_autherror=0'
  ].join(' '));
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
  
  logger.info(`Flash ${version} configurado`);
  return true;
}

module.exports = {
  findFlashPlugin,
  configureFlash,
  FLASH_VERSIONS
};
