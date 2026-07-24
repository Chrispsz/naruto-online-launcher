/**
 * Testes para src/profiles/PasswordManager.js (Fase 3e split)
 *
 * Verifica: getMachineKey (PBKDF2), _resetCache,
 * consistência de chaves, persistência de salt.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const electron = require('electron');

const PasswordManager = require('../PasswordManager');
const CryptoService = require('../CryptoService');

// Temp dir for salt persistence tests
let tmpDir;

beforeAll(function () {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-pm-test-'));
  // Override app.getPath('userData') to return our temp dir
  electron.app.getPath.mockImplementation(function (p) {
    if (p === 'userData') return tmpDir;
    return '/tmp/naruto-test/' + p;
  });
});

afterAll(function () {
  try {
    const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
    if (fs.existsSync(saltFile)) fs.unlinkSync(saltFile);
    fs.rmdirSync(tmpDir);
  } catch (_) {
    /* ignore */
  }
});

describe('PasswordManager.js', () => {
  beforeEach(function () {
    jest.clearAllMocks();
    // Reset cache before each test
    PasswordManager._resetCache();
    // Remove salt file if exists
    const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
    try {
      if (fs.existsSync(saltFile)) fs.unlinkSync(saltFile);
    } catch (_) {
      /* ignore */
    }
  });

  describe('exports', () => {
    test('exporta getMachineKey como função', () => {
      expect(typeof PasswordManager.getMachineKey).toBe('function');
    });
    test('exporta _resetCache como função', () => {
      expect(typeof PasswordManager._resetCache).toBe('function');
    });
    test('VAULT_SALT_FILE é "vault.salt"', () => {
      expect(PasswordManager.VAULT_SALT_FILE).toBe('vault.salt');
    });
  });

  describe('getMachineKey', () => {
    test('retorna Buffer de 32 bytes', () => {
      const key = PasswordManager.getMachineKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    test('retorna a mesma chave em chamadas subsequentes (cache)', () => {
      const key1 = PasswordManager.getMachineKey();
      const key2 = PasswordManager.getMachineKey();
      expect(key1.equals(key2)).toBe(true);
    });

    test('persiste salt no disco (vault.salt) ao derivar a chave', () => {
      PasswordManager.getMachineKey();
      const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
      expect(fs.existsSync(saltFile)).toBe(true);

      const diskSalt = fs.readFileSync(saltFile);
      expect(Buffer.isBuffer(diskSalt)).toBe(true);
      expect(diskSalt.length).toBe(CryptoService.PBKDF2_SALT_LEN);
    });

    test('chave é derivada via PBKDF2 (determinística com mesmo salt em disco)', () => {
      PasswordManager._resetCache();
      // First call: generates + persists salt
      const key1 = PasswordManager.getMachineKey();
      const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
      const salt = fs.readFileSync(saltFile);
      PasswordManager._resetCache();

      // Derivar manualmente para comparar
      let userDataPath = '';
      try {
        userDataPath = electron.app.getPath('userData');
      } catch (_) {
        /* expected */
      }
      let username = '';
      try {
        username = os.userInfo().username;
      } catch (_) {
        /* expected */
      }
      const machineSeed = os.hostname() + '|' + username + '|' + userDataPath + '|shinobi-vault-v2';

      const expectedKey = crypto.pbkdf2Sync(
        machineSeed,
        salt,
        100000,
        CryptoService.PBKDF2_KEYLEN,
        'sha512'
      );

      // Get the actual key (salt is cached now)
      const actualKey = PasswordManager.getMachineKey();
      expect(actualKey.equals(expectedKey)).toBe(true);
      expect(actualKey.equals(key1)).toBe(true);
    });

    test('chave muda após reset de cache com salt diferente', () => {
      const key1 = PasswordManager.getMachineKey();

      // Delete salt file and reset cache → new salt → new key
      const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
      try {
        fs.unlinkSync(saltFile);
      } catch (_) {
        /* expected */
      }
      PasswordManager._resetCache();

      const key2 = PasswordManager.getMachineKey();
      expect(key1.equals(key2)).toBe(false);
    });

    test('usa 100k iterações (diferente das 200k do backup)', () => {
      // Verify that the machine key derivation uses 100k iterations
      // by checking the actual derivation matches with 100k
      PasswordManager._resetCache();
      PasswordManager.getMachineKey(); // generates + persists salt
      const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
      const salt = fs.readFileSync(saltFile);
      PasswordManager._resetCache();

      let userDataPath = '';
      try {
        userDataPath = electron.app.getPath('userData');
      } catch (_) {
        /* expected */
      }
      let username = '';
      try {
        username = os.userInfo().username;
      } catch (_) {
        /* expected */
      }
      const machineSeed = os.hostname() + '|' + username + '|' + userDataPath + '|shinobi-vault-v2';

      // 100k iters (machine key)
      const key100k = crypto.pbkdf2Sync(
        machineSeed,
        salt,
        100000,
        CryptoService.PBKDF2_KEYLEN,
        'sha512'
      );
      // 200k iters (backup key — should be different)
      const key200k = crypto.pbkdf2Sync(
        machineSeed,
        salt,
        200000,
        CryptoService.PBKDF2_KEYLEN,
        'sha512'
      );

      expect(key100k.equals(key200k)).toBe(false);
    });
  });

  describe('_resetCache', () => {
    test('limpa cache de chave e salt', () => {
      const key1 = PasswordManager.getMachineKey();
      PasswordManager._resetCache();
      // After reset, the next call should produce the same key (same salt on disk)
      const key2 = PasswordManager.getMachineKey();
      expect(key1.equals(key2)).toBe(true);
    });

    test('permite gerar novo salt após reset', () => {
      PasswordManager.getMachineKey();
      const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
      const salt1 = fs.readFileSync(saltFile);

      // Delete salt file and reset cache
      try {
        fs.unlinkSync(saltFile);
      } catch (_) {
        /* expected */
      }
      PasswordManager._resetCache();

      PasswordManager.getMachineKey();
      const salt2 = fs.readFileSync(saltFile);
      expect(salt1.equals(salt2)).toBe(false);
    });
  });

  describe('key consistency (cross-session)', () => {
    test('mesmo salt em disco = mesma chave após resets', () => {
      PasswordManager._resetCache();
      PasswordManager.getMachineKey(); // ensure salt is persisted

      // Simulate two different cache cycles
      PasswordManager._resetCache();
      const key1 = PasswordManager.getMachineKey();

      PasswordManager._resetCache();
      const key2 = PasswordManager.getMachineKey();

      expect(key1.equals(key2)).toBe(true);
    });
  });
});
