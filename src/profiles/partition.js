/**
 * profiles/partition.js — Shadow Partition manager (disruptive RAM saver)
 * v3.0.0 — DISRUPTIVE INNOVATION
 *
 * PROBLEMA QUE RESOLVE:
 *   Each profile with `persist:profile-<id>` writes ~30-80MB to disk and keeps
 *   cache/localStorage/indexedDB loaded in RAM. On a 2-4GB PC with 4
 *   accounts, that is 120-320MB JUST from partitions — unfeasible.
 *
 * SOLUTION — SHADOW PARTITIONS:
 *   Instead of `persist:` (writes to disk), use `partition:profile-<id>`
 *   (EPHEMERAL — exists only in RAM while the window is open; wiped on close).
 *   On close, takes a SNAPSHOT of only the authentication cookies from the
 *   game domain (typically 2-5KB) and saves to cookie-snapshots.json.
 *   On next open, restores cookies before loading the page.
 *
 *   Result: even multi-account on low-spec PC doesn't accumulate 300MB of partitions.
 *   The cost is re-download of static assets (mitigated by disk-cache-size
 *   global compartilhado na default session).
 *
 * POLICY:
 *   - Low-Spec mode (RAM <4GB) or forceLowSpec → shadow ACTIVE for all profiles.
 *   - Normal mode → persist (default behavior, backwards-compatible).
 *   - Profile can force shadow via profile.shadow=true (power-user opt-in).
 *
 * ISOLAMENTO:
 *   Shadow partitions remain 100% isolated from each other by Chromium
 *   (each `partition:name` is a separate session/cookies/storage sandbox).
 *   The difference is only disk persistence.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { app, session } = require('electron');
const logger = require('../utils/logger');

const SNAPSHOTS_FILE = 'cookie-snapshots.json';
const MAX_SNAPSHOTS_BYTES = 512 * 1024; // 512KB sane limit

// Game domains whose cookies are preserved in the snapshot
const AUTH_DOMAINS = ['oasgames.com', 'naruto.oasgames.com'];

let _snapshots = null; // profileId -> [cookie, ...]
let _lowSpecMode = false;

/**
 * Set whether shadow (ephemeral) partitions should be the default.
 * Called from memory/guard when Modo Low-Spec toggles.
 * @param {boolean} lowSpec
 */
function setLowSpecMode(lowSpec) {
  _lowSpecMode = !!lowSpec;
  logger.info(
    'partition: Modo Low-Spec = ' + _lowSpecMode + ' → shadow default = ' + shouldUseShadow(null)
  );
}

/**
 * Decides whether a profile should use shadow (ephemeral) partition.
 * @param {Object|null} profile - profile object (may have .shadow override)
 * @returns {boolean}
 */
function shouldUseShadow(profile) {
  if (profile && profile.shadow === true) return true;
  if (_lowSpecMode) return true;
  return false;
}

/**
 * Returns the partition name for a profile.
 * `persist:profile-<id>` (durable) or `partition:profile-<id>` (ephemeral).
 * @param {Object} profile
 * @returns {string}
 */
function getPartitionName(profile) {
  const id = profile.id || profile;
  return shouldUseShadow(profile) ? 'partition:profile-' + id : 'persist:profile-' + id;
}

// ── Snapshot persistence ──

function _getSnapshotsPath() {
  return path.join(app.getPath('userData'), SNAPSHOTS_FILE);
}

function _ensureSnapshotsLoaded() {
  if (_snapshots !== null) return;
  const file = _getSnapshotsPath();
  try {
    if (fs.existsSync(file)) {
      const stat = fs.statSync(file);
      if (stat.size > MAX_SNAPSHOTS_BYTES) throw new Error('oversized');
      _snapshots = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!_snapshots || typeof _snapshots !== 'object') _snapshots = {};
    } else {
      _snapshots = {};
    }
  } catch (e) {
    logger.error('partition: corrupted snapshots, resetting: ' + e.message);
    _snapshots = {};
  }
}

function _persistSnapshots() {
  _ensureSnapshotsLoaded();
  const file = _getSnapshotsPath();
  const tmp = file + '.tmp';
  try {
    const json = JSON.stringify(_snapshots);
    if (Buffer.byteLength(json, 'utf8') > MAX_SNAPSHOTS_BYTES) {
      logger.warn('partition: snapshots exceed 512KB — truncating oldest');
      // Drop oldest entries
      const keys = Object.keys(_snapshots);
      while (
        Buffer.byteLength(JSON.stringify(_snapshots), 'utf8') > MAX_SNAPSHOTS_BYTES * 0.8 &&
        keys.length > 1
      ) {
        delete _snapshots[keys.shift()];
      }
    }
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    logger.error('partition: failed to save snapshots: ' + e.message);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * Filters cookies to keep only those from game authentication domains.
 * @param {Array} cookies
 * @returns {Array}
 */
function _filterAuthCookies(cookies) {
  return cookies.filter(function (c) {
    const domain = (c.domain || '').toLowerCase();
    return AUTH_DOMAINS.some(function (d) {
      return domain.includes(d);
    });
  });
}

/**
 * Snapshot auth cookies from a partition's session (called on window close).
 * @param {string} partitionName
 * @param {string} profileId
 * @returns {Promise<boolean>}
 */
async function snapshotCookies(partitionName, profileId) {
  try {
    const ses = session.fromPartition(partitionName);
    const allCookies = await ses.cookies.get({});
    const authCookies = _filterAuthCookies(allCookies);
    _ensureSnapshotsLoaded();
    _snapshots[profileId] = authCookies;
    _persistSnapshots();
    logger.info('partition: snapshot of ' + authCookies.length + ' cookies for ' + profileId);
    return true;
  } catch (e) {
    logger.debug('partition: snapshot failed: ' + e.message);
    return false;
  }
}

/**
 * Restore auth cookies into a partition's session (called on window open, before load).
 * @param {string} partitionName
 * @param {string} profileId
 * @returns {Promise<number>} number of cookies restored
 */
async function restoreCookies(partitionName, profileId) {
  try {
    _ensureSnapshotsLoaded();
    const cookies = _snapshots[profileId];
    if (!Array.isArray(cookies) || cookies.length === 0) return 0;
    const ses = session.fromPartition(partitionName);
    let restored = 0;
    for (let i = 0; i < cookies.length; i++) {
      try {
        // Electron's cookies.set needs a URL; derive from domain
        const c = cookies[i];
        const url = (c.secure ? 'https://' : 'http://') + (c.domain || '').replace(/^\./, '');
        await ses.cookies.set(Object.assign({}, c, { url: url }));
        restored++;
      } catch (_) {
        /* individual cookie failure is ok */
      }
    }
    logger.info('partition: restored ' + restored + ' cookies for ' + profileId);
    return restored;
  } catch (e) {
    logger.debug('partition: restore failed: ' + e.message);
    return 0;
  }
}

/**
 * Remove snapshots for a profile (called on profile delete).
 * @param {string} profileId
 */
function removeSnapshot(profileId) {
  _ensureSnapshotsLoaded();
  if (_snapshots[profileId]) {
    delete _snapshots[profileId];
    _persistSnapshots();
  }
}

/**
 * Creates the persistent partition directory on disk eagerly.
 * Needed so that bunshin/clone of a newly-created profile doesn't fail with
 * "user-data-dir of the source does not exist" (Chromium only creates the dir on the first
 * launch — without this, operations that depend on the dir before the first launch
 * quebram).
 *
 * In shadow mode (partition:profile-<id>), the partition is ephemeral and has NO
 * dir on disk — this method is a no-op.
 *
 * @param {Object|string} profile - profile object ou id
 * @returns {boolean} true if created or already existed
 */
function ensurePartitionDir(profile) {
  // Shadow partitions don't persist to disk — nothing to do.
  if (shouldUseShadow(profile)) return true;

  const id = (profile && profile.id) || profile;
  if (!id) return false;

  try {
    const dir = path.join(app.getPath('userData'), 'Partitions', 'profile-' + id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('partition: dir created eagerly — ' + dir);
    }
    return true;
  } catch (e) {
    logger.warn('partition: ensurePartitionDir failed: ' + e.message);
    return false;
  }
}

module.exports = {
  setLowSpecMode: setLowSpecMode,
  shouldUseShadow: shouldUseShadow,
  getPartitionName: getPartitionName,
  snapshotCookies: snapshotCookies,
  restoreCookies: restoreCookies,
  removeSnapshot: removeSnapshot,
  ensurePartitionDir: ensurePartitionDir,
  AUTH_DOMAINS: AUTH_DOMAINS
};
