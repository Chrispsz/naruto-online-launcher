/**
 * Preload Script
 * v2.0.0 — Simplified, only exposes APIs with registered handlers
 *
 * Exposes a minimal API to the renderer process via contextBridge.
 * No nodeIntegration, no direct require — safe and auditable.
 *
 * v4.1 (Sprint 5): Removed 3 unhandled IPC channels that caused silent
 * promise hangs (launcher:update-available, launcher:clear-cache,
 * launcher:screenshot). None of these had ipcMain.handle() registered
 * anywhere, so any call would hang forever.
 *
 * NOTE: launcher:get-version IS still active (handler in main.js).
 *
 * Now only exposes what actually works. Game pages can call these from
 * their JavaScript if needed.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { DEBUG } = require('./main/debug');

// v5.9.9 (fix preload crash): contextBridge.exposeInMainWorld no Electron 11
// NÃO aceita primitivos (boolean/string/number) como 2º argumento — só
// object/function/null. Passar `DEBUG` (boolean) direto crashava o preload
// inteiro com "TypeError: Error processing argument at index 1, conversion
// failure from". Consequência: window.__SHINOBI_DEBUG__ ficava undefined E
// window.narutoLauncher também (a linha de baixo nunca executava) → Dev Tools
// section nunca aparecia + qualquer bridge IPC futuro quebraria.
// Correção: expor como objeto { enabled: boolean, isDebug: function }.
// Renderer adaptado para ler window.__SHINOBI_DEBUG__.enabled (app.js).
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
