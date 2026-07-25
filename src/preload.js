/**
 * Preload Script
 * Simplified, only exposes APIs with registered handlers
 *
 * Exposes a minimal API to the renderer process via contextBridge.
 * No nodeIntegration, no direct require — safe and auditable.
 *
 * Only exposes APIs with registered ipcMain.handle() in main.js.
 * Game pages can call these from their JavaScript if needed.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('narutoLauncher', {
  /**
   * Get the launcher version from package.json
   * @returns {Promise<string>} version string (e.g. "4.1.0")
   */
  getVersion: function () {
    return ipcRenderer.invoke('launcher:get-version');
  }
});
