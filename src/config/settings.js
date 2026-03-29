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

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function validateConfig(rawConfig) {
  const region = rawConfig?.region;
  const hardwareProfile = rawConfig?.hardwareProfile;
  
  const validated = {
    region: isValidRegion(region) ? region : getDefaultRegion(),
    hardwareProfile: isValidProfile(hardwareProfile) ? hardwareProfile : getDefaultProfile()
  };
  
  if (region !== undefined && !isValidRegion(region)) {
    logger.warn(`Região inválida: ${region}, usando padrão: ${validated.region}`);
  }
  if (hardwareProfile !== undefined && !isValidProfile(hardwareProfile)) {
    logger.warn(`Perfil inválido: ${hardwareProfile}, usando padrão: ${validated.hardwareProfile}`);
  }
  
  return validated;
}

function loadConfig() {
  const configPath = getConfigPath();
  
  try {
    if (!fs.existsSync(configPath)) {
      logger.info('Usando configurações padrão (primeiro uso)');
      return validateConfig({});
    }
    
    const rawContent = fs.readFileSync(configPath, 'utf8');
    let rawConfig;
    
    try {
      rawConfig = JSON.parse(rawContent);
    } catch (parseError) {
      logger.error('JSON inválido no config, usando padrão', parseError.message);
      return validateConfig({});
    }
    
    const config = validateConfig(rawConfig);
    logger.info(`Config carregada: região=${config.region}, perfil=${config.hardwareProfile}`);
    
    return config;
  } catch (e) {
    logger.error('Erro ao carregar config, usando padrão', e.message);
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
