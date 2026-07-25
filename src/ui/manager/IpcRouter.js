/**
 * ui/manager/IpcRouter.js — Registro dos handlers IPC (Fase 3c split)
 *
 * Single Responsibility (SRP): register ipcMain.on/handle handlers que
 * connect the renderer (index.html) to subsystems (store, vault, memory,
 * events, tempmail, inspector, etc.). One method per domain.
 *
 * History: was part of the God Object controller.js (648 lines). Split: this
 * module handles only IPC routing; ManagerWindow handles the window;
 * StateBroadcaster cuida do push de estado.
 */

'use strict';

const { ipcMain, dialog, session } = require('electron');
const fs = require('fs');
const logger = require('../../utils/logger');
const { isValidRegion, normalizeRegion } = require('../../config/regions');
const store = require('../../profiles/store');
const et = require('../../utils/EventTimers');
const vault = require('../../profiles/vault');
const partition = require('../../profiles/partition');
const ManagerWindow = require('./ManagerWindow');
const StateBroadcaster = require('./StateBroadcaster');

let _handlers = {};
let _inspectors = new Map(); // profileId -> inspector instance
// Map profileId -> launchStartTime (ms) for play-time tracking
const _launchTimes = new Map();
let _registered = false;

/** @param {string} channel @param {*} payload */
function _send(channel, payload) {
  ManagerWindow.send(channel, payload);
}
/** Push current profiles to renderer. */
function _pushProfiles() {
  StateBroadcaster.pushProfiles();
}
/** Push current events to renderer. */
function _pushEvents() {
  StateBroadcaster.pushEvents();
}
/**
 * Get the manager BrowserWindow if available and not destroyed.
 * @returns {Electron.BrowserWindow|null}
 */
function _getWin() {
  var w = ManagerWindow.getManagerWindow();
  return w && !w.isDestroyed() ? w : null;
}

/**
 * Registers ALL IPC handlers. Idempotent (guard _registered).
 * @security Every handler MUST validate input (type+length+shape) before
 *   delegating to subsystems. See SECURITY_AUDIT.md for the per-handler matrix.
 * @param {Object} handlers - { launchProfile, getMemoryStats, forceGC, ... }
 */
function registerIpcHandlers(handlers) {
  _handlers = handlers || {};
  if (_registered) return; // anti-duplication guard
  _registered = true;

  ipcMain.on('manager:ready', function () {
    StateBroadcaster.pushAll();
  });

  // ── Window Always-on-Top toggle ──
  ipcMain.handle('window:toggle-always-on-top', function (_e, on) {
    const win = _getWin();
    if (!win) return { ok: false, error: 'window-unavailable' };
    const next = typeof on === 'boolean' ? on : !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next);
    logger.info('Always-on-top: ' + next);
    return { ok: true, alwaysOnTop: next };
  });
  ipcMain.handle('window:get-always-on-top', function () {
    const win = _getWin();
    if (!win) return false;
    return win.isAlwaysOnTop();
  });

  // ── Window minimize / maximize helpers (for the new window controls) ──
  ipcMain.on('window:minimize', function () {
    const win = _getWin();
    if (win) win.minimize();
  });

  // ── App relaunch (for optimization preset change) ──
  ipcMain.on('app:relaunch', function () {
    logger.info('App relaunch requested (preset change)');
    const { app } = require('electron');
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle('window:toggle-maximize', function () {
    const win = _getWin();
    if (!win) return null;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });

  // ── Profile CRUD ──
  ipcMain.on('profile:create', function (_e, opts) {
    if (typeof opts !== 'object' || opts === null) return;
    const p = store.create(opts);
    if (p) {
      _pushProfiles();
      _pushEvents();
    } else {
      _send('profile:toast', {
        type: 'error',
        msg: 'Profile limit reached (' + store.MAX_PROFILES + ')'
      });
    }
  });

  ipcMain.handle('profile:get', function (_e, id) {
    if (typeof id !== 'string') return null;
    return store.get(id);
  });

  ipcMain.on('profile:update', function (_e, data) {
    if (typeof data !== 'object' || data === null || typeof data.id !== 'string') return;
    // Whitelist updatable fields to prevent renderer from overwriting
    // internal fields (id, createdAt, stats, launchCount, lastPlayed, etc.)
    const ALLOWED = [
      'name',
      'server',
      'region',
      'language',
      'color',
      'notes',
      'tags',
      'favorite',
      'notificationsEnabled',
      'hardwareProfile'
    ];
    var safe = { id: data.id };
    for (var i = 0; i < ALLOWED.length; i++) {
      if (data[ALLOWED[i]] !== undefined) safe[ALLOWED[i]] = data[ALLOWED[i]];
    }
    store.update(safe.id, safe);
    _pushProfiles();
    _pushEvents();
  });

  ipcMain.on('profile:delete', function (_e, id) {
    if (typeof id !== 'string' || !store.get(id)) {
      _send('profile:toast', { type: 'error', msg: 'Profile not found (invalid id)' });
      return;
    }
    // P2 FIX: prevents deleting profile with open game — store.remove()
    // calls _rmrf on the partition dir, which would crash the in-use Flash PPAPI.
    try {
      const gameLauncher = require('../../app/Launcher');
      if (gameLauncher.isProfileOpen(id)) {
        _send('profile:toast', {
          type: 'error',
          msg: 'Close the game window before deleting this account'
        });
        return;
      }
    } catch (_) {
      // gameLauncher not available (dev mode without Electron) — proceeds
    }
    // Clears inspector if it exists (prevents leak in Map _inspectors)
    var insp = _inspectors.get(id);
    if (insp) {
      try {
        insp.disable();
      } catch (_) {
        /* ignore */
      }
      _inspectors.delete(id);
    }
    vault.removeCredentials(id);
    partition.removeSnapshot(id);
    store.remove(id);
    _pushProfiles();
    _send('profile:toast', { type: 'info', msg: 'Account removed (data + cookies deleted)' });
  });

  ipcMain.on('profile:reorder', function (_e, order) {
    if (!Array.isArray(order)) return;
    store.reorder(order);
    _pushProfiles();
  });

  ipcMain.on('profile:launch', function (_e, id) {
    if (typeof id !== 'string' || !store.get(id)) {
      _send('profile:toast', { type: 'error', msg: 'Profile not found' });
      return;
    }
    if (_handlers.launchProfile) _handlers.launchProfile(id);
  });

  ipcMain.handle('profile:get-stats', function (_e, id) {
    if (typeof id !== 'string') return null;
    return store.getStats(id);
  });

  // Launch timeline (7-day activity chart data)
  ipcMain.handle('profile:launch-timeline', function (_e, days) {
    var d = typeof days === 'number' && days > 0 ? days : 7;
    return store.getLaunchTimeline(d);
  });
  ipcMain.handle('profile:clear-launch-log', function () {
    store.clearLaunchLog();
    _pushProfiles();
    return { ok: true };
  });
  ipcMain.handle('profile:launch-log-stats', function () {
    return store.getLaunchLogStats();
  });

  ipcMain.on('profile:update-notes', function (_e, data) {
    if (
      typeof data !== 'object' ||
      data === null ||
      typeof data.id !== 'string' ||
      typeof data.notes !== 'string'
    )
      return;
    store.update(data.id, { notes: data.notes.slice(0, 200) });
    _pushProfiles();
  });

  ipcMain.handle('profile:duplicate', function (_e, id) {
    if (typeof id !== 'string') return { ok: false, error: 'Invalid id' };
    const src = store.get(id);
    if (!src) return { ok: false, error: 'Profile not found' };
    const copy = store.create({
      name: String(src.name) + ' (copy)',
      server: src.server,
      region: src.region,
      language: src.language,
      notes: src.notes || '',
      tags: src.tags || [] // copy tags
    });
    if (!copy) return { ok: false, error: 'Max profiles reached' };
    logger.info('Profile duplicated: ' + src.name + ' → ' + copy.name);
    _pushProfiles();
    return { ok: true, profile: copy };
  });

  ipcMain.handle('profile:set-favorite', function (_e, id, fav) {
    if (typeof id !== 'string') return false;
    return store.update(id, { favorite: fav === true });
  });

  // Close a running game window by profile ID
  ipcMain.on('profile:close', function (_e, id) {
    if (typeof id !== 'string') return;
    // Track play time before closing
    if (_launchTimes.has(id)) {
      var elapsed = Date.now() - _launchTimes.get(id);
      store.addPlayTime(id, elapsed);
      _launchTimes.delete(id);
    }
    if (_handlers.closeProfile) _handlers.closeProfile(id);
  });

  ipcMain.on('auto-login:status', function (_e, data) {
    if (!data || typeof data.profileId !== 'string') return;
    _send('auto-login:status', data);
  });

  ipcMain.on('game-window:status', function (_e, data) {
    if (!data || typeof data.profileId !== 'string') return;
    _send('game-window:status', data);
  });

  // ── Vault (credentials) ──
  ipcMain.handle('vault:get', function (_e, id) {
    if (typeof id !== 'string') return null;
    return vault.getCredentials(id);
  });
  // @security input validation: type + length cap to prevent abuse (huge strings).
  ipcMain.handle('vault:set', function (_e, id, user, pass) {
    if (
      typeof id !== 'string' ||
      typeof user !== 'string' ||
      typeof pass !== 'string' ||
      user.length > 10240 ||
      pass.length > 10240
    )
      return false;
    return vault.setCredentials(id, user, pass);
  });
  ipcMain.handle('vault:remove', function (_e, id) {
    if (typeof id !== 'string') return false;
    return vault.removeCredentials(id);
  });
  ipcMain.handle('vault:has', function (_e, id) {
    if (typeof id !== 'string') return false;
    return vault.hasCredentials(id);
  });

  // ── Diagnostics exporter ──
  const diagnostics = require('../../utils/diagnostics');
  ipcMain.handle('diagnostics:export', async function () {
    try {
      const result = await diagnostics.exportZip(_getWin());
      if (result.ok) {
        _send('profile:toast', {
          type: 'success',
          msg:
            'Diagnostics exported (' +
            Math.round(result.size / 1024) +
            'KB, ' +
            result.entries +
            ' files)'
        });
      } else if (!result.canceled) {
        _send('profile:toast', { type: 'error', msg: 'Export failed: ' + result.error });
      }
      return result;
    } catch (e) {
      _send('profile:toast', { type: 'error', msg: 'Diagnostics failed: ' + e.message });
      return { ok: false, error: e.message };
    }
  });

  // ── Tempmail + API Login + Inspector ──
  const tempmail = require('../../network/tempmail');
  const apiLogin = require('../../network/api-login');
  const inspector = require('../../network/inspector');

  ipcMain.handle('tempmail:create', async function (_e, opts) {
    try {
      // @security reject non-object / array opts to prevent shape abuse.
      if (opts !== undefined && (typeof opts !== 'object' || Array.isArray(opts))) {
        return { ok: false, error: 'Invalid options' };
      }
      opts = opts || {};
      const result = await tempmail.createNarutoAccount(opts);

      // Phase 3g (inherited debt): auto-create Profile + store creds in vault.
      // Previously tempmail created the JWT but not the Profile — the user had to
      // create the profile manually and paste credentials. Now it is automatic.
      const profile = store.create({
        name: opts.name || 'Player ' + result.game.nickname,
        server: opts.server || '',
        region: isValidRegion(opts.region) ? normalizeRegion(opts.region) : 'br',
        language: opts.language || 'pt',
        notificationsEnabled: opts.notificationsEnabled !== false
      });
      let vaultStored = false;
      if (profile) {
        vaultStored = vault.setCredentials(
          profile.id,
          result.tempmail.address,
          result.tempmail.password
        );
        _pushProfiles();
      }

      _send('profile:toast', {
        type: 'success',
        msg:
          'Conta criada: ' +
          result.tempmail.address +
          ' (player ' +
          result.game.nickname +
          (profile ? ' + auto-created profile' : '') +
          ')'
      });
      return { ok: true, data: result, profile: profile, vaultStored: vaultStored };
    } catch (e) {
      _send('profile:toast', { type: 'error', msg: 'Tempmail failed: ' + e.message });
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('tempmail:login', async function (_e, profileId, email, password) {
    // @security length caps prevent DOS via oversized payloads.
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.length > 512 ||
      password.length > 1024
    ) {
      return { ok: false, error: 'Invalid params' };
    }
    try {
      const profile = store.get(profileId);
      if (!profile) return { ok: false, error: 'Profile not found' };
      const partName = partition.getPartitionName(profile);
      const ses = session.fromPartition(partName);
      const result = await apiLogin.loginAndInject(ses, email, password);
      _send('profile:toast', {
        type: 'success',
        msg:
          'Login API OK — ' +
          result.nickname +
          ' (expires in ' +
          Math.round(result.expiresAt / 1000 - Date.now() / 1000) +
          's)'
      });
      return { ok: true, data: result };
    } catch (e) {
      _send('profile:toast', { type: 'error', msg: 'Login API failed: ' + e.message });
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('tempmail:servers', async function (_e, playerId, gamecode) {
    if (typeof playerId !== 'string' || typeof gamecode !== 'string') {
      return { ok: false, error: 'Invalid params' };
    }
    try {
      const servers = await tempmail.getRecommendedServers(playerId, gamecode);
      return { ok: true, data: servers };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('session:check', async function (_e, profileId) {
    if (typeof profileId !== 'string') return { ok: false, error: 'Invalid profileId' };
    try {
      const profile = store.get(profileId);
      if (!profile) return { ok: false, error: 'Profile not found' };
      const partName = partition.getPartitionName(profile);
      const ses = session.fromPartition(partName);
      const status = await apiLogin.checkSession(ses);
      return { ok: true, data: status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('inspector:enable', function (_e, profileId) {
    if (typeof profileId !== 'string') return { ok: false, error: 'Invalid profileId' };
    try {
      const profile = store.get(profileId);
      if (!profile) return { ok: false, error: 'Profile not found' };
      const partName = partition.getPartitionName(profile);
      const ses = session.fromPartition(partName);
      let insp = _inspectors.get(profileId);
      if (!insp) {
        insp = inspector.create(ses, profileId);
        _inspectors.set(profileId, insp);
      }
      insp.enable();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('inspector:disable', function (_e, profileId) {
    if (typeof profileId !== 'string') return { ok: false, error: 'Invalid profileId' };
    const insp = _inspectors.get(profileId);
    if (insp) {
      insp.disable();
      _inspectors.delete(profileId); // frees memory (entries[], JWTs, cookies)
    }
    return { ok: true };
  });

  ipcMain.handle('inspector:entries', function (_e, profileId, filter) {
    if (typeof profileId !== 'string') return { ok: true, data: { entries: [], stats: null } };
    if (
      filter !== null &&
      filter !== undefined &&
      (typeof filter !== 'object' || Array.isArray(filter))
    ) {
      return { ok: true, data: { entries: [], stats: null } };
    }
    const insp = _inspectors.get(profileId);
    if (!insp) return { ok: true, data: { entries: [], stats: null } };
    return { ok: true, data: { entries: insp.getEntries(filter), stats: insp.getStats() } };
  });

  ipcMain.handle('inspector:clear', function (_e, profileId) {
    if (typeof profileId !== 'string') return { ok: false, error: 'Invalid profileId' };
    const insp = _inspectors.get(profileId);
    if (insp) insp.clear();
    return { ok: true };
  });

  // ── Server Selector ──
  const serverSelector = require('../server-selector');
  // @security region is normalized to string|undefined before reaching the selector.
  ipcMain.handle('servers:fetch', function (_e, region) {
    if (region !== undefined && typeof region !== 'string') region = 'br';
    return serverSelector.fetchServers(region || 'br');
  });
  ipcMain.handle('servers:clear-cache', function (_e, region) {
    if (region !== undefined && typeof region !== 'string') region = undefined;
    serverSelector.clearCache(region);
    return { ok: true };
  });

  // ── i18n ──
  const i18n = require('../../config/i18n');
  ipcMain.handle('i18n:get-lang', function () {
    return i18n.getLanguage();
  });
  const ALLOWED_LANGS = ['en', 'pt'];
  ipcMain.handle('i18n:set-lang', function (_e, lang) {
    if (typeof lang !== 'string' || !ALLOWED_LANGS.includes(lang)) return i18n.getLanguage();
    i18n.setLanguage(lang);
    // sync EventTimers language so event names + notifications localize
    et.setLang(lang);
    return i18n.getLanguage();
  });
  ipcMain.handle('i18n:get-all', function () {
    return i18n.getAll();
  });
  ipcMain.handle('i18n:t', function (_e, key) {
    if (typeof key !== 'string') return '';
    return i18n.t(key);
  });

  // ── Events ──
  ipcMain.handle('events:get', function (_e, region) {
    if (region && typeof region !== 'string') region = 'br';
    // pass current language so event names are localized
    return et.getUpcoming(region || 'br', i18n.getLanguage());
  });
  ipcMain.on('events:set-muted', function (_e, m) {
    if (typeof m !== 'boolean') return;
    if (_handlers.setMuted) {
      _handlers.setMuted(m);
    } else {
      et.setMuted(m);
    }
  });
  // global reminder override (minutes before event start)
  ipcMain.on('events:set-remind', function (_e, min) {
    if (typeof min !== 'number' || min < 0 || min > 120) return;
    et.setRemindMin(min);
  });
  // keep EventTimers language in sync with launcher language
  et.setLang(i18n.getLanguage());

  // ── Export / Import ──
  ipcMain.handle('profiles:export', function () {
    return store.exportJSON();
  });

  ipcMain.handle('profiles:import', function (_e, jsonStr) {
    if (typeof jsonStr !== 'string' || jsonStr.length > 2 * 1024 * 1024) {
      return { imported: 0, error: 'Invalid or too large import data' };
    }
    const res = store.importJSON(jsonStr);
    _pushProfiles();
    _pushEvents();
    return res;
  });

  ipcMain.handle('profiles:export-encrypted', async function (_e, password) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 1024) {
      return { ok: false, error: 'Password must be at least 8 characters (max 1024)' };
    }
    const win = _getWin();
    if (!win) return { ok: false, error: 'Manager window closed' };
    try {
      const profiles = store.getAll();
      const credentialsMap = {};
      profiles.forEach(function (p) {
        if (vault.hasCredentials(p.id)) {
          credentialsMap[p.id] = vault.getCredentials(p.id);
        }
      });
      const encrypted = vault.exportEncryptedBackup(profiles, credentialsMap, password);

      const result = await dialog.showSaveDialog(win, {
        title: 'Export encrypted backup',
        defaultPath: 'shinobi-backup-' + new Date().toISOString().slice(0, 10) + '.enc',
        filters: [{ name: 'Shinobi Backup', extensions: ['enc'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };

      fs.writeFileSync(result.filePath, encrypted, 'utf8');
      logger.info(
        'Encrypted backup saved: ' + result.filePath + ' (' + profiles.length + ' perfis)'
      );
      return { ok: true, path: result.filePath, count: profiles.length };
    } catch (e) {
      logger.error('Export backup failed: ' + e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('profiles:import-encrypted', async function (_e, password) {
    if (typeof password !== 'string' || password.length > 1024) {
      return { ok: false, error: 'Password required (max 1024 chars)' };
    }
    const win = _getWin();
    if (!win) return { ok: false, error: 'Manager window closed' };
    try {
      const result = await dialog.showOpenDialog(win, {
        title: 'Import encrypted backup',
        filters: [{ name: 'Shinobi Backup', extensions: ['enc'] }],
        properties: ['openFile']
      });
      if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };

      const filePath = result.filePaths[0];
      const stat = fs.statSync(filePath);
      if (stat.size > 10 * 1024 * 1024) return { ok: false, error: 'File too large (max 10MB)' };
      const encrypted = fs.readFileSync(filePath, 'utf8');
      const payload = vault.importEncryptedBackup(encrypted, password);

      let imported = 0,
        skipped = 0;
      payload.profiles.forEach(function (p) {
        if (!store.get(p.id)) {
          const newProfile = store.create({
            name: p.name,
            server: p.server,
            region: p.region,
            language: p.language,
            notificationsEnabled: p.notificationsEnabled
          });
          if (newProfile) {
            imported++;
            if (payload.credentials && payload.credentials[p.id]) {
              const creds = payload.credentials[p.id];
              if (creds.user && creds.pass) {
                vault.setCredentials(newProfile.id, creds.user, creds.pass);
              }
            }
          }
        } else {
          skipped++;
        }
      });

      _pushProfiles();
      _pushEvents();
      logger.info('Backup imported: ' + imported + ' profiles, ' + skipped + ' skipped');
      return { ok: true, imported: imported, skipped: skipped };
    } catch (e) {
      logger.error('Import backup failed: ' + e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('profiles:export-file', async function () {
    const win = _getWin();
    if (!win) return { ok: false };
    const json = store.exportJSON();
    const result = await dialog.showSaveDialog(win, {
      title: 'Export profiles',
      defaultPath: 'shinobi-profiles.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    try {
      fs.writeFileSync(result.filePath, json, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('profiles:import-file', async function () {
    const win = _getWin();
    if (!win) return { ok: false, imported: 0 };
    const result = await dialog.showOpenDialog(win, {
      title: 'Import profiles',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, imported: 0 };
    try {
      const filePath = result.filePaths[0];
      const stat = fs.statSync(filePath);
      if (stat.size > 10 * 1024 * 1024)
        return { ok: false, error: 'File too large (max 10MB)', imported: 0 };
      const raw = fs.readFileSync(filePath, 'utf8');
      const res = store.importJSON(raw);
      _pushProfiles();
      _pushEvents();
      return { ok: true, imported: res.imported, skipped: res.skipped };
    } catch (e) {
      return { ok: false, error: e.message, imported: 0 };
    }
  });

  // Starts periodic state broadcast (listeners + 30s timer)
  StateBroadcaster.startAutoRefresh();
}

/**
 * Launches the game for a profile (delegated to game-launcher) with tracking of
 * launchCount + totalPlayMs via store.
 * @param {string} profileId
 * @param {Function} [onOpened]
 * @param {Function} [onClosed]
 */
function launchProfile(profileId, onOpened, onClosed) {
  const gameLauncher = require('../game-launcher');
  gameLauncher.launchProfile(
    profileId,
    function () {
      store.incrementLaunch(profileId);
      // registers in launch log for timeline (must not break the launch)
      try {
        store.recordLaunch(profileId);
      } catch (e) {
        logger.warn('IpcRouter: recordLaunch failed: ' + e.message);
      }
      _launchTimes.set(profileId, Date.now());
      _pushProfiles();
      if (onOpened) onOpened();
    },
    function () {
      const startTime = _launchTimes.get(profileId);
      if (startTime) {
        const playMs = Date.now() - startTime;
        store.addPlayTime(profileId, playMs);
        _launchTimes.delete(profileId);
      }
      _pushProfiles();
      if (onClosed) onClosed();
    }
  );
}

module.exports = {
  registerIpcHandlers: registerIpcHandlers,
  launchProfile: launchProfile
};
