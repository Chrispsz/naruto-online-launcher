/**
 * profiles/vault.js — FACADE (Fase 3e split)
 *
 * Era o God Object (571 linhas). Agora é uma facade fina que compõe:
 *   - CryptoService.js   — primitivas AES-256-GCM + PBKDF2 puras
 *   - PasswordManager.js — chave de máquina + senha mestre (cache)
 *   - ProfileVault.js    — CRUD de credenciais + buildAutoLoginScript
 *
 * A facade preserva a API pública histórica (setCredentials/getCredentials/
 * hasCredentials/removeCredentials/buildAutoLoginScript/encrypt/decrypt/onChange/
 * exportEncryptedBackup/importEncryptedBackup) para que controller.js,
 * game-launcher.js, manager.js e main.js não precisem mudar.
 *
 * Para código novo, prefira importar os 3 módulos diretamente.
 */

'use strict';

const CryptoService = require('./CryptoService');
const PasswordManager = require('./PasswordManager');
const ProfileVault = require('./ProfileVault');

// encrypt/decrypt do facade usam a chave de máquina (compat com vault.encrypt antigo)
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
  // CryptoService (primitivas + backup) — encrypt/decrypt wrapped p/ usar machine key
  encrypt: encrypt,
  decrypt: decrypt,
  exportEncryptedBackup: CryptoService.exportEncryptedBackup,
  importEncryptedBackup: CryptoService.importEncryptedBackup
};
