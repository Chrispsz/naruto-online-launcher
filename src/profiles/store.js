/**
 * ProfileStore — Robust profile storage (Multi-account)
 *
 * PHILOSOPHY (revised):
 *   The user does NOT want "8 simultaneous accounts" by default. They want PROFILES:
 *   clicks a profile → opens the game with saved cookies → plays. Simple.
 *
 *   Real-time multi-account (multiple windows open) is a SECONDARY feature
 *   for power-users, accessible via "Open additional", not the default flow.
 *
 *   Each profile stores: id, name (e.g.: "chris"), server (e.g.: "s799"),
 *   region (BR/NA/EU/HK), identification color, and cookies persisted
 *   automatically by the Chromium session partition.
 *
 * ROBUSTNESS (fixing what the user asked for):
 *   - Atomic write: writes to .tmp, renames. Never corrupts on power loss.
 *   - Backup .bak before each save. Auto-recovery if JSON breaks.
 *   - Schema validation: each profile is validated; invalid ones are discarded.
 *   - 1MB file size limit (sanity check against silent corruption).
 *   - Try/catch on ALL synchronous I/O operations.
 *   - Maximum 12 profiles (increased per requirement, but default is 1 active window).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const logger = require('../utils/logger');
const { isValidRegion, normalizeRegion, isCurrentRegion } = require('../config/regions');

const PROFILES_DIR = 'profiles';
const PROFILES_FILE = 'profiles.json';
const BACKUP_FILE = 'profiles.json.bak';
const MAX_PROFILES = 10;
const MAX_FILE_BYTES = 1024 * 1024; // 1MB sane limit

// Launch log (timeline) — persisted separately from profiles.json to
// avoid interfering with profile schema migrations. Limit of 5000 entries
// prevents unlimited growth (~6 months of intensive use).
const LAUNCH_LOG_FILE = 'launch-log.json';
const MAX_LAUNCH_LOG_ENTRIES = 5000;

// Schema validator — never trust data read from disk
// added language (pt/en) and notificationsEnabled (boolean) per profile
// adicionado notes (string, max 200), launchCount (number), totalPlayMs (number)
function isValidProfile(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.id !== 'string' || !/^p_[a-f0-9]{8,16}$/.test(p.id)) return false;
  if (typeof p.name !== 'string' || p.name.length === 0 || p.name.length > 40) return false;
  if (typeof p.server !== 'string' || p.server.length > 20) return false;
  // accept 6 current clusters (br/na/de/es/pl/fr) + 4 legacy codes
  // (eu/hk/pt/en) which are auto-migrated to current clusters on load via
  // normalizeRegion(). isValidRegion accepts both current + legacy.
  if (!isValidRegion(p.region)) return false;
  // language optional (default 'pt' for backward compatibility)
  // sync with settings.js — i18n supports 6 languages
  if (p.language !== undefined && !['pt', 'en', 'de', 'es', 'pl', 'fr'].includes(p.language))
    return false;
  // notificationsEnabled optional (default true for backward compatibility)
  if (p.notificationsEnabled !== undefined && typeof p.notificationsEnabled !== 'boolean')
    return false;
  if (typeof p.createdAt !== 'number' || p.createdAt < 0) return false;
  if (typeof p.lastUsed !== 'number' || p.lastUsed < 0) return false;
  // notes optional (string, max 200 chars)
  if (p.notes !== undefined && (typeof p.notes !== 'string' || p.notes.length > 200)) return false;
  // launchCount optional (number, >= 0)
  if (
    p.launchCount !== undefined &&
    (typeof p.launchCount !== 'number' || p.launchCount < 0 || !isFinite(p.launchCount))
  )
    return false;
  // totalPlayMs optional (number, >= 0)
  if (
    p.totalPlayMs !== undefined &&
    (typeof p.totalPlayMs !== 'number' || p.totalPlayMs < 0 || !isFinite(p.totalPlayMs))
  )
    return false;
  // favorite optional (boolean)
  if (p.favorite !== undefined && typeof p.favorite !== 'boolean') return false;
  // tags optional (array of strings, max 5 tags, each max 20 chars)
  if (p.tags !== undefined) {
    if (!Array.isArray(p.tags)) return false;
    if (p.tags.length > 5) return false;
    for (var i = 0; i < p.tags.length; i++) {
      if (typeof p.tags[i] !== 'string' || p.tags[i].length > 20 || p.tags[i].length === 0)
        return false;
    }
  }
  return true;
}

// Automatic migration of v1 profiles (without language/notificationsEnabled) to v2
// v3 migration (without notes/launchCount/totalPlayMs) to v3
function _migrateProfile(p) {
  if (!p) return p;
  if (p.language === undefined) p.language = 'pt';
  if (p.notificationsEnabled === undefined) p.notificationsEnabled = true;
  // new fields with safe defaults
  if (p.notes === undefined) p.notes = '';
  if (p.launchCount === undefined) p.launchCount = 0;
  if (p.totalPlayMs === undefined) p.totalPlayMs = 0;
  // favorite flag (default false)
  if (p.favorite === undefined) p.favorite = false;
  // tags (default empty array)
  if (p.tags === undefined) p.tags = [];
  return p;
}

let _profiles = null; // in-memory cache
let _listeners = [];
let _launchLog = null; // in-memory cache of launch log

function getDir() {
  return path.join(app.getPath('userData'), PROFILES_DIR);
}

function getFile() {
  return path.join(getDir(), PROFILES_FILE);
}

function getBackupFile() {
  return path.join(getDir(), BACKUP_FILE);
}

function ensureDir() {
  try {
    const dir = getDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    logger.error('ProfileStore: failed to create directory: ' + e.message);
  }
}

/**
 * Loads profiles from disk with automatic backup recovery.
 * Always returns a valid array (possibly empty).
 * @returns {Array}
 */
function load() {
  ensureDir();

  // always loads launch log (regardless of profiles.json state,
  // so the _launchLog cache doesn't go stale between loads)
  _loadLaunchLog();

  const file = getFile();
  const backup = getBackupFile();

  // Try main file
  let parsed = null;
  try {
    if (fs.existsSync(file)) {
      const stat = fs.statSync(file);
      if (stat.size > MAX_FILE_BYTES) {
        logger.warn('ProfileStore: file too large (' + stat.size + ' bytes), discarding');
        throw new Error('oversized');
      }
      const raw = fs.readFileSync(file, 'utf8');
      parsed = JSON.parse(raw);
    }
  } catch (e) {
    logger.error('ProfileStore: main JSON corrupted: ' + e.message);
    // Try backup
    try {
      if (fs.existsSync(backup)) {
        logger.warn('ProfileStore: recovering from .bak backup');
        const rawBak = fs.readFileSync(backup, 'utf8');
        parsed = JSON.parse(rawBak);
      }
    } catch (e2) {
      logger.error('ProfileStore: backup also corrupted: ' + e2.message);
      parsed = null;
    }
  }

  if (!Array.isArray(parsed)) {
    _profiles = [];
    return _profiles;
  }

  // Validates each profile; silently discards invalid ones
  _profiles = parsed.filter(isValidProfile);
  if (_profiles.length !== parsed.length) {
    logger.warn(
      'ProfileStore: ' +
        (parsed.length - _profiles.length) +
        ' invalid profile(s) discarded'
    );
  }
  // migrate v1 profiles (without language/notificationsEnabled) to v2
  // migra region codes legacy (eu/hk/pt/en) para clusters atuais
  let migrated = 0;
  let regionMigrated = 0;
  _profiles.forEach(function (p) {
    // Performance: capture the 3 fields before mutation, then compare directly.
    // Avoids 2× JSON.stringify per profile on every load() (startup + reset).
    var beforeLang = p.language;
    var beforeNotif = p.notificationsEnabled;
    var beforeRegion = p.region;
    _migrateProfile(p);
    // Normalize legacy region codes (eu→na, hk→na, pt→br, en→na)
    if (p.region && !isCurrentRegion(p.region)) {
      p.region = normalizeRegion(p.region);
    }
    if (beforeRegion !== p.region) regionMigrated++;
    if (
      beforeLang !== p.language ||
      beforeNotif !== p.notificationsEnabled ||
      beforeRegion !== p.region
    ) {
      migrated++;
    }
  });
  if (regionMigrated > 0) {
    logger.info(
      'ProfileStore: ' +
        regionMigrated +
        ' profile(s) with legacy region migrated to current cluster'
    );
  }
  if (migrated > 0) {
    logger.info(
      'ProfileStore: ' +
        migrated +
        ' profile(s) migrated to current schema (language + notificationsEnabled + region)'
    );
    _saveToDisk(_profiles);
  } else if (_profiles.length !== parsed.length) {
    _saveToDisk(_profiles);
  }

  logger.info('ProfileStore: ' + _profiles.length + ' profile(s) loaded');
  return _profiles;
}

/**
 * Saves profiles to disk atomically with backup.
 * NEVER throws — catches all exceptions.
 * @param {Array} profiles
 * @returns {boolean} true if saved successfully
 */
function _saveToDisk(profiles) {
  ensureDir();
  const file = getFile();
  const backup = getBackupFile();
  const tmp = file + '.tmp';

  try {
    const json = JSON.stringify(profiles, null, 2);

    // Size limit before writing
    if (Buffer.byteLength(json, 'utf8') > MAX_FILE_BYTES) {
      logger.error('ProfileStore: refusing to save — JSON exceeds 1MB');
      return false;
    }

    // Backup of current before overwriting
    try {
      if (fs.existsSync(file)) {
        fs.copyFileSync(file, backup);
      }
    } catch (e) {
      logger.warn('ProfileStore: failed to create backup: ' + e.message);
    }

    // Atomic write: tmp → rename
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    logger.error('ProfileStore: failed to save: ' + e.message);
    // Tries to clean up orphan tmp
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
    return false;
  }
}

/**
 * Persists the current cache + notifies listeners.
 */
function persist() {
  if (_profiles === null) return;
  const ok = _saveToDisk(_profiles);
  if (ok) {
    _listeners.forEach(function (cb) {
      try {
        cb(_profiles);
      } catch (_) {
        /* ignore listener errors */
      }
    });
  }
}

function getAll() {
  if (_profiles === null) load();
  return _profiles.slice();
}

function get(id) {
  if (_profiles === null) load();
  return (
    _profiles.find(function (p) {
      return p.id === id;
    }) || null
  );
}

function create(opts) {
  if (_profiles === null) load();
  if (_profiles.length >= MAX_PROFILES) {
    logger.warn('ProfileStore: limit of ' + MAX_PROFILES + ' profiles reached');
    return null;
  }
  opts = opts || {};
  const profile = {
    id: 'p_' + crypto.randomBytes(6).toString('hex'),
    name:
      String(opts.name || 'Account ' + (_profiles.length + 1))
        .slice(0, 40)
        .trim() || 'Account',
    server: String(opts.server || '')
      .slice(0, 20)
      .trim(),
    region: isValidRegion(opts.region) ? normalizeRegion(opts.region) : 'br',
    // sync with settings.js — i18n supports 6 languages
    language: ['pt', 'en', 'de', 'es', 'pl', 'fr'].includes(opts.language) ? opts.language : 'pt',
    notificationsEnabled:
      typeof opts.notificationsEnabled === 'boolean' ? opts.notificationsEnabled : true,
    // new fields
    notes: typeof opts.notes === 'string' ? opts.notes.slice(0, 200) : '',
    launchCount: 0,
    totalPlayMs: 0,
    // favorite flag
    favorite: typeof opts.favorite === 'boolean' ? opts.favorite : false,
    // tags (array of strings, max 5, each max 20 chars)
    tags: Array.isArray(opts.tags)
      ? opts.tags
          .filter(function (t) {
            return typeof t === 'string' && t.length > 0 && t.length <= 20;
          })
          .slice(0, 5)
      : [],
    createdAt: Date.now(),
    lastUsed: 0
  };
  _profiles.push(profile);
  persist();
  logger.info(
    'ProfileStore: profile created — ' +
      profile.name +
      (profile.server ? ' (' + profile.server + ')' : '') +
      ' [' +
      profile.region +
      '/' +
      profile.language +
      ']'
  );
  return profile;
}

function update(id, updates) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (!p) return false;
  if (typeof updates.name === 'string') p.name = updates.name.slice(0, 40).trim() || p.name;
  if (typeof updates.server === 'string') p.server = updates.server.slice(0, 20).trim();
  if (isValidRegion(updates.region)) p.region = normalizeRegion(updates.region);
  // sync with settings.js — i18n supports 6 languages
  if (['pt', 'en', 'de', 'es', 'pl', 'fr'].includes(updates.language))
    p.language = updates.language;
  if (typeof updates.notificationsEnabled === 'boolean')
    p.notificationsEnabled = updates.notificationsEnabled;
  // notes (string, max 200)
  if (typeof updates.notes === 'string') p.notes = updates.notes.slice(0, 200);
  // favorite (boolean)
  if (typeof updates.favorite === 'boolean') p.favorite = updates.favorite;
  // tags (array of strings, max 5, each max 20 chars)
  if (Array.isArray(updates.tags)) {
    p.tags = updates.tags
      .filter(function (t) {
        return typeof t === 'string' && t.length > 0 && t.length <= 20;
      })
      .slice(0, 5);
  }
  persist();
  return true;
}

function remove(id) {
  if (_profiles === null) load();
  const idx = _profiles.findIndex(function (x) {
    return x.id === id;
  });
  if (idx === -1) return false;
  _profiles.splice(idx, 1);
  persist();

  // Partition wipe (cookies/cache of removed profile)
  try {
    const partDir = path.join(app.getPath('userData'), 'Partitions', 'profile-' + id);
    if (fs.existsSync(partDir)) {
      _rmrf(partDir);
      logger.info('ProfileStore: partition data removed for ' + id);
    }
  } catch (e) {
    logger.warn('ProfileStore: failed to remove partition: ' + e.message);
  }
  return true;
}

/**
 * Reorder profiles to match the given array of IDs.
 * IDs not found are ignored; profiles not in the list keep their relative order.
 * @param {string[]} order - Array of profile IDs in desired order
 */
function reorder(order) {
  if (_profiles === null) load();
  if (!Array.isArray(order)) return;
  var reordered = [];
  var seen = new Set();
  // First, place profiles in the specified order
  order.forEach(function (id) {
    var p = _profiles.find(function (x) {
      return x.id === id;
    });
    if (p && !seen.has(id)) {
      reordered.push(p);
      seen.add(id);
    }
  });
  // Then append any profiles not in the order list
  _profiles.forEach(function (p) {
    if (!seen.has(p.id)) reordered.push(p);
  });
  _profiles = reordered;
  persist();
}

function touch(id) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (p) {
    p.lastUsed = Date.now();
    persist();
  }
}

/**
 * Increments profile launch count.
 * @param {string} id
 * @returns {boolean}
 */
function incrementLaunch(id) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (!p) return false;
  p.launchCount = (p.launchCount || 0) + 1;
  p.lastUsed = Date.now();
  persist();
  return true;
}

/**
 * Adds play time (ms) to the profile's accumulated total.
 * @param {string} id
 * @param {number} ms - milliseconds to add (clamped to [0, 24h])
 * @returns {boolean}
 */
function addPlayTime(id, ms) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (!p) return false;
  // Sanity check: 0 <= ms <= 24h (prevents overflow from timer bug)
  const clamped = Math.max(0, Math.min(24 * 60 * 60 * 1000, Number(ms) || 0));
  p.totalPlayMs = (p.totalPlayMs || 0) + clamped;
  persist();
  return true;
}

/**
 * Returns usage statistics for a profile.
 * @param {string} id
 * @returns {{launchCount:number, totalPlayMs:number, lastUsed:number, avgSessionMs:number}|null}
 */
function getStats(id) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (!p) return null;
  const launches = p.launchCount || 0;
  const totalMs = p.totalPlayMs || 0;
  return {
    launchCount: launches,
    totalPlayMs: totalMs,
    lastUsed: p.lastUsed || 0,
    avgSessionMs: launches > 0 ? Math.round(totalMs / launches) : 0
  };
}

/**
 * Exports all profiles as JSON string (for Win↔Linux portability).
 * Does not include cookies (they're per-partition on disk) — only metadata.
 * @returns {string}
 */
function exportJSON() {
  if (_profiles === null) load();
  return JSON.stringify(
    {
      version: 2,
      exportedAt: Date.now(),
      profiles: _profiles
    },
    null,
    2
  );
}

/**
 * Importa perfis de um JSON string (merge: preserva existentes por nome+server).
 * @param {string} jsonStr
 * @returns {{imported: number, skipped: number}}
 */
function importJSON(jsonStr) {
  if (_profiles === null) load();
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('ProfileStore: invalid import JSON: ' + e.message);
    return { imported: 0, skipped: 0 };
  }
  const incoming = Array.isArray(data.profiles) ? data.profiles : Array.isArray(data) ? data : [];
  let imported = 0,
    skipped = 0;
  incoming.forEach(function (p) {
    if (!isValidProfile(p)) {
      skipped++;
      return;
    }
    if (_profiles.length >= MAX_PROFILES) {
      skipped++;
      return;
    }
    // Dedup by name+server
    const dup = _profiles.find(function (x) {
      return x.name === p.name && x.server === p.server;
    });
    if (dup) {
      skipped++;
      return;
    }
    // New ID (avoids collision with existing ones)
    const fresh = Object.assign({}, p, {
      id: 'p_' + crypto.randomBytes(6).toString('hex'),
      createdAt: Date.now(),
      lastUsed: 0
    });
    _profiles.push(fresh);
    imported++;
  });
  persist();
  logger.info('ProfileStore: imported ' + imported + ', skipped ' + skipped);
  return { imported: imported, skipped: skipped };
}

function onChange(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

// Recursive helper to remove directory
function _rmrf(p) {
  if (fs.existsSync(p)) {
    fs.readdirSync(p).forEach(function (entry) {
      const cur = path.join(p, entry);
      if (fs.lstatSync(cur).isDirectory()) _rmrf(cur);
      else fs.unlinkSync(cur);
    });
    fs.rmdirSync(p);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Launch log (timeline) — launch log for 7-day chart
// Persisted in userData/launch-log.json (separate file from profiles.json).
// Cada entrada: { id: profileId, ts: number }. Cap em MAX_LAUNCH_LOG_ENTRIES.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Retorna o caminho do arquivo de launch log.
 * @returns {string}
 */
function getLaunchLogFile() {
  return path.join(app.getPath('userData'), LAUNCH_LOG_FILE);
}

/**
 * Formats a timestamp as 'YYYY-MM-DD' using LOCAL time (not UTC).
 * @param {number} ts
 * @returns {string}
 */
function _formatDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * Carrega o launch log do disco. Arquivo ausente → array vazio.
 * JSON malformado → array vazio + warning. Faz cap em MAX_LAUNCH_LOG_ENTRIES.
 * NEVER throws — catches all exceptions.
 * @returns {Array}
 */
function _loadLaunchLog() {
  const file = getLaunchLogFile();
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Validates each entry; silently discards invalid ones
        _launchLog = parsed.filter(function (e) {
          return e && typeof e.id === 'string' && typeof e.ts === 'number' && isFinite(e.ts);
        });
        if (_launchLog.length !== parsed.length) {
          logger.warn(
            'LaunchLog: ' +
              (parsed.length - _launchLog.length) +
              ' invalid entry(ies) discarded'
          );
        }
      } else {
        logger.warn('LaunchLog: file is not an array — starting empty');
        _launchLog = [];
      }
    } else {
      // Backward-compat: first run, file doesn't exist → starts empty
      _launchLog = [];
    }
  } catch (e) {
    logger.warn('LaunchLog: corrupted file (' + e.message + ') — starting empty');
    _launchLog = [];
  }
  // Defensive cap (normally the cap already happens in recordLaunch)
  if (_launchLog.length > MAX_LAUNCH_LOG_ENTRIES) {
    _launchLog = _launchLog.slice(_launchLog.length - MAX_LAUNCH_LOG_ENTRIES);
  }
  return _launchLog;
}

/**
 * Persists the launch log to disk (atomic write: tmp → rename). NEVER throws.
 */
function _persistLaunchLog() {
  if (_launchLog === null) return;
  const file = getLaunchLogFile();
  const tmp = file + '.tmp';
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(_launchLog);
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    logger.error('LaunchLog: failed to save: ' + e.message);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * Records a launch in the log. No-op if the profile doesn't exist.
 * @param {string} profileId
 * @returns {boolean} true if recorded, false otherwise (invalid id or non-existent profile)
 */
function recordLaunch(profileId) {
  if (_profiles === null) load();
  if (_launchLog === null) _loadLaunchLog();
  if (typeof profileId !== 'string' || profileId.length === 0) return false;
  const p = _profiles.find(function (x) {
    return x.id === profileId;
  });
  if (!p) return false;
  _launchLog.push({ id: profileId, ts: Date.now() });
  // Cap at MAX_LAUNCH_LOG_ENTRIES (drop oldest)
  if (_launchLog.length > MAX_LAUNCH_LOG_ENTRIES) {
    _launchLog = _launchLog.slice(_launchLog.length - MAX_LAUNCH_LOG_ENTRIES);
  }
  _persistLaunchLog();
  return true;
}

/**
 * Returns a launch timeline for the last `days` days.
 * Array de tamanho `days`, oldest first → newest last.
 * Each entry: { date: 'YYYY-MM-DD', count: number, profiles: [{id, name, count}] }
 * Entries without launches appear with count 0 and empty profiles.
 * @param {number} [days=7]
 * @returns {Array}
 */
function getLaunchTimeline(days) {
  if (_launchLog === null) _loadLaunchLog();
  if (_profiles === null) load();
  if (typeof days !== 'number' || !isFinite(days) || days <= 0) days = 7;
  days = Math.floor(days);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Builds buckets: index 0 = (days-1) days ago, index (days-1) = today
  const buckets = [];
  const dateToIdx = {};
  for (var i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = _formatDate(d.getTime());
    const idx = buckets.length;
    buckets.push({ date: dateStr, count: 0, profiles: [], _byId: {} });
    dateToIdx[dateStr] = idx;
  }

  // Aggregates launch log by local date
  _launchLog.forEach(function (entry) {
    const dateStr = _formatDate(entry.ts);
    const idx = dateToIdx[dateStr];
    if (idx === undefined) return; // fora da janela de dias
    const b = buckets[idx];
    b.count++;
    const p = _profiles.find(function (x) {
      return x.id === entry.id;
    });
    if (!p) return; // profile deleted — doesn't count in profiles array
    if (!b._byId[entry.id]) {
      b._byId[entry.id] = { id: entry.id, name: p.name, count: 0 };
      b.profiles.push(b._byId[entry.id]);
    }
    b._byId[entry.id].count++;
  });

  // Remove internal helper before returning
  buckets.forEach(function (b) {
    delete b._byId;
  });
  return buckets;
}

/**
 * Clears the entire launch log (resets and persists).
 */
function clearLaunchLog() {
  if (_launchLog === null) _loadLaunchLog();
  _launchLog = [];
  _persistLaunchLog();
}

/**
 * Returns launch log statistics.
 * @returns {{total:number, oldestTs:number|null, newestTs:number|null}}
 */
function getLaunchLogStats() {
  if (_launchLog === null) _loadLaunchLog();
  if (_launchLog.length === 0) {
    return { total: 0, oldestTs: null, newestTs: null };
  }
  let oldest = _launchLog[0].ts;
  let newest = _launchLog[0].ts;
  for (var i = 1; i < _launchLog.length; i++) {
    if (_launchLog[i].ts < oldest) oldest = _launchLog[i].ts;
    if (_launchLog[i].ts > newest) newest = _launchLog[i].ts;
  }
  return { total: _launchLog.length, oldestTs: oldest, newestTs: newest };
}

module.exports = {
  load: load,
  getAll: getAll,
  get: get,
  create: create,
  update: update,
  remove: remove,
  reorder: reorder,
  touch: touch,
  exportJSON: exportJSON,
  importJSON: importJSON,
  onChange: onChange,
  // stats methods
  incrementLaunch: incrementLaunch,
  addPlayTime: addPlayTime,
  getStats: getStats,
  getPartitionName: function (id) {
    return 'persist:profile-' + id;
  },
  MAX_PROFILES: MAX_PROFILES,
  // launch log (timeline)
  recordLaunch: recordLaunch,
  getLaunchTimeline: getLaunchTimeline,
  clearLaunchLog: clearLaunchLog,
  getLaunchLogStats: getLaunchLogStats
};
