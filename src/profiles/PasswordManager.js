/**
 * profiles/PasswordManager.js — Chave de máquina + senha mestre (Fase 3e split)
 *
 * Responsabilidade ÚNICA (SRP): derivar e cachear a chave simétrica usada pelo
 * CryptoService para criptografar credenciais em repouso. A chave é derivada de
 * um identificador de máquina (hostname + username + userDataPath) + salt
 * aleatório persistido, via PBKDF2.
 *
 * Modelo de ameaça: protege contra leitura offline do vault.json em outra
 * máquina/usuário. NÃO protege contra attacker com acesso ao processo rodando.
 *
 * Histórico: era parte do God Object vault.js. Split: este módulo cuida só de
 * chaves; CryptoService cuida das primitivas; ProfileVault cuida do CRUD.
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
 * Carrega (ou gera+persiste) o salt aleatório de 32 bytes único por instalação.
 * @returns {Buffer}
 */
function getSalt() {
  if (_cachedSalt) return _cachedSalt;
  const saltPath = _getSaltPath();
  try {
    if (fs.existsSync(saltPath)) {
      _cachedSalt = fs.readFileSync(saltPath);
    } else {
      _cachedSalt = crypto.randomBytes(CryptoService.PBKDF2_SALT_LEN);
      fs.writeFileSync(saltPath, _cachedSalt);
      logger.info('PasswordManager: salt aleatório gerado e persistido');
    }
  } catch (e) {
    logger.error('PasswordManager: erro ao carregar salt: ' + e.message);
    _cachedSalt = crypto.randomBytes(CryptoService.PBKDF2_SALT_LEN); // fallback in-memory
  }
  return _cachedSalt;
}

/**
 * Deriva a chave de máquina (PBKDF2-SHA512, 100k iters).
 * Cacheada em memória após primeira chamada.
 * @returns {Buffer} chave de 32 bytes
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
  const salt = getSalt();
  // 100k iters para a chave de máquina (diferente das 200k do backup c/ senha)
  _cachedKey = crypto.pbkdf2Sync(machineSeed, salt, 100000, CryptoService.PBKDF2_KEYLEN, 'sha512');
  return _cachedKey;
}

/**
 * Deriva chave a partir de uma senha mestre digitada (para backup export/import).
 * Delega ao CryptoService.deriveKey (200k iters).
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Buffer}
 */
function deriveMasterKey(password, salt) {
  return CryptoService.deriveKey(password, salt);
}

/**
 * Limpa os caches (p/ testes).
 */
function _resetCache() {
  _cachedKey = null;
  _cachedSalt = null;
}

module.exports = {
  getSalt: getSalt,
  getMachineKey: getMachineKey,
  deriveMasterKey: deriveMasterKey,
  _resetCache: _resetCache,
  VAULT_SALT_FILE: VAULT_SALT_FILE
};
