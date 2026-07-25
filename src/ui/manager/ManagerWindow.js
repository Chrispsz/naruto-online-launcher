/**
 * ui/manager/ManagerWindow.js — Lifecycle da BrowserWindow do manager (Fase 3c split)
 *
 * Single Responsibility (SRP): create, focus, show, hide and destroy the
 * management window (account dashboard). Does not register IPC or do
 * state push — that is the role of IpcRouter and StateBroadcaster.
 *
 * History: was part of the God Object controller.js (648 lines). Split into 3:
 *   - ManagerWindow.js   (este) — lifecycle da BrowserWindow
 *   - IpcRouter.js       — registro dos handlers IPC
 *   - StateBroadcaster.js — state push (profiles/memory/events) to UI
 *
 * controller.js remains as facade re-exporting the 3 (API preserved).
 */

'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');
const logger = require('../../utils/logger');

let managerWindow = null;

/**
 * Creates the management window.
 * @param {Object} [opts] - { onReady: Function } called on ready-to-show
 * @returns {Electron.BrowserWindow}
 */
function createManagerWindow(opts) {
  opts = opts || {};
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.focus();
    return managerWindow;
  }

  managerWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 760,
    minHeight: 580,
    title: 'Shinobi Launcher',
    backgroundColor: '#0f0f14',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // Trusted internal UI (only loads local index.html)
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  managerWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  managerWindow.once('ready-to-show', function () {
    managerWindow.show();
    logger.info('UI Manager shown');
    if (typeof opts.onReady === 'function') {
      try {
        opts.onReady();
      } catch (e) {
        logger.debug('ManagerWindow onReady: ' + e.message);
      }
    }
  });

  // NO TRAY — intelligent close behavior.
  // If game windows are open: hide (don't quit, game is still running).
  // If no game: allows close → window-all-closed → app.quit().
  managerWindow.on('close', function (e) {
    const gameLauncher = require('../game-launcher');
    if (gameLauncher.hasOpenWindows()) {
      e.preventDefault();
      managerWindow.hide();
      logger.info('Manager hidden (game running) — will return when game closes');
    }
  });

  managerWindow.on('closed', function () {
    managerWindow = null;
  });

  return managerWindow;
}

function getManagerWindow() {
  return managerWindow;
}

/**
 * Shows (or recreates) the manager window.
 * @param {Function} [onShown] - called after showing (e.g.: pushAll)
 */
function showManager(onShown) {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.show();
    managerWindow.focus();
    if (typeof onShown === 'function') onShown();
  } else {
    createManagerWindow({ onReady: onShown });
  }
}

function hideManager() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.hide();
  }
}

/**
 * Sends an IPC message to the manager renderer (if the window exists).
 * @param {string} channel
 * @param {*} payload
 */
function send(channel, payload) {
  if (!managerWindow || managerWindow.isDestroyed()) return;
  try {
    managerWindow.webContents.send(channel, payload);
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  createManagerWindow: createManagerWindow,
  getManagerWindow: getManagerWindow,
  showManager: showManager,
  hideManager: hideManager,
  send: send
};
