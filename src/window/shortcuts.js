/**
 * Atalhos de Teclado
 * Com cleanup para evitar memory leaks
 */

'use strict';

const logger = require('../utils/logger');

const SHORTCUTS = {
  F5: 'clearLogin',
  F6: 'regionSelector',
  F7: 'hardwareSelector',
  F11: 'toggleFullscreen',
  F12: 'toggleDevTools',
  Escape: 'exitFullscreen'
};

/**
 * Configura atalhos de teclado
 * @param {BrowserWindow} win 
 * @param {Object} handlers 
 * @returns {Function} cleanup function
 */
function setupShortcuts(win, handlers) {
  if (!win || win.isDestroyed()) return null;
  
  const handler = (event, input) => {
    if (input.type !== 'keyDown') return;
    
    const action = SHORTCUTS[input.key];
    
    if (action) {
      event.preventDefault();
      
      switch (action) {
        case 'clearLogin':
          handlers.clearLogin?.();
          break;
        case 'regionSelector':
          handlers.regionSelector?.();
          break;
        case 'hardwareSelector':
          handlers.hardwareSelector?.();
          break;
        case 'toggleFullscreen':
          toggleFullscreen(win);
          break;
        case 'toggleDevTools':
          // Só em desenvolvimento
          if (process.env.NODE_ENV === 'development' || process.env.DEVTOOLS === '1') {
            win.webContents.toggleDevTools();
            logger.debug('DevTools toggled');
          }
          break;
        case 'exitFullscreen':
          if (win.isFullScreen()) {
            toggleFullscreen(win);
          }
          break;
      }
    }
  };
  
  win.webContents.on('before-input-event', handler);
  
  logger.info('Atalhos configurados');
  
  // Retorna função de cleanup
  return () => {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.removeListener('before-input-event', handler);
    }
  };
}

function toggleFullscreen(win) {
  if (!win || win.isDestroyed()) return;
  win.setFullScreen(!win.isFullScreen());
}

module.exports = {
  setupShortcuts,
  toggleFullscreen,
  SHORTCUTS
};
