/**
 * profiles/partition.js — Shadow Partition manager (RAM saver disruptivo)
 * v3.0.0 — INOVAÇÃO DISRUPTIVA
 *
 * PROBLEMA QUE RESOLVE:
 *   Cada profile com `persist:profile-<id>` grava ~30-80MB em disco e mantém
 *   cache/localStorage/indexedDB carregados em RAM. Em um PC de 2-4GB com 4
 *   contas, isso é 120-320MB SÓ de partitions — inviável.
 *
 * SOLUÇÃO — SHADOW PARTITIONS:
 *   Em vez de `persist:` (grava em disco), usar `partition:profile-<id>`
 *   (EPHEMERAL — só existe em RAM enquanto a janela está aberta; wiped on close).
 *   No fechamento, tira um SNAPSHOT apenas dos cookies de autenticação do
 *   domínio do jogo (típicos 2-5KB) e salva em cookie-snapshots.json.
 *   Na próxima abertura, restaura os cookies antes de carregar a página.
 *
 *   Resultado: mesmo multi-conta em PC low-spec não acumula 300MB de partitions.
 *   O custo é re-download de assets estáticos (mitigado pelo disk-cache-size
 *   global compartilhado na default session).
 *
 * POLÍTICA:
 *   - Modo Low-Spec (RAM <4GB) ou forceLowSpec → shadow ATIVO para todos os perfis.
 *   - Modo normal → persist (comportamento padrão, backwards-compatible).
 *   - Profile pode forçar shadow via profile.shadow=true (power-user opt-in).
 *
 * ISOLAMENTO:
 *   Shadow partitions continuam 100% isoladas entre si pelo Chromium
 *   (cada `partition:name` é um sandbox de session/cookies/storage separado).
 *   A diferença é apenas persistência em disco.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { app, session } = require('electron');
const logger = require('../utils/logger');

const SNAPSHOTS_FILE = 'cookie-snapshots.json';
const MAX_SNAPSHOTS_BYTES = 512 * 1024; // 512KB sane limit

// Domínios do jogo cujos cookies são preservados no snapshot
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
 * Decide se um perfil deve usar shadow (ephemeral) partition.
 * @param {Object|null} profile - profile object (may have .shadow override)
 * @returns {boolean}
 */
function shouldUseShadow(profile) {
  if (profile && profile.shadow === true) return true;
  if (_lowSpecMode) return true;
  return false;
}

/**
 * Retorna o nome da partition para um perfil.
 * `persist:profile-<id>` (durável) ou `partition:profile-<id>` (ephemeral).
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
 * Filtra cookies para manter apenas os de domínios de autenticação do jogo.
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
    logger.info('partition: snapshot de ' + authCookies.length + ' cookies para ' + profileId);
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
 * Necessário para que bunshin/clone de um perfil recém-criado não falhe com
 * "user-data-dir do origem não existe" (o Chromium só cria o dir no primeiro
 * launch — sem isso, operações que dependem do dir antes do primeiro launch
 * quebram).
 *
 * Em shadow mode (partition:profile-<id>), a partition é ephemeral e NÃO tem
 * dir em disco — este método é no-op.
 *
 * @param {Object|string} profile - profile object ou id
 * @returns {boolean} true se criou ou já existia
 */
function ensurePartitionDir(profile) {
  // Shadow partitions não persistem em disco — nada a fazer.
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
