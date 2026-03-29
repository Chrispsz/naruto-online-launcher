/**
 * Criação e Gerenciamento da Janela Principal
 */

'use strict';

const { BrowserWindow, shell } = require('electron');
const logger = require('../utils/logger');
const { setupBlocker } = require('../network/blocker');
const { setupPersistentCookies } = require('../network/cookies');
const { setupShortcuts } = require('./shortcuts');
const { 
  getGameUrl, 
  handleClearLogin, 
  showRegionSelector, 
  showHardwareSelector,
  LAUNCHER_PARAMS 
} = require('./dialogs');

const WINDOW_TITLE = 'Naruto Online';

// Servidores para preconnect
const GAME_SERVERS = [
  'https://naruto.oasgames.com',
  'https://naruto.narutowebgame.com',
  'https://gf1.geo.gfsrv.net',
  'https://cdn.oasgames.com'
];

let mainWindow = null;
let isClosing = false;

/**
 * Preconnect para servidores do jogo (reduz latência)
 */
function preconnectServers() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const session = mainWindow.webContents.session;
  
  GAME_SERVERS.forEach(server => {
    try {
      session.preconnect({
        url: server,
        numSockets: 2
      });
    } catch {
      // Ignora erros de preconnect
    }
  });
  
  logger.debug('Preconnect realizado');
}

function createWindow(config, saveConfig) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }
  
  isClosing = false;
  
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
  
  // Configura atalhos (passa saveConfig!)
  const shortcutsHandler = setupShortcuts(mainWindow, {
    clearLogin: () => handleClearLogin(mainWindow, config),
    regionSelector: () => showRegionSelector(mainWindow, config),
    hardwareSelector: () => showHardwareSelector(mainWindow, config, saveConfig)
  });
  
  // Navegação - só intercepta páginas HTML, não assets
  mainWindow.webContents.on('will-navigate', (e, url) => {
    try {
      const parsed = new URL(url);
      
      // Verifica se é página (não asset)
      const isPage = !parsed.pathname.match(/\.(js|css|png|jpg|gif|swf|json|xml|ico|svg|woff2?)$/i);
      const isGameHost = parsed.hostname.includes('naruto') || parsed.hostname.includes('oasgames');
      
      if (isGameHost && isPage && !parsed.search.includes('logintype')) {
        e.preventDefault();
        const sep = url.includes('?') ? '&' : '?';
        mainWindow.loadURL(url + sep + LAUNCHER_PARAMS);
      }
    } catch {
      // URL inválida, ignora
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
  });
  
  // Fecha aplicação - cleanup e deixa Electron destruir naturalmente
  mainWindow.on('close', () => {
    if (isClosing) return;
    isClosing = true;
    
    // Chama cleanup ESPECÍFICO do shortcuts (não removeAllListeners)
    if (typeof shortcutsHandler === 'function') {
      shortcutsHandler();
    }
    // Não chamar destroy() - Electron faz isso automaticamente
    // e permite que o evento 'closed' dispare corretamente
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Carrega o jogo
  mainWindow.loadURL(getGameUrl(config.region));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  
  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

module.exports = {
  createWindow,
  getMainWindow,
  preconnectServers,
  WINDOW_TITLE
};
