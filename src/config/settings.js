/**
 * Carregamento e Salvamento de Configuração
 * Com cache em memória para evitar I/O desnecessário
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('../utils/logger');
const { isValidRegion, getDefaultRegion } = require('./regions');
const { isValidProfile, getDefaultProfile } = require('./hardware');

// Schema de validação
const CONFIG_SCHEMA = {
  region: {
    validate: (v) => isValidRegion(v),
    getDefault: getDefaultRegion
  },
  hardwareProfile: {
    validate: (v) => isValidProfile(v),
    getDefault: getDefaultProfile
  }
};

// Cache em memória
let configCache = null;
let configMtime = 0;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function validateConfig(rawConfig) {
  const validated = {};
  
  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    const value = rawConfig?.[key];
    
    if (value !== undefined && schema.validate(value)) {
      validated[key] = value;
    } else {
      validated[key] = schema.getDefault();
      if (value !== undefined) {
        logger.warn(`Valor inv\u00E1lido para ${key}: ${value}, usando padr\u00E3o: ${validated[key]}`);
      }
    }
  }
  
  return validated;
}

/**
 * Carrega configuração com cache
 * @param {boolean} forceRefresh - Força recarga do disco
 */
function loadConfig(forceRefresh = false) {
  const configPath = getConfigPath();
  
  // Verifica se precisa recarregar
  if (!forceRefresh && configCache) {
    try {
      const stat = fs.statSync(configPath);
      if (stat.mtimeMs === configMtime) {
        return configCache; // Retorna cache
      }
    } catch {
      // Arquivo não existe ou erro, usa cache
      return configCache;
    }
  }
  
  try {
    if (!fs.existsSync(configPath)) {
      logger.info('Usando configura\u00E7\u00F5es padr\u00E3o (primeiro uso)');
      configCache = validateConfig({});
      return configCache;
    }
    
    const rawContent = fs.readFileSync(configPath, 'utf8');
    let rawConfig;
    
    try {
      rawConfig = JSON.parse(rawContent);
    } catch (parseError) {
      logger.error('JSON inv\u00E1lido no config, usando padr\u00E3o', parseError.message);
      configCache = validateConfig({});
      return configCache;
    }
    
    configCache = validateConfig(rawConfig);
    configMtime = fs.statSync(configPath).mtimeMs;
    
    logger.info(`Config carregada: regi\u00E3o=${configCache.region}, perfil=${configCache.hardwareProfile}`);
    
    return configCache;
  } catch (e) {
    logger.error('Erro ao carregar config, usando padr\u00E3o', e.message);
    configCache = validateConfig({});
    return configCache;
  }
}

function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    const content = JSON.stringify({
      region: config.region,
      hardwareProfile: config.hardwareProfile
    }, null, 2);
    
    fs.writeFileSync(configPath, content, 'utf8');
    
    // Atualiza cache
    configCache = {
      region: config.region,
      hardwareProfile: config.hardwareProfile
    };
    configMtime = fs.statSync(configPath).mtimeMs;
    
    logger.info('Config salva');
    return true;
  } catch (e) {
    logger.error('Erro ao salvar config', e.message);
    return false;
  }
}

module.exports = {
  getConfigPath,
  loadConfig,
  saveConfig,
  validateConfig
};
