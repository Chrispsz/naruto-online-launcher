/**
 * Atalhos de Teclado
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

function setupShortcuts(win, handlers) {
  if (!win || win.isDestroyed()) return;
  
  win.webContents.on('before-input-event', (event, input) => {
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
          win.webContents.toggleDevTools();
          logger.debug('DevTools toggled');
          break;
        case 'exitFullscreen':
          if (win.isFullScreen()) {
            toggleFullscreen(win);
          }
          break;
      }
    }
  });
  
  logger.info('Atalhos configurados');
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
