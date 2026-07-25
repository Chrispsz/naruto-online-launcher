/**
 * ui/game-launcher.js — FACADE (Fase 3d split)
 *
 * Was the God Object (620 lines). Now it's a thin facade that delegates to
 * app/Launcher.js (orchestration + window registry). The lifecycle of
 * eventos mora em app/SessionLifecycle.js e os atalhos em
 * ui/manager/KeyboardShortcuts.js.
 *
 * The facade preserves the historical public API (launchProfile, focusProfile,
 * closeProfile, isProfileOpen, getWebContents, hasOpenWindows, getGameUrl)
 * so that controller.js, manager.js and main.js don't need to change.
 *
 * For new code, prefer importing app/Launcher.js directly.
 */

'use strict';

module.exports = require('../app/Launcher');
