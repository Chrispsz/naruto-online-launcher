/**
 * Carregamento e Salvamento de Configuração
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

function loadConfig() {
  try {
    const configPath = getConfigPath();
    
    if (!fs.existsSync(configPath)) {
      logger.info('Usando configura\u00E7\u00F5es padr\u00E3o (primeiro uso)');
      return validateConfig({});
    }
    
    const rawContent = fs.readFileSync(configPath, 'utf8');
    let rawConfig;
    
    try {
      rawConfig = JSON.parse(rawContent);
    } catch (parseError) {
      logger.error('JSON inv\u00E1lido no config, usando padr\u00E3o', parseError.message);
      return validateConfig({});
    }
    
    const validated = validateConfig(rawConfig);
    logger.info(`Config carregada: regi\u00E3o=${validated.region}, perfil=${validated.hardwareProfile}`);
    
    return validated;
  } catch (e) {
    logger.error('Erro ao carregar config, usando padr\u00E3o', e.message);
    return validateConfig({});
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
