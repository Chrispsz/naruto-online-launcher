/**
 * Gerenciamento do mms.cfg (Flash Config)
 * Com skip de escrita se conteúdo igual
 */

'use strict';

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

/**
 * Retorna o caminho do mms.cfg
 */
function getMmsCfgPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
    return path.join(appData, 'Macromedia', 'Flash Player', 'mms.cfg');
  } else {
    const home = process.env.HOME;
    return path.join(home, '.macromedia', 'Flash_Player', 'mms.cfg');
  }
}

/**
 * Gera o conteúdo do mms.cfg
 */
function generateMmsContent(hardwareProfile) {
  const isCpuMode = hardwareProfile === 'cpu';
  
  return [
    'AutoPlay=1',
    'EnableSocketsTo=*',
    'OverrideGPUValidation=1',
    isCpuMode ? 'EnableHardwareAcceleration=0' : 'EnableHardwareAcceleration=1',
    'EnableFullScreen=1',
    'NetworkAccess=1',
    'Quality=high',
    'BitmapSmoothing=1',
    'StagingBuffer=1',
    'EnableMultithreadedVideo=1',
    'LocalStorageLimit=10',
    'AssetCacheSize=500',
    isCpuMode ? 'GPUMemoryPercentage=0' : 'GPUMemoryPercentage=50',
    'OverrideInsecurePolicy=allow',
    'EnableInsecureLocalWithNetwork=1'
  ].join('\n');
}

/**
 * Cria o mms.cfg se necessário
 * Skip se conteúdo já existe e é igual
 */
function createMmsCfg(hardwareProfile = 'modern') {
  try {
    const cfgPath = getMmsCfgPath();
    const dir = path.dirname(cfgPath);
    const newContent = generateMmsContent(hardwareProfile);
    
    // Verifica se já existe e é igual
    try {
      const existingContent = fs.readFileSync(cfgPath, 'utf8');
      if (existingContent === newContent) {
        logger.debug('mms.cfg unchanged, skipping write');
        return true;
      }
    } catch {
      // Arquivo não existe, continua
    }
    
    // Cria diretório se necessário
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug(`Diret\u00F3rio criado: ${dir}`);
    }
    
    // Escreve arquivo
    fs.writeFileSync(cfgPath, newContent, 'utf8');
    logger.info(`mms.cfg atualizado: ${cfgPath}`);
    return true;
  } catch (e) {
    logger.error('Falha ao criar mms.cfg', e.message);
    return false;
  }
}

module.exports = {
  getMmsCfgPath,
  createMmsCfg,
  generateMmsContent
};
