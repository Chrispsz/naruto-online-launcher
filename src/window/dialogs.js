/**
 * Diálogos da Aplicação
 * Extraído de create.js para evitar dependência circular com menu.js
 */

'use strict';

const { dialog } = require('electron');
const { REGIONS, REGION_CODES } = require('../config/regions');
const { HARDWARE_PROFILES, PROFILE_CODES } = require('../config/hardware');
const { clearAllCookies } = require('../network/cookies');

const BASE_URL = 'https://naruto.narutowebgame.com';
const LAUNCHER_PARAMS = 'logintype=4&leftbar_collapse=Yes';

/**
 * Retorna URL do jogo
 */
function getGameUrl(region) {
  return `${BASE_URL}/${region}/serverlist?${LAUNCHER_PARAMS}`;
}

/**
 * Limpa dados de login
 */
async function handleClearLogin(mainWindow, config) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Sim, limpar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    title: 'Limpar Login',
    message: 'Limpar dados de login?',
    detail: 'Você precisará fazer login novamente.'
  });
  
  if (result.response === 0) {
    const session = mainWindow.webContents.session;
    await clearAllCookies(session);
    mainWindow.loadURL(getGameUrl(config.region));
  }
}

/**
 * Seletor de região
 */
async function showRegionSelector(mainWindow, config) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const buttons = REGION_CODES.map(c => 
    `${REGIONS[c].flag} ${REGIONS[c].name}${c === config.region ? ' (Atual)' : ''}`
  );
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons,
    defaultId: REGION_CODES.indexOf(config.region),
    cancelId: -1,
    title: 'Selecionar Região',
    message: 'Escolha sua região:'
  });
  
  if (result.response >= 0 && result.response < REGION_CODES.length) {
    const newRegion = REGION_CODES[result.response];
    
    if (newRegion !== config.region) {
      config.region = newRegion;
      mainWindow.loadURL(getGameUrl(config.region));
    }
  }
}

/**
 * Seletor de hardware
 */
async function showHardwareSelector(mainWindow, config, saveConfig) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const buttons = PROFILE_CODES.map(p => {
    const profile = HARDWARE_PROFILES[p];
    return `${profile.icon} ${profile.name}${p === config.hardwareProfile ? ' (Atual)' : ''}`;
  });
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: [...buttons, 'Cancelar'],
    defaultId: PROFILE_CODES.indexOf(config.hardwareProfile),
    cancelId: buttons.length,
    title: 'Perfil de Hardware',
    message: 'Escolha seu perfil de hardware:',
    detail: PROFILE_CODES.map(p => 
      `${HARDWARE_PROFILES[p].icon} ${HARDWARE_PROFILES[p].name}: ${HARDWARE_PROFILES[p].description}`
    ).join('\n')
  });
  
  if (result.response >= 0 && result.response < PROFILE_CODES.length) {
    const newProfile = PROFILE_CODES[result.response];
    
    if (newProfile !== config.hardwareProfile) {
      config.hardwareProfile = newProfile;
      
      // Salva a configuração
      if (saveConfig) {
        saveConfig(config);
      }
      
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: 'Reinicie o launcher para aplicar as otimizações.'
      });
    }
  }
}

module.exports = {
  getGameUrl,
  handleClearLogin,
  showRegionSelector,
  showHardwareSelector,
  BASE_URL,
  LAUNCHER_PARAMS
};
