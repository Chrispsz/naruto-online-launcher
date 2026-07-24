/**
 * ui/controller.js — FACADE (Fase 3c split)
 *
 * Was the God Object (648 lines). Now it's a thin facade that composes:
 *   - manager/ManagerWindow.js    — lifecycle da BrowserWindow
 *   - manager/StateBroadcaster.js — push de estado (perfis/memória/eventos)
 *   - manager/IpcRouter.js        — registro dos handlers IPC
 *
 * A facade preserva a API pública histórica (createManagerWindow,
 * getManagerWindow, showManager, hideManager, registerIpcHandlers,
 * launchProfile) para que main.js não precise mudar.
 *
 * Para código novo, prefira importar os 3 módulos diretamente.
 */

'use strict';

const ManagerWindow = require('./manager/ManagerWindow');
const StateBroadcaster = require('./manager/StateBroadcaster');
const IpcRouter = require('./manager/IpcRouter');

function createManagerWindow() {
  return ManagerWindow.createManagerWindow({ onReady: StateBroadcaster.pushAll });
}

function showManager() {
  ManagerWindow.showManager(StateBroadcaster.pushAll);
}

module.exports = {
  createManagerWindow: createManagerWindow,
  getManagerWindow: ManagerWindow.getManagerWindow,
  showManager: showManager,
  hideManager: ManagerWindow.hideManager,
  registerIpcHandlers: IpcRouter.registerIpcHandlers,
  launchProfile: IpcRouter.launchProfile
};
