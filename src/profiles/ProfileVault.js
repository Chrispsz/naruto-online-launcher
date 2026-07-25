/**
 * profiles/ProfileVault.js — CRUD of credentials + auto-login script (Phase 3e split)
 *
 * Single Responsibility (SRP): persist encrypted credentials (user/pass)
 * in vault.json and generate the auto-login script injected into the game. Delegates to
 * cryptography to CryptoService and key derivation to PasswordManager.
 *
 * History: was part of the God Object vault.js (571 lines). Split into 3:
 *   - CryptoService.js   — pure crypto primitives
 *   - PasswordManager.js — machine key + master password
 *   - ProfileVault.js    (este) — CRUD + buildAutoLoginScript
 *
 * vault.js remains as facade re-exporting the 3 modules (API preserved).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('../utils/logger');
const CryptoService = require('./CryptoService');
const PasswordManager = require('./PasswordManager');

const VAULT_FILE = 'vault.json';
const MAX_VAULT_BYTES = 256 * 1024; // 256KB sane limit

// In-memory cache: profileId -> { user, pass (encrypted), updatedAt }
let _store = null;
let _listeners = [];

function _getVaultPath() {
  return path.join(app.getPath('userData'), VAULT_FILE);
}

/**
 * Encrypt with the machine key (convenience over CryptoService.encrypt).
 * @param {string} plaintext
 * @returns {string}
 */
function _encryptWithMachineKey(plaintext) {
  try {
    return CryptoService.encrypt(plaintext, PasswordManager.getMachineKey());
  } catch (e) {
    logger.error('ProfileVault: encrypt failed: ' + e.message);
    return '';
  }
}

/**
 * Decrypt with the machine key.
 * @param {string} payload
 * @returns {string}
 */
function _decryptWithMachineKey(payload) {
  try {
    return CryptoService.decrypt(payload, PasswordManager.getMachineKey());
  } catch (e) {
    logger.debug('ProfileVault: decrypt failed (tag mismatch or key changed)');
    return null;
  }
}

/**
 * Lazily loads the vault from disk into memory cache.
 * No-op if already loaded.
 */
function _ensureLoaded() {
  if (_store !== null) return;
  const file = _getVaultPath();
  try {
    if (fs.existsSync(file)) {
      const stat = fs.statSync(file);
      if (stat.size > MAX_VAULT_BYTES) throw new Error('oversized');
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      _store = parsed && typeof parsed === 'object' ? parsed : {};
    } else {
      _store = {};
    }
  } catch (e) {
    logger.error('ProfileVault: failed to read vault.json: ' + e.message + ' — starting empty');
    _store = {};
  }
}

/**
 * Persists the in-memory vault to disk (atomic write via tmp+rename).
 * @returns {boolean} true if saved successfully
 */
function _persist() {
  _ensureLoaded();
  const file = _getVaultPath();
  const tmp = file + '.tmp';
  try {
    const json = JSON.stringify(_store, null, 2);
    if (Buffer.byteLength(json, 'utf8') > MAX_VAULT_BYTES) {
      logger.error('ProfileVault: refusing to save — exceeds 256KB');
      return false;
    }
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
    _listeners.forEach(function (cb) {
      try {
        cb();
      } catch (_) {
        /* ignore */
      }
    });
    return true;
  } catch (e) {
    logger.error('ProfileVault: failed to save: ' + e.message);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
    return false;
  }
}

/**
 * Save credentials for a profile (encrypted at rest).
 * @security AES-256-GCM via machine key; vault.json holds only ciphertext.
 *   Atomic write (tmp+rename). Vault capped at MAX_VAULT_BYTES (256KB).
 * @param {string} profileId
 * @param {string} user
 * @param {string} pass
 * @returns {boolean}
 */
function setCredentials(profileId, user, pass) {
  _ensureLoaded();
  _store[profileId] = {
    user: _encryptWithMachineKey(user || ''),
    pass: _encryptWithMachineKey(pass || ''),
    updatedAt: Date.now()
  };
  logger.info('ProfileVault: credentials saved for ' + profileId);
  return _persist();
}

/**
 * Get decrypted credentials for a profile.
 * @param {string} profileId
 * @returns {{user: string, pass: string}|null}
 */
function getCredentials(profileId) {
  _ensureLoaded();
  const entry = _store[profileId];
  if (!entry) return null;
  const user = _decryptWithMachineKey(entry.user);
  const pass = _decryptWithMachineKey(entry.pass);
  // If decrypt fails (key changed, tampered vault), return null to skip auto-login
  if (user === null || pass === null) return null;
  return { user: user, pass: pass };
}

/**
 * Check if a profile has stored credentials.
 * @param {string} profileId
 * @returns {boolean}
 */
function hasCredentials(profileId) {
  _ensureLoaded();
  return !!_store[profileId];
}

/**
 * Remove credentials for a profile.
 * @param {string} profileId
 * @returns {boolean}
 */
function removeCredentials(profileId) {
  _ensureLoaded();
  if (!_store[profileId]) return false;
  delete _store[profileId];
  logger.info('ProfileVault: credentials removed for ' + profileId);
  return _persist();
}

/**
 * The JS injected into the game page to auto-fill the login form.
 *
 * Simplified from 80 lines to ~30. Removed dead verification block
 * (URL-change check + error-element lookup — never surfaced to the user),
 * removed delayed-retry branch (MutationObserver + polling already cover
 * async form loading), removed "clicked" return distinction (UI treats both
 * the same). The 3 Oasis form selectors + React-style value setter + 2 login
 * hooks (hd_ajax_login / ajax_login) + button fallback are kept because
 * they're genuinely needed for the 3 page designs Oasis ships.
 *
 * Flow: try once → if form not found, watch DOM mutations + poll every 250ms
 * for up to 15s → return status string to the main process for logging.
 *
 * @param {string} user
 * @param {string} pass
 * @returns {string} executable JS string
 */
function buildAutoLoginScript(user, pass) {
  const u = JSON.stringify(String(user));
  const p = JSON.stringify(String(pass));
  return (
    '(function(){try{' +
    'var u=' + u + ',p=' + p + ',attempts=0,maxAttempts=60;' +
    // React/Vue-style value setter — setting .value directly doesn't trigger
    // the framework's onChange handler, so the form would submit empty.
    'function setVal(el,v){try{' +
    '  var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");' +
    '  (d&&d.set||function(v){this.value=v;}).call(el,v);' +
    '  el.dispatchEvent(new Event("input",{bubbles:true}));' +
    '  el.dispatchEvent(new Event("change",{bubbles:true}));' +
    '}catch(e){el.value=v;}}' +
    'function doLogin(){try{' +
    '  var uE=document.querySelectorAll("input[name=oasun],input[name=hd_oasun],input[name=user_email],input#user_email");' +
    '  var pE=document.querySelectorAll("input[name=oaspd],input[name=hd_oaspd],input[name=user_password],input#user_password");' +
    '  if(!uE.length||!pE.length)return "not-found";' +
    '  for(var i=0;i<uE.length;i++)setVal(uE[i],u);' +
    '  for(var j=0;j<pE.length;j++)setVal(pE[j],p);' +
    '  document.querySelectorAll("#checkbox,#hd_checkbox,#checkbox_pwd,#checked_pwd").forEach(function(c){c.checked=true;});' +
    '  if(typeof window.hd_ajax_login==="function"){window.hd_ajax_login();return "filled";}' +
    '  if(typeof window.ajax_login==="function"){window.ajax_login();return "filled";}' +
    '  var b=document.querySelector("a.hd_login_btn,a.login_btn,.login_btn,a[class*=login_btn]");' +
    '  if(b){b.click();return "filled";}' +
    '  return "filled";' +
    '}catch(e){return "not-found";}}' +
    'var r=doLogin();' +
    'if(r!=="not-found")return r;' +
    // Form not in DOM yet (Oasis loads it async) — watch + poll.
    'new MutationObserver(function(_,o){if(doLogin()!=="not-found")o.disconnect();else if(++attempts>=maxAttempts)o.disconnect();})' +
    '.observe(document.documentElement,{childList:true,subtree:true});' +
    'var poll=setInterval(function(){if(doLogin()!=="not-found"||++attempts>=maxAttempts)clearInterval(poll);},250);' +
    'return "waiting";' +
    '}catch(e){return "error:"+e.message;}})()'
  );
}

/**
 * Register a callback invoked after the vault is persisted.
 * @param {Function} cb - callback (no arguments)
 */
function onChange(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

module.exports = {
  setCredentials: setCredentials,
  getCredentials: getCredentials,
  hasCredentials: hasCredentials,
  removeCredentials: removeCredentials,
  buildAutoLoginScript: buildAutoLoginScript,
  onChange: onChange,
  // exposed for tests
  _getVaultPath: _getVaultPath,
  MAX_VAULT_BYTES: MAX_VAULT_BYTES
};
