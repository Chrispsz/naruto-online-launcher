/**
 * ui/manager/ManagerWindow.js — Lifecycle da BrowserWindow do manager (Fase 3c split)
 *
 * Responsabilidade ÚNICA (SRP): criar, focar, mostrar, esconder e destruir a
 * janela de gerenciamento (dashboard de contas). Não registra IPC nem faz
 * push de estado — isso é papel do IpcRouter e StateBroadcaster.
 *
 * Histórico: era parte do God Object controller.js (648 linhas). Split em 3:
 *   - ManagerWindow.js   (este) — lifecycle da BrowserWindow
 *   - IpcRouter.js       — registro dos handlers IPC
 *   - StateBroadcaster.js — push de estado (perfis/memória/eventos) pra UI
 *
 * controller.js permanece como facade re-exportando os 3 (API preservada).
 */

'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');
const logger = require('../../utils/logger');

let managerWindow = null;

/**
 * Cria a janela de gerenciamento.
 * @param {Object} [opts] - { onReady: Function } chamado em ready-to-show
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
      nodeIntegration: true, // UI interna confiável (só carrega index.html local)
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  managerWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  managerWindow.once('ready-to-show', function () {
    managerWindow.show();
    logger.info('UI Manager exibida');
    if (typeof opts.onReady === 'function') {
      try {
        opts.onReady();
      } catch (e) {
        logger.debug('ManagerWindow onReady: ' + e.message);
      }
    }
  });

  // v3.3: SEM TRAY — close behavior inteligente.
  // Se há janelas de jogo abertas: hide (não quit, jogo ainda roda).
  // Se não há jogo: permite close → window-all-closed → app.quit().
  managerWindow.on('close', function (e) {
    const gameLauncher = require('../game-launcher');
    if (gameLauncher.hasOpenWindows()) {
      e.preventDefault();
      managerWindow.hide();
      logger.info('Manager oculto (jogo rodando) — volta quando o jogo fechar');
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
 * Mostra (ou recria) a janela do manager.
 * @param {Function} [onShown] - chamado após mostrar (p/ex: pushAll)
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
 * Envia uma mensagem IPC ao renderer do manager (se a janela existir).
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
