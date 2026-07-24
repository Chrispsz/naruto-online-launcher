/**
 * app/Launcher.js — Orchestrates game window launches per profile (Phase 3d split)
 *
 * Single Responsibility (SRP): create an isolated BrowserWindow per profile
 * (own partition, network layer, loading screen, loadURL) and delegate the
 * lifecycle to SessionLifecycle + shortcuts to KeyboardShortcuts. Maintains the
 * registry de janelas abertas (gameWindows Map).
 *
 * History: was the God Object game-launcher.js (620 lines). Split into 3:
 *   - Launcher.js          (este) — orchestration + window registry
 *   - SessionLifecycle.js  — hooks de evento (load/fail/close/crash/auto-login)
 *   - KeyboardShortcuts.js — F5/F12/Alt+F4 antes do input do Chromium
 *
 * game-launcher.js remains as facade re-exporting this module.
 */

'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');
const logger = require('../utils/logger');
const store = require('../profiles/store');
const partition = require('../profiles/partition');
const { setupBlocker } = require('../network/blocker');
const { setupPersistentCookies } = require('../network/cookies');
const SessionLifecycle = require('./SessionLifecycle');
const KeyboardShortcuts = require('../ui/manager/KeyboardShortcuts');
const Auditor = require('./Auditor');

const WINDOW_TITLE = 'Naruto Online';
const CSP =
  "default-src 'self' * data: blob: http: https:; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' http: https:; " +
  "object-src 'self' * data: blob: http: https:; " +
  "style-src 'self' 'unsafe-inline' *; " +
  "img-src 'self' * data: blob: http: https:; " +
  "connect-src 'self' * http: https: ws: wss:; " +
  "media-src 'self' * data: blob: http: https:;";

// Map: profileId -> { window, partitionName, isShadow, autoLoginTimer, failLoadRetry, failLoadTimer, bypassAttempts, formInjectAttempts }
const gameWindows = new Map();

const urlConfig = require('../config/urls');
const LAUNCHER_PARAMS = urlConfig.getLauncherParams();

/**
 * Returns the game URL for a profile (region + language + server).
 * @param {Object} [profile]
 * @returns {string}
 */
function getGameUrl(profile) {
  if (!profile) return urlConfig.getGameUrl('br');
  return urlConfig.getGameUrl(profile.region, profile.server);
}

/**
 * Is there a game window open? (used by ManagerWindow close behavior)
 * @returns {boolean}
 */
function hasOpenWindows() {
  for (const entry of gameWindows.values()) {
    if (entry.window && !entry.window.isDestroyed()) return true;
  }
  return false;
}

/**
 * Resolve the application icon path (packaged > dev fallback).
 * @returns {string} absolute path to icon.png
 */
function resolveIconPath() {
  const fs = require('fs');
  const packaged = path.join(process.resourcesPath, 'icon.png');
  try {
    if (fs.existsSync(packaged)) return packaged;
  } catch (_) {
    /* ignore */
  }
  return path.join(__dirname, '..', '..', 'assets', 'icon.png');
}

/**
 * Launch a game window for a profile.
 * @param {string} profileId
 * @param {Function} [onOpened]
 * @param {Function} [onClosed]
 */
function launchProfile(profileId, onOpened, onClosed) {
  const profile = store.get(profileId);
  if (!profile) {
    logger.error('Launcher: profile not found: ' + profileId);
    return;
  }

  // Already open → focus
  if (gameWindows.has(profileId)) {
    const entry = gameWindows.get(profileId);
    if (entry.window && !entry.window.isDestroyed()) {
      entry.window.show();
      entry.window.focus();
      if (onOpened) onOpened();
      return;
    }
  }

  const partName = partition.getPartitionName(profile);
  const isShadow = partition.shouldUseShadow(profile);
  logger.info(
    'Opening profile "' +
      profile.name +
      '" • ' +
      (isShadow ? 'shadow' : 'persist') +
      ' partition ' +
      partName
  );

  const LAUNCHER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36 ShinobiLauncher/3.5';

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0f',
    icon: resolveIconPath(),
    title: WINDOW_TITLE + ' — ' + profile.name,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      plugins: true, // Flash PPAPI
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      partition: partName, // <- TOTAL ISOLATION per profile
      preload: path.join(__dirname, '..', 'preload.js'),
      userAgent: LAUNCHER_UA
    }
  });

  win.webContents.session.setUserAgent(LAUNCHER_UA);
  const ses = win.webContents.session;

  // Network layer for THIS partition (blocker + cookies+CSP merged in one handler)
  setupBlocker(ses);
  setupPersistentCookies(ses, { csp: CSP });

  win.setMenuBarVisibility(false);
  win.setTitle(WINDOW_TITLE + ' — ' + profile.name);

  win.on('page-title-updated', function (e) {
    e.preventDefault();
    win.setTitle(WINDOW_TITLE + ' — ' + profile.name);
  });

  // Create the registry entry BEFORE attaching lifecycle (this one needs to mutate entry)
  // Auditor: collects session metadata (playtime, stalls, crashes, reloads) per profile.
  // Phase 2: wired here. Missing wire-up of recordEvent (EventTimers) — Phase 3.
  const auditor = Auditor.create(profileId);
  const entry = {
    window: win,
    partitionName: partName,
    isShadow: isShadow,
    autoLoginTimer: null,
    failLoadRetry: false,
    failLoadTimer: null,
    bypassAttempts: 0,
    formInjectAttempts: 0,
    auditor: auditor
  };
  gameWindows.set(profileId, entry);

  // Attach lifecycle (event handlers) + shortcuts
  SessionLifecycle.attach(win, {
    profileId: profileId,
    profile: profile,
    entry: entry,
    ses: ses,
    auditor: auditor,
    onOpened: onOpened,
    onClosed: function () {
      gameWindows.delete(profileId);
      // Persist auditor final state + stop throttled persistence timer.
      try { auditor.destroy(); } catch (e) { logger.debug('auditor.destroy failed: ' + e.message); }
      if (onClosed) onClosed();
    },
    getGameUrl: getGameUrl,
    LAUNCHER_PARAMS: LAUNCHER_PARAMS
  });
  // F5 (clear login) now does pre-authentication via API before reloading
  // (same as Play) → doesn't show the game login screen, email stays hidden.
  KeyboardShortcuts.attach(win, profile.name, ses, function onClearLogin() {
    reloadWithPreAuth(profileId);
  });

  // Loading screen (spinner SVG/CSS, no emoji — fontconfig-safe)
  win.loadURL(
    'data:text/html,' +
      encodeURIComponent(
        '<html><head><meta charset="utf-8"><style>' +
          '*{margin:0;padding:0;box-sizing:border-box}' +
          'body{background:#0f0f14;display:flex;align-items:center;justify-content:center;height:100vh;' +
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;flex-direction:column;color:#FF8C00}' +
          '.spin{width:34px;height:34px;border:3px solid rgba(255,140,0,.18);border-top-color:#FF8C00;' +
          'border-radius:50%;animation:sp 1s linear infinite;margin-bottom:18px}' +
          '@keyframes sp{to{transform:rotate(360deg)}}' +
          '.t{font-size:15px;font-weight:600;letter-spacing:.2px;color:#f0ede6}' +
          '</style></head><body>' +
          '<div class="spin"></div>' +
          '<div class="t">Loading ' +
          String(profile.name).replace(/</g, '&lt;') +
          '</div>' +
          '</body></html>'
      )
  );
}

/**
 * Close a game window by profile ID (triggers close handler).
 * @param {string} profileId
 */
function closeProfile(profileId) {
  if (!gameWindows.has(profileId)) return;
  const entry = gameWindows.get(profileId);
  if (entry.window && !entry.window.isDestroyed()) entry.window.close();
}

/**
 * Check if a profile's game window is currently open and alive.
 * @param {string} profileId
 * @returns {boolean}
 */
function isProfileOpen(profileId) {
  if (!gameWindows.has(profileId)) return false;
  const entry = gameWindows.get(profileId);
  return !!(entry && entry.window && !entry.window.isDestroyed());
}

/**
 * Get the WebContents for a profile's game window.
 * @param {string} profileId
 * @returns {Electron.WebContents|null}
 */
function getWebContents(profileId) {
  if (!gameWindows.has(profileId)) return null;
  const entry = gameWindows.get(profileId);
  if (!entry || !entry.window || entry.window.isDestroyed()) return null;
  return entry.window.webContents;
}

/**
 * Reloads the game window with pre-authentication (same flow as Play).
 * Delegated to SessionLifecycle.reloadWithPreAuth — used by the F5 shortcut.
 *
 * Unlike a plain reload, clears the login AND pre-authenticates via API before
 * reloading, so the Naruto Online login screen doesn't appear
 * (email stays hidden). See SessionLifecycle.reloadWithPreAuth.
 *
 * @param {string} profileId
 */
function reloadWithPreAuth(profileId) {
  if (!gameWindows.has(profileId)) {
    logger.warn('reloadWithPreAuth: profile not open — ' + profileId);
    return;
  }
  const entry = gameWindows.get(profileId);
  if (!entry || !entry.window || entry.window.isDestroyed()) return;
  const profile = store.get(profileId);
  if (!profile) {
    logger.warn('reloadWithPreAuth: profile not found in store — ' + profileId);
    return;
  }
  SessionLifecycle.reloadWithPreAuth(
    profileId,
    profile,
    entry.window,
    entry.window.webContents.session,
    getGameUrl
  );
}

module.exports = {
  launchProfile: launchProfile,
  closeProfile: closeProfile,
  isProfileOpen: isProfileOpen,
  getWebContents: getWebContents,
  hasOpenWindows: hasOpenWindows,
  getGameUrl: getGameUrl,
  reloadWithPreAuth: reloadWithPreAuth
};
