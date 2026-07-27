/**
 * ui/game-launcher.js — FACADE (Phase 3d split)
 *
 * Was the God Object (620 lines). Now it's a thin facade that delegates to
 * app/Launcher.js (orchestration + window registry). The lifecycle of
 * events lives in app/SessionLifecycle.js and the shortcuts in
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
