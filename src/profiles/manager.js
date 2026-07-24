/**
 * profiles/manager.js — High-level Facade for Profiles + Partitions + Vault
 * v3.1.0 — "ProfileManager"
 *
 * PHILOSOPHY:
 *   The UI controller shouldn't know the internal topology
 *   of store.js + partition.js + vault.js + game-launcher.js. This module is the
 *   ONLY public surface for profile operations: create, list, launch,
 *   close, delete, isolate, credentials, snapshot/restore of cookies.
 *
 * RESPONSIBILITIES:
 *   - Profile CRUD (delegates to store.js, but enriches with runtime state:
 *     isOpen, hasVault, shadow, lastWindow).
 *   - Isolated window launching via `session.fromPartition('persist:profile-<id>')`.
 *     Pepper Flash is injected via app.commandLine (global, once at boot) —
 *     NOT per window. Each BrowserWindow with `plugins:true` inherits Flash.
 *   - Coordination with partition.js for shadow partitions (Low-Spec Mode):
 *     restoreCookies() before loadURL, snapshotCookies() on close.
 *   - Coordination with vault.js for auto-login: if profile has credentials,
 *     game-launcher injects into the form after did-finish-load.
 *   - Registration of webContents in MemoryGuard (for memory metric observation
 *     in each active webview).
 *   - Crash handling: render-process-gone from one partition does NOT crash
 *     the others. Each window is independent.
 *
 * IPC CONTRACT:
 *   controller.js registers handlers that call these methods. The renderer
 *   never calls store/partition/vault directly.
 *
 * STRICT ISOLATION (user requirement):
 *   If the player opens Main and Fake profiles simultaneously, each gets
 *   an INDEPENDENT BrowserWindow + session.fromPartition. Pepper Flash from
 *   one window does NOT interfere with the other because each session has its own
 *   plugin host. If one crashes, the other keeps running smoothly.
 */

'use strict';

const logger = require('../utils/logger');
const store = require('./store');
const partition = require('./partition');
const vault = require('./vault');
const gameLauncher = require('../ui/game-launcher');

// ── Runtime state ──
// Map: profileId -> { openedAt, lastSeenMb, crashCount }
const _runtime = new Map();

let _listeners = [];

/**
 * Lists profiles enriched with runtime state (isOpen, hasVault, shadow).
 * @returns {Array<Object>}
 */
function list() {
  return store.getAll().map(function (p) {
    const rt = _runtime.get(p.id) || {};
    return Object.assign({}, p, {
      hasVault: vault.hasCredentials(p.id),
      shadow: partition.shouldUseShadow(p),
      isOpen: gameLauncher.isProfileOpen(p.id),
      openedAt: rt.openedAt || 0,
      crashCount: rt.crashCount || 0
    });
  });
}

/**
 * Creates a new profile. Ensures the partition dir exists (persist) so that
 * bunshin/clone doesn't fail on never-launched profiles.
 * @param {{name:string, server:string, region:string}} opts
 * @returns {Object|null} created profile
 */
function create(opts) {
  const p = store.create(opts);
  if (!p) return null;
  // Eager-create the partition dir (persist) — avoids "user-data-dir does not exist"
  // on bunshin/clone of a newly-created profile.
  try {
    partition.ensurePartitionDir(p);
  } catch (e) {
    logger.debug('ProfileManager: ensurePartitionDir failed (ok for shadow): ' + e.message);
  }
  _notify();
  return p;
}

/**
 * Updates profile metadata.
 * @param {string} id
 * @param {Object} updates
 * @returns {boolean}
 */
function update(id, updates) {
  const ok = store.update(id, updates);
  if (ok) _notify();
  return ok;
}

/**
 * Deletes a profile COMPLETELY: closes window, removes partition, vault,
 * cookie snapshot and store entry.
 * @param {string} id
 * @returns {boolean}
 */
function remove(id) {
  // 1. Closes the window if open
  try {
    gameLauncher.closeProfile(id);
  } catch (_) {
    /* ignore */
  }

  // 2. Remove vault
  try {
    vault.removeCredentials(id);
  } catch (_) {
    /* ignore */
  }

  // 3. Remove cookie snapshot (shadow mode)
  try {
    partition.removeSnapshot(id);
  } catch (_) {
    /* ignore */
  }

  // 4. Remove from store (store.remove also wipes partition dir on disk)
  const ok = store.remove(id);

  // 5. Clear runtime state
  _runtime.delete(id);

  if (ok) _notify();
  return ok;
}

/**
 * Launches the game for a profile. Orchestrates:
 *   1. restoreCookies() if shadow partition (restores saved auth cookies).
 *   2. gameLauncher.launchProfile() — cria BrowserWindow isolada.
 *   3. Registers webContents in MemoryGuard (observes memory metrics).
 *   4. Handles crash: render-process-gone does NOT crash other windows.
 *   5. Cookie snapshot on close (if shadow).
 *
 * @param {string} profileId
 * @param {Function} [onOpened]  — called when the window opens
 * @param {Function} [onClosed]  — called when the window closes
 * @returns {boolean} true if the launch was dispatched
 */
function launch(profileId, onOpened, onClosed) {
  const profile = store.get(profileId);
  if (!profile) {
    logger.error('ProfileManager: profile not found — ' + profileId);
    return false;
  }

  // Mark last use
  store.touch(profileId);

  // Runtime state
  const rt = _runtime.get(profileId) || { crashCount: 0 };
  rt.openedAt = Date.now();
  _runtime.set(profileId, rt);

  // Pre-restore cookies (shadow partitions only)
  const partName = partition.getPartitionName(profile);
  if (partition.shouldUseShadow(profile)) {
    partition.restoreCookies(partName, profileId).catch(function (e) {
      logger.debug('ProfileManager: restoreCookies failed (ok): ' + e.message);
    });
  }

  // Dispatches to the game-launcher
  try {
    gameLauncher.launchProfile(
      profileId,
      function onOpenedInternal() {
        if (onOpened) onOpened();
      },
      function onClosedInternal() {
        // Cookie snapshot before closing (shadow only)
        if (partition.shouldUseShadow(profile)) {
          partition.snapshotCookies(partName, profileId).catch(function () {
            /* ignore */
          });
        }
        _runtime.delete(profileId);
        if (onClosed) onClosed();
      }
    );
    return true;
  } catch (e) {
    logger.error('ProfileManager: launch failed — ' + e.message);
    return false;
  }
}

/**
 * Closes a profile's window (without deleting the profile).
 * @param {string} profileId
 * @returns {boolean}
 */
function close(profileId) {
  return gameLauncher.closeProfile(profileId);
}

/**
 * Marks that a game window crashed (called by game-launcher on
 * render-process-gone). Does NOT crash other windows — strict isolation.
 * @param {string} profileId
 */
function reportCrash(profileId) {
  const rt = _runtime.get(profileId);
  if (rt) {
    rt.crashCount = (rt.crashCount || 0) + 1;
    rt.lastCrashAt = Date.now();
    logger.warn(
      'ProfileManager: crash reported in ' + profileId + ' (total: ' + rt.crashCount + ')'
    );
  }
}

// ── Vault (credentials) ──

/**
 * Returns decrypted credentials (for the renderer to validate/inject).
 * @param {string} profileId
 * @returns {{user:string, pass:string}|null}
 */
function getCredentials(profileId) {
  return vault.getCredentials(profileId);
}

/**
 * Saves encrypted credentials (AES-256-GCM machine-bound).
 * @param {string} profileId
 * @param {string} user
 * @param {string} pass
 * @returns {boolean}
 */
function setCredentials(profileId, user, pass) {
  const ok = vault.setCredentials(profileId, user, pass);
  if (ok) _notify();
  return ok;
}

/**
 * Removes credentials.
 * @param {string} profileId
 * @returns {boolean}
 */
function removeCredentials(profileId) {
  const ok = vault.removeCredentials(profileId);
  if (ok) _notify();
  return ok;
}

/**
 * Checks if the profile has saved credentials.
 * @param {string} profileId
 * @returns {boolean}
 */
function hasCredentials(profileId) {
  return vault.hasCredentials(profileId);
}

// ── Import/Export ──

/**
 * Export all profiles as a JSON string.
 * @returns {string} JSON array of profiles
 */
function exportAll() {
  return store.exportJSON();
}

/**
 * Import profiles from a JSON string (replaces existing profiles).
 * @param {string} jsonStr - JSON array of profile objects
 * @returns {{imported: number}} import result
 */
function importAll(jsonStr) {
  const result = store.importJSON(jsonStr);
  _notify();
  return result;
}

// ── Runtime state / observability ──

/**
 * Returns manager statistics (for the dashboard).
 * @returns {{total:number, open:number, withVault:number, shadow:number, crashes:number}}
 */
function getStats() {
  let open = 0,
    withVault = 0,
    shadow = 0,
    crashes = 0;
  const all = store.getAll();
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (gameLauncher.isProfileOpen(p.id)) open++;
    if (vault.hasCredentials(p.id)) withVault++;
    if (partition.shouldUseShadow(p)) shadow++;
    const rt = _runtime.get(p.id);
    if (rt && rt.crashCount) crashes += rt.crashCount;
  }
  return {
    total: all.length,
    open: open,
    withVault: withVault,
    shadow: shadow,
    crashes: crashes,
    max: store.MAX_PROFILES
  };
}

/**
 * Registers listener for changes (UI updates via push).
 * @param {Function} cb
 */
function onChange(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

function _notify() {
  const snapshot = list();
  _listeners.forEach(function (cb) {
    try {
      cb(snapshot);
    } catch (_) {
      /* ignore */
    }
  });
}

module.exports = {
  // CRUD — Used by tests only (zero production callers per cleanup-launcher audit)
  list: list, // Used by tests only
  create: create, // Used by tests only
  update: update, // Used by tests only
  remove: remove, // Used by tests only
  // Launch
  launch: launch,
  close: close,
  reportCrash: reportCrash,
  // Vault — Used by tests only
  getCredentials: getCredentials, // Used by tests only
  setCredentials: setCredentials, // Used by tests only
  removeCredentials: removeCredentials, // Used by tests only
  hasCredentials: hasCredentials, // Used by tests only
  // Import/Export — Used by tests only
  exportAll: exportAll, // Used by tests only
  importAll: importAll, // Used by tests only
  // Stats — Used by tests only
  getStats: getStats, // Used by tests only
  // Events — Used by tests only
  onChange: onChange, // Used by tests only
  // Constants — Used by tests only
  MAX_PROFILES: store.MAX_PROFILES // Used by tests only
};
