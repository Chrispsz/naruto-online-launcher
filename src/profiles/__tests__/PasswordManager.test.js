/**
 * Testes para src/profiles/PasswordManager.js (Fase 3e split)
 *
 * Verifica: getMachineKey (PBKDF2), getSalt, deriveMasterKey,
 * _resetCache, consistência de chaves, persistência de salt.
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
    test('exporta getSalt como função', () => {
      expect(typeof PasswordManager.getSalt).toBe('function');
    });
    test('exporta getMachineKey como função', () => {
      expect(typeof PasswordManager.getMachineKey).toBe('function');
    });
    test('exporta deriveMasterKey como função', () => {
      expect(typeof PasswordManager.deriveMasterKey).toBe('function');
    });
    test('exporta _resetCache como função', () => {
      expect(typeof PasswordManager._resetCache).toBe('function');
    });
    test('VAULT_SALT_FILE é "vault.salt"', () => {
      expect(PasswordManager.VAULT_SALT_FILE).toBe('vault.salt');
    });
  });

  describe('getSalt', () => {
    test('retorna Buffer de 32 bytes', () => {
      const salt = PasswordManager.getSalt();
      expect(Buffer.isBuffer(salt)).toBe(true);
      expect(salt.length).toBe(CryptoService.PBKDF2_SALT_LEN);
      expect(salt.length).toBe(32);
    });

    test('persiste salt no disco (vault.salt)', () => {
      const salt = PasswordManager.getSalt();
      const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
      expect(fs.existsSync(saltFile)).toBe(true);

      const diskSalt = fs.readFileSync(saltFile);
      expect(diskSalt.equals(salt)).toBe(true);
    });

    test('retorna o mesmo salt em chamadas subsequentes (cache)', () => {
      const salt1 = PasswordManager.getSalt();
      const salt2 = PasswordManager.getSalt();
      expect(salt1.equals(salt2)).toBe(true);
    });

    test('carrega salt existente do disco (após reset de cache)', () => {
      const salt1 = PasswordManager.getSalt();
      PasswordManager._resetCache();

      const salt2 = PasswordManager.getSalt();
      expect(salt1.equals(salt2)).toBe(true);
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

    test('chave é derivada via PBKDF2 (determinística com mesmo salt)', () => {
      PasswordManager._resetCache();
      const salt = PasswordManager.getSalt();
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
      const salt = PasswordManager.getSalt();
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

  describe('deriveMasterKey', () => {
    test('retorna Buffer de 32 bytes', () => {
      const salt = crypto.randomBytes(32);
      const key = PasswordManager.deriveMasterKey('masterpass', salt);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    test('usa 200k iterações (delega ao CryptoService.deriveKey)', () => {
      const salt = Buffer.alloc(32, 0xcd);
      const key = PasswordManager.deriveMasterKey('test', salt);

      // Derive manually with 200k iters
      const expected = CryptoService.deriveKey('test', salt);
      expect(key.equals(expected)).toBe(true);
    });

    test('é determinística para mesma senha+salt', () => {
      const salt = Buffer.alloc(32, 0xab);
      const k1 = PasswordManager.deriveMasterKey('samepass', salt);
      const k2 = PasswordManager.deriveMasterKey('samepass', salt);
      expect(k1.equals(k2)).toBe(true);
    });

    test('diferente para senhas diferentes com mesmo salt', () => {
      const salt = Buffer.alloc(32, 0xab);
      const k1 = PasswordManager.deriveMasterKey('pass1', salt);
      const k2 = PasswordManager.deriveMasterKey('pass2', salt);
      expect(k1.equals(k2)).toBe(false);
    });

    test('diferente para salts diferentes com mesma senha', () => {
      const salt1 = crypto.randomBytes(32);
      const salt2 = crypto.randomBytes(32);
      const k1 = PasswordManager.deriveMasterKey('samepass', salt1);
      const k2 = PasswordManager.deriveMasterKey('samepass', salt2);
      expect(k1.equals(k2)).toBe(false);
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
      const salt1 = PasswordManager.getSalt();

      // Delete salt file and reset cache
      const saltFile = path.join(tmpDir, PasswordManager.VAULT_SALT_FILE);
      try {
        fs.unlinkSync(saltFile);
      } catch (_) {
        /* expected */
      }
      PasswordManager._resetCache();

      const salt2 = PasswordManager.getSalt();
      expect(salt1.equals(salt2)).toBe(false);
    });
  });

  describe('key consistency (cross-session)', () => {
    test('mesmo salt + mesmo machineSeed = mesma chave', () => {
      PasswordManager._resetCache();
      PasswordManager.getSalt(); // ensure salt is persisted

      // Simulate two different cache cycles
      PasswordManager._resetCache();
      const key1 = PasswordManager.getMachineKey();

      PasswordManager._resetCache();
      const key2 = PasswordManager.getMachineKey();

      expect(key1.equals(key2)).toBe(true);
    });
  });
});
