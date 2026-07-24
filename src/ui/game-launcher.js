/**
 * ui/game-launcher.js — FACADE (Fase 3d split)
 *
 * Was the God Object (620 lines). Now it's a thin facade that delegates to
 * app/Launcher.js (orquestração + registry de janelas). O lifecycle dos
 * eventos mora em app/SessionLifecycle.js e os atalhos em
 * ui/manager/KeyboardShortcuts.js.
 *
 * A facade preserva a API pública histórica (launchProfile, focusProfile,
 * closeProfile, isProfileOpen, getWebContents, hasOpenWindows, getGameUrl)
 * para que controller.js, manager.js e main.js não precisem mudar.
 *
 * Para código novo, prefira importar app/Launcher.js diretamente.
 */

'use strict';

module.exports = require('../app/Launcher');
