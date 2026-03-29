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

function findFlashPlugin() {
  const platform = process.platform;
  
  if (platform !== 'win32' && platform !== 'linux') {
    logger.warn('Plataforma n\u00E3o suportada para Flash');
    return null;
  }
  
  const targetExt = platform === 'win32' ? '.dll' : '.so';
  const searchPaths = [
    path.join(process.resourcesPath, 'flash'),
    path.join(__dirname, '..', '..', 'flash')
  ];
  
  for (const searchPath of searchPaths) {
    try {
      if (fs.existsSync(searchPath)) {
        const files = fs.readdirSync(searchPath);
        
        for (const file of files) {
          if (path.extname(file).toLowerCase() === targetExt) {
            const fullPath = path.join(searchPath, file);
            const stats = fs.statSync(fullPath);
            
            // Plugin deve ter pelo menos 5MB
            if (stats.size > 5000000) {
              logger.info(`Flash encontrado: ${fullPath}`);
              return fullPath;
            }
          }
        }
      }
    } catch (e) {
      logger.error('Erro ao procurar Flash', e.message);
    }
  }
  
  logger.warn('Flash PPAPI n\u00E3o encontrado');
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
  
  logger.info(`Flash ${version} (64-bit) configurado com otimiza\u00E7\u00F5es`);
  return true;
}

module.exports = {
  findFlashPlugin,
  configureFlash,
  FLASH_VERSIONS
};
