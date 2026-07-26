/**
 * profiles/PasswordManager.js — Machine key + master password (Phase 3e split)
 *
 * Single Responsibility (SRP): derive and cache the symmetric key used by
 * CryptoService to encrypt credentials at rest. The key is derived from
 * a machine identifier (hostname + username + userDataPath) + salt
 * random persisted salt, via PBKDF2.
 *
 * Threat model: protects against offline reading of vault.json on another
 * machine/user. Does NOT protect against an attacker with access to the running process.
 *
 * History: was part of the God Object vault.js. Split: this module handles only
 * keys; CryptoService handles the primitives; ProfileVault handles the CRUD.
 */

'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('../utils/logger');
const CryptoService = require('./CryptoService');

const VAULT_SALT_FILE = 'vault.salt';

let _cachedKey = null;
let _cachedSalt = null;

function _getSaltPath() {
  return path.join(app.getPath('userData'), VAULT_SALT_FILE);
}

/**
 * Loads (or generates+persists) the random 32-byte salt unique per installation.
 * Internal helper of getMachineKey (not exported).
 * @returns {Buffer}
 */
function _loadSalt() {
  if (_cachedSalt) return _cachedSalt;
  const saltPath = _getSaltPath();
  try {
    if (fs.existsSync(saltPath)) {
      _cachedSalt = fs.readFileSync(saltPath);
    } else {
      _cachedSalt = crypto.randomBytes(CryptoService.PBKDF2_SALT_LEN);
      fs.writeFileSync(saltPath, _cachedSalt);
      logger.info('PasswordManager: random salt generated and persisted');
    }
  } catch (e) {
    logger.error('PasswordManager: failed to load salt: ' + e.message);
    _cachedSalt = crypto.randomBytes(CryptoService.PBKDF2_SALT_LEN); // fallback in-memory
  }
  return _cachedSalt;
}

/**
 * Derives the machine key (PBKDF2-SHA512, 100k iters). Cached in memory.
 * @security Machine-bound (hostname+username+userDataPath+32-byte salt). Key is
 *   cached in memory ONLY — NEVER written to disk. Stolen vault.json+salt is
 *   useless on another machine. 100k iters acceptable (seed is unguessable).
 * @returns {Buffer} 32-byte key
 */
function getMachineKey() {
  if (_cachedKey) return _cachedKey;
  let userDataPath = '';
  try {
    userDataPath = app.getPath('userData');
  } catch (_) {
    /* before ready */
  }
  let username = '';
  try {
    username = os.userInfo().username;
  } catch (_) {
    /* ignore */
  }
  const machineSeed = os.hostname() + '|' + username + '|' + userDataPath + '|shinobi-vault-v2';
  const salt = _loadSalt();
  // 100k iters for machine key (different from backup's 200k with password)
  _cachedKey = crypto.pbkdf2Sync(machineSeed, salt, 100000, CryptoService.PBKDF2_KEYLEN, 'sha512');
  return _cachedKey;
}

module.exports = {
  getMachineKey: getMachineKey
};
