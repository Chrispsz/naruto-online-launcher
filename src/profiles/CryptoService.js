/**
 * profiles/CryptoService.js — Primitivas de criptografia PURAS (Fase 3e split)
 *
 * Responsabilidade ÚNICA (SRP): AES-256-GCM + PBKDF2-SHA512. Nenhuma
 * dependência de Electron, disco, ou estado de máquina. Tudo é função pura
 * que recebe a chave/salt como parâmetro.
 *
 * Histórico: era parte do God Object vault.js (571 linhas). Split em 3:
 *   - CryptoService.js   (este) — primitivas cripto puras
 *   - PasswordManager.js — derivação/cache da chave de máquina + senha mestre
 *   - ProfileVault.js    — CRUD de credenciais + buildAutoLoginScript
 */

'use strict';

const crypto = require('crypto');

// ── KDF + cipher constants ───────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 200000;
const PBKDF2_KEYLEN = 32; // 256 bits = AES-256
const PBKDF2_SALT_LEN = 32;
const GCM_IV_LEN = 12;
const BACKUP_VERSION = 1;

/**
 * Deriva chave AES-256 a partir de senha usando PBKDF2-SHA512.
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Buffer} chave de 32 bytes
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha512');
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * @param {string} plaintext
 * @param {Buffer} key - 32-byte key
 * @returns {string} base64(iv || ct || tag)
 */
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

/**
 * Decrypt a base64 payload produced by encrypt().
 * @param {string} payload
 * @param {Buffer} key - 32-byte key
 * @returns {string} plaintext, or '' on failure
 */
function decrypt(payload, key) {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < GCM_IV_LEN + 16) return '';
  const iv = buf.slice(0, GCM_IV_LEN);
  const tag = buf.slice(buf.length - 16);
  const ct = buf.slice(GCM_IV_LEN, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * Exporta perfis + credenciais em arquivo criptografado com senha mestre.
 * @param {Array} profiles
 * @param {Object} credentialsMap - { profileId: { user, pass } }
 * @param {string} password - senha mestre
 * @returns {string} base64 do envelope criptografado
 */
function exportEncryptedBackup(profiles, credentialsMap, password) {
  if (!password || String(password).length < 8) {
    throw new Error('Master password must be at least 8 characters');
  }
  if (!Array.isArray(profiles)) {
    throw new Error('Invalid profile list');
  }

  const payload = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    profiles: profiles,
    credentials: credentialsMap || {}
  };

  const plaintext = JSON.stringify(payload);
  const salt = crypto.randomBytes(PBKDF2_SALT_LEN);
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    version: BACKUP_VERSION,
    kdf: {
      algorithm: 'pbkdf2',
      hash: 'sha512',
      iterations: PBKDF2_ITERATIONS,
      keyLength: PBKDF2_KEYLEN
    },
    cipher: {
      algorithm: 'aes-256-gcm',
      ivLength: GCM_IV_LEN
    },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64')
  };

  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

/**
 * Importa arquivo criptografado com senha mestre.
 * @param {string} encryptedBase64
 * @param {string} password
 * @returns {{profiles:Array, credentials:Object, exportedAt:number}}
 * @throws {Error} se senha incorreta, arquivo corrompido, ou versão incompatível
 */
function importEncryptedBackup(encryptedBase64, password) {
  if (!encryptedBase64 || !password) {
    throw new Error('File and password are required');
  }

  let envelope;
  try {
    const envelopeJson = Buffer.from(encryptedBase64, 'base64').toString('utf8');
    envelope = JSON.parse(envelopeJson);
  } catch (e) {
    throw new Error('Invalid or corrupted backup file');
  }

  if (!envelope || envelope.version !== BACKUP_VERSION) {
    throw new Error('Incompatible backup version (expected ' + BACKUP_VERSION + ')');
  }

  let salt, iv, ct, tag;
  try {
    salt = Buffer.from(envelope.salt, 'base64');
    iv = Buffer.from(envelope.iv, 'base64');
    ct = Buffer.from(envelope.ct, 'base64');
    tag = Buffer.from(envelope.tag, 'base64');
  } catch (e) {
    throw new Error('Invalid backup file structure');
  }

  if (salt.length !== PBKDF2_SALT_LEN) {
    throw new Error('Invalid salt (' + salt.length + ' bytes, expected ' + PBKDF2_SALT_LEN + ')');
  }
  if (iv.length !== GCM_IV_LEN) {
    throw new Error('Invalid IV (' + iv.length + ' bytes, expected ' + GCM_IV_LEN + ')');
  }

  const key = deriveKey(password, salt);

  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    throw new Error('Incorrect password or corrupted file');
  }

  let payload;
  try {
    payload = JSON.parse(plaintext);
  } catch (e) {
    throw new Error('Invalid decrypted content');
  }

  if (!Array.isArray(payload.profiles)) {
    throw new Error('Invalid backup schema: profiles is not an array');
  }

  // Validate credentials is a non-null object when present
  if (payload.credentials !== undefined && payload.credentials !== null) {
    if (typeof payload.credentials !== 'object' || Array.isArray(payload.credentials)) {
      throw new Error('Invalid backup schema: credentials is not an object');
    }
  }

  return payload;
}

module.exports = {
  deriveKey: deriveKey,
  encrypt: encrypt,
  decrypt: decrypt,
  exportEncryptedBackup: exportEncryptedBackup,
  importEncryptedBackup: importEncryptedBackup,
  // constants (p/ testes / documentação)
  PBKDF2_ITERATIONS: PBKDF2_ITERATIONS,
  PBKDF2_KEYLEN: PBKDF2_KEYLEN,
  PBKDF2_SALT_LEN: PBKDF2_SALT_LEN,
  GCM_IV_LEN: GCM_IV_LEN,
  BACKUP_VERSION: BACKUP_VERSION
};
