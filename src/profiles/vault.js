/**
 * profiles/vault.js — FACADE (Fase 3e split)
 *
 * Was the God Object (571 lines). Now it's a thin facade that composes:
 *   - CryptoService.js   — pure AES-256-GCM + PBKDF2 primitives
 *   - PasswordManager.js — machine key + master password (cache)
 *   - ProfileVault.js    — CRUD of credentials + buildAutoLoginScript
 *
 * The facade preserves the historical public API (setCredentials/getCredentials/
 * hasCredentials/removeCredentials/buildAutoLoginScript/encrypt/decrypt/onChange/
 * exportEncryptedBackup/importEncryptedBackup) so that controller.js,
 * game-launcher.js, manager.js and main.js don't need to change.
 *
 * For new code, prefer importing the 3 modules directly.
 */

'use strict';

const CryptoService = require('./CryptoService');
const PasswordManager = require('./PasswordManager');
const ProfileVault = require('./ProfileVault');

// facade encrypt/decrypt use the machine key (compatible with old vault.encrypt)
function encrypt(plaintext) {
  return CryptoService.encrypt(plaintext, PasswordManager.getMachineKey());
}

function decrypt(payload) {
  return CryptoService.decrypt(payload, PasswordManager.getMachineKey());
}

module.exports = {
  // ProfileVault (CRUD + auto-login)
  setCredentials: ProfileVault.setCredentials,
  getCredentials: ProfileVault.getCredentials,
  hasCredentials: ProfileVault.hasCredentials,
  removeCredentials: ProfileVault.removeCredentials,
  buildAutoLoginScript: ProfileVault.buildAutoLoginScript,
  onChange: ProfileVault.onChange,
  // CryptoService (primitives + backup) — encrypt/decrypt wrapped to use machine key
  encrypt: encrypt,
  decrypt: decrypt,
  exportEncryptedBackup: CryptoService.exportEncryptedBackup,
  importEncryptedBackup: CryptoService.importEncryptedBackup
};
