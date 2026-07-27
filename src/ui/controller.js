/**
 * ui/controller.js — FACADE (Phase 3c split)
 *
 * Was the God Object (648 lines). Now it's a thin facade that composes:
 *   - manager/ManagerWindow.js    — BrowserWindow lifecycle
 *   - manager/StateBroadcaster.js — state push (profiles/memory/events)
 *   - manager/IpcRouter.js        — IPC handler registry
 *
 * The facade preserves the historical public API (createManagerWindow,
 * getManagerWindow, showManager, hideManager, registerIpcHandlers,
 * launchProfile) so that main.js doesn't need to change.
 *
 * For new code, prefer importing the 3 modules directly.
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
