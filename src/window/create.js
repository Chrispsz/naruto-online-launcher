/**
 * Criação e Gerenciamento da Janela Principal
 */

'use strict';

const { BrowserWindow, dialog, shell } = require('electron');
const logger = require('../utils/logger');
const { REGIONS, REGION_CODES } = require('../config/regions');
const { HARDWARE_PROFILES, PROFILE_CODES } = require('../config/hardware');
const { setupBlocker } = require('../network/blocker');
const { setupPersistentCookies, clearAllCookies } = require('../network/cookies');
const { setupShortcuts } = require('./shortcuts');

const BASE_URL = 'https://naruto.narutowebgame.com';
const WINDOW_TITLE = 'Naruto Online';
const LAUNCHER_PARAMS = 'logintype=4&leftbar_collapse=Yes';

let mainWindow = null;

function getGameUrl(region) {
  return `${BASE_URL}/${region}/serverlist?${LAUNCHER_PARAMS}`;
}

function createWindow(config) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      plugins: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
      partition: 'persist:naruto-main'
    }
  });
  
  const session = mainWindow.webContents.session;
  
  // Configura rede
  setupBlocker(session);
  setupPersistentCookies(session);
  
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setTitle(WINDOW_TITLE);
  
  // Previne mudança de título
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
    mainWindow.setTitle(WINDOW_TITLE);
  });
  
  // Configura atalhos
  setupShortcuts(mainWindow, {
    clearLogin: () => handleClearLogin(config),
    regionSelector: () => showRegionSelector(config),
    hardwareSelector: () => showHardwareSelector(config)
  });
  
  // Navegação
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url.includes('naruto') && !url.includes('logintype')) {
      e.preventDefault();
      mainWindow.loadURL(`${url}${url.includes('?') ? '&' : '?'}${LAUNCHER_PARAMS}`);
    }
  });
  
  // Intercepta window.open
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logger.info(`window.open: ${url}`);
    
    if (url.includes('naruto') || url.includes('oasgames')) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    
    return { action: 'deny' };
  });
  
  // Pós-carregamento
  mainWindow.webContents.on('did-finish-load', () => {
    session.cookies.flushStore().catch(() => {});
    
    // Esconde barra OAS
    mainWindow.webContents.insertCSS(`
      .oas-bar, #oas-bar { display: none !important; height: 0 !important; }
      .oas-bar-hide, #oas-bar-hide { display: none !important; }
      #oas-player { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; }
    `).catch(() => {});
    
    // Substitui logintype=3
    mainWindow.webContents.executeJavaScript(`
      (function() {
        document.querySelectorAll('script').forEach(s => {
          if (s.src && s.src.includes('logintype=3')) s.src = s.src.replace(/logintype=3/g, 'logintype=4');
          if (s.textContent && s.textContent.includes('logintype=3')) s.textContent = s.textContent.replace(/logintype=3/g, 'logintype=4');
        });
        document.body.innerHTML = document.body.innerHTML.replace(/logintype=3/g, 'logintype=4');
      })();
    `).catch(() => {});
  });
  
  // Fecha aplicação
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.destroy();
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    require('electron').app.exit(0);
  });
  
  // Carrega o jogo
  mainWindow.loadURL(getGameUrl(config.region));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  
  return mainWindow;
}

async function handleClearLogin(config) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Sim, limpar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    title: 'Limpar Login',
    message: 'Limpar dados de login?',
    detail: 'Voc\u00EA precisar\u00E1 fazer login novamente.'
  });
  
  if (result.response === 0) {
    const session = mainWindow.webContents.session;
    await clearAllCookies(session);
    mainWindow.loadURL(getGameUrl(config.region));
  }
}

async function showRegionSelector(config) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const buttons = REGION_CODES.map(c => 
    `${REGIONS[c].flag} ${REGIONS[c].name}${c === config.region ? ' (Atual)' : ''}`
  );
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons,
    defaultId: REGION_CODES.indexOf(config.region),
    cancelId: -1,
    title: 'Selecionar Regi\u00E3o',
    message: 'Escolha sua regi\u00E3o:'
  });
  
  if (result.response >= 0 && result.response < REGION_CODES.length) {
    const newRegion = REGION_CODES[result.response];
    
    if (newRegion !== config.region) {
      config.region = newRegion;
      mainWindow.loadURL(getGameUrl(config.region));
    }
  }
}

async function showHardwareSelector(config, saveConfig) {
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
      saveConfig(config);
      
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: 'Reinicie o launcher para aplicar as otimiza\u00E7\u00F5es.'
      });
    }
  }
}

function getMainWindow() {
  return mainWindow;
}

module.exports = {
  createWindow,
  getMainWindow,
  getGameUrl,
  showRegionSelector,
  showHardwareSelector,
  handleClearLogin,
  WINDOW_TITLE,
  BASE_URL,
  LAUNCHER_PARAMS
};
