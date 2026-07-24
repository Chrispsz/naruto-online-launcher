/**
 * Preload Script
 * v2.0.0 — Simplified, only exposes APIs with registered handlers
 *
 * Exposes a minimal API to the renderer process via contextBridge.
 * No nodeIntegration, no direct require — safe and auditable.
 *
 * Only exposes APIs with registered ipcMain.handle() in main.js.
 * Game pages can call these from their JavaScript if needed.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { DEBUG } = require('./main/debug');

// v5.9.9 (fix preload crash): contextBridge.exposeInMainWorld no Electron 11
// Does NOT accept primitives (boolean/string/number) as 2nd argument — only
// object/function/null. Passing `DEBUG` (boolean) directly crashed the preload
// integer with "TypeError: Error processing argument at index 1, conversion
// failure from". Consequence: window.__SHINOBI_DEBUG__ stayed undefined AND
// window.narutoLauncher too (the line below never executed) → Dev Tools
// section never appeared + any future IPC bridge would break.
// Fix: expose as object { enabled: boolean, isDebug: function }.
// Renderer adapted to read window.__SHINOBI_DEBUG__.enabled (app.js).
contextBridge.exposeInMainWorld('__SHINOBI_DEBUG__', {
  enabled: DEBUG,
  isDebug: function () {
    return DEBUG;
  }
});

contextBridge.exposeInMainWorld('narutoLauncher', {
  /**
   * Get the launcher version from package.json
   * @returns {Promise<string>} version string (e.g. "4.1.0")
   */
  getVersion: function () {
    return ipcRenderer.invoke('launcher:get-version');
  },
  /**
   * v5.0: Whether the launcher was booted with SHINOBI_DEBUG=1.
   * @returns {boolean}
   */
  isDebug: function () {
    return DEBUG;
  }
});
