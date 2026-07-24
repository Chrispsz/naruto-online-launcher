/**
 * ui/manager/KeyboardShortcuts.js — Atalhos de teclado do jogo (Fase 3d split)
 *
 * Single Responsibility (SRP): intercept keyboard shortcuts in game
 * jogo via webContents 'before-input-event'. Includes the inherited shortcuts:
 *   - F5  → Clear Login (clears cookies + storage from partition, then reloads)
 *   - F12 → toggle DevTools
 *   - Alt+F4 → closes the window (graceful kill switch)
 *   - Blocks F10/Alt (Chromium menu bar), Ctrl+Shift+I/J (use F12)
 *
 * v5.9.7: F5 agora aceita callback `onClearLogin`. Se fornecido, delega pra ele
 * (Launcher passes a function that does clear + pre-authentication via API before
 * reloading — same as Play — to avoid showing the game login screen, preventing
 * vazar o email). If `onClearLogin` is not provided, keeps the behavior
 * antigo (clear + reload direto) — backward compat.
 *
 * History: was inline in the God Object game-launcher.js (620 lines). Extracted
 * to isolate input logic. F5/F12 existed since v4.9.1.
 */

'use strict';

const logger = require('../../utils/logger');

/**
 * Attaches the shortcut handler to a game window's webContents.
 * @param {Electron.BrowserWindow} win
 * @param {string} profileName - for logging
 * @param {Electron.Session} [ses] - partition session (fallback F5 sem callback)
 * @param {Function} [onClearLogin] - callback invoked on F5 (clear + pre-auth).
 *        If provided, replaces the manual clear+reload — the callback is responsible
 *        for clearing storage and reloading with pre-authentication (same as Play).
 */
function attach(win, profileName, ses, onClearLogin) {
  if (!win || !win.webContents) return;
  const wc = win.webContents;

  wc.on('before-input-event', function (event, input) {
    // Alt+F4 → closes the window (the kill switch from SessionLifecycle handles the graceful shutdown)
    if (input.alt && input.key === 'F4') {
      event.preventDefault();
      win.close();
      return;
    }
    // F5 → Clear Login.
    // If onClearLogin provided: delegates (Launcher does clear + pre-auth via API).
    // Otherwise: old fallback (clear storage + direct reload).
    if (input.key === 'F5' && !input.control && !input.alt && !input.shift) {
      event.preventDefault();
      logger.info('F5: clear login for ' + profileName);
      if (typeof onClearLogin === 'function') {
        // Delegates to Launcher — it does clearStorageData + apiLogin.loginAndInject
        // BEFORE reloading, so the login screen doesn't appear (email doesn't leak).
        try {
          onClearLogin();
        } catch (e) {
          logger.warn('F5: onClearLogin failed — fallback direct reload: ' + e.message);
          wc.reload();
        }
        return;
      }
      // Fallback (no callback): clear + direct reload (pre-v5.9.7 behavior).
      if (ses) {
        Promise.all([
          ses.clearStorageData({
            storages: ['cookies', 'localstorage', 'sessionstorage']
          }),
          ses.clearCache()
        ])
          .then(function () {
            logger.info('F5: login cleared, reloading — ' + profileName);
            wc.executeJavaScript('window.onbeforeunload = null; window.onunload = null;')
              .then(function () {
                wc.reload();
              })
              .catch(function () {
                wc.reload();
              });
          })
          .catch(function (e) {
            logger.warn('F5: failed to clear login — ' + e.message + ' (forced reload)');
            wc.reload();
          });
      } else {
        wc.reload();
      }
      return;
    }
    // F12 → toggle DevTools (enabled for debug).
    // Ctrl+Shift+I remains blocked (F12 is more intuitive and doesn't conflict with the game).
    if (input.key === 'F12' && !input.control && !input.alt && !input.shift) {
      event.preventDefault();
      wc.toggleDevTools();
      return;
    }
    // Blocks F10 (Chromium menu bar), Alt (menu toggle)
    if (
      input.key === 'F10' ||
      (input.alt && !input.control && !input.shift && input.key !== 'F4')
    ) {
      event.preventDefault();
      return;
    }
    // Blocks Ctrl+Shift+I (DevTools), Ctrl+Shift+J (Console) — use F12
    if (input.control && input.shift && (input.key === 'I' || input.key === 'J')) {
      event.preventDefault();
      return;
    }
  });
}

module.exports = {
  attach: attach
};
