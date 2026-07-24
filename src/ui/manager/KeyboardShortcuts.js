/**
 * ui/manager/KeyboardShortcuts.js — Atalhos de teclado do jogo (Fase 3d split)
 *
 * Responsabilidade ÚNICA (SRP): interceptar atalhos de teclado nas janelas de
 * jogo via webContents 'before-input-event'. Inclui os pendências herdadas:
 *   - F5  → Clear Login (limpa cookies + storage da partition, depois recarrega)
 *   - F12 → toggle DevTools
 *   - Alt+F4 → fecha a janela (kill switch graceful)
 *   - Bloqueia F10/Alt (menu bar Chromium), Ctrl+Shift+I/J (use F12)
 *
 * v5.9.7: F5 agora aceita callback `onClearLogin`. Se fornecido, delega pra ele
 * (Launcher passa uma função que faz clear + pré-autenticação via API antes de
 * recarregar — igual ao Play — para não mostrar a tela de login do jogo, evitando
 * vazar o email). Se `onClearLogin` não é fornecido, mantém o comportamento
 * antigo (clear + reload direto) — backward compat.
 *
 * Histórico: era inline no God Object game-launcher.js (620 linhas). Extraído
 * para isolar a lógica de input. F5/F12 já existiam desde v4.9.1.
 */

'use strict';

const logger = require('../../utils/logger');

/**
 * Anexa o handler de atalhos ao webContents de uma janela de jogo.
 * @param {Electron.BrowserWindow} win
 * @param {string} profileName - para logging
 * @param {Electron.Session} [ses] - session da partition (fallback F5 sem callback)
 * @param {Function} [onClearLogin] - callback invocado no F5 (clear + pré-auth).
 *        Se fornecido, substitui o clear+reload manual — o callback é responsável
 *        por limpar o storage e recarregar com pré-autenticação (igual ao Play).
 */
function attach(win, profileName, ses, onClearLogin) {
  if (!win || !win.webContents) return;
  const wc = win.webContents;

  wc.on('before-input-event', function (event, input) {
    // Alt+F4 → fecha a janela (o kill switch do SessionLifecycle trata o graceful)
    if (input.alt && input.key === 'F4') {
      event.preventDefault();
      win.close();
      return;
    }
    // F5 → Clear Login.
    // Se onClearLogin fornecido: delega (Launcher faz clear + pré-auth via API).
    // Senão: fallback antigo (clear storage + reload direto).
    if (input.key === 'F5' && !input.control && !input.alt && !input.shift) {
      event.preventDefault();
      logger.info('F5: clear login for ' + profileName);
      if (typeof onClearLogin === 'function') {
        // Delega pro Launcher — ele faz clearStorageData + apiLogin.loginAndInject
        // ANTES de recarregar, então a tela de login não aparece (email não vaza).
        try {
          onClearLogin();
        } catch (e) {
          logger.warn('F5: onClearLogin failed — fallback direct reload: ' + e.message);
          wc.reload();
        }
        return;
      }
      // Fallback (sem callback): clear + reload direto (comportamento pré-v5.9.7).
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
    // F12 → toggle DevTools (liberado pra debug).
    // Ctrl+Shift+I continua bloqueado (F12 é mais intuitivo e não conflita com o jogo).
    if (input.key === 'F12' && !input.control && !input.alt && !input.shift) {
      event.preventDefault();
      wc.toggleDevTools();
      return;
    }
    // Bloqueia F10 (menu bar do Chromium), Alt (menu toggle)
    if (
      input.key === 'F10' ||
      (input.alt && !input.control && !input.shift && input.key !== 'F4')
    ) {
      event.preventDefault();
      return;
    }
    // Bloqueia Ctrl+Shift+I (DevTools), Ctrl+Shift+J (Console) — use F12
    if (input.control && input.shift && (input.key === 'I' || input.key === 'J')) {
      event.preventDefault();
      return;
    }
  });
}

module.exports = {
  attach: attach
};
