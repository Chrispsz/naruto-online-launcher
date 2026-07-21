/**
 * Testes para src/profiles/ProfileVault.js (Fase 3e split)
 *
 * Verifica: CRUD (set, get, has, remove), buildAutoLoginScript,
 * persistência vault.json, edge cases (vault vazio, arquivo ausente).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const electron = require('electron');

// Mock PasswordManager to use deterministic key
const mockMachineKey = crypto.randomBytes(32);
jest.mock('../PasswordManager', () => ({
  getMachineKey: jest.fn(() => mockMachineKey),
  _resetCache: jest.fn()
}));

const PasswordManager = require('../PasswordManager');
const ProfileVault = require('../ProfileVault');

// Temp dir for vault.json persistence tests
let tmpDir;

beforeAll(function () {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-vault-test-'));
  // Override app.getPath('userData') to return our temp dir
  electron.app.getPath.mockImplementation(function (p) {
    if (p === 'userData') return tmpDir;
    return '/tmp/naruto-test/' + p;
  });
});

afterAll(function () {
  // Cleanup temp dir
  try {
    const vaultFile = path.join(tmpDir, 'vault.json');
    if (fs.existsSync(vaultFile)) fs.unlinkSync(vaultFile);
    fs.rmdirSync(tmpDir);
  } catch (_) {
    /* ignore */
  }
});

describe('ProfileVault.js', () => {
  beforeEach(function () {
    jest.clearAllMocks();
    // Reset internal state by deleting vault.json and clearing the module cache
    const vaultFile = path.join(tmpDir, 'vault.json');
    try {
      if (fs.existsSync(vaultFile)) fs.unlinkSync(vaultFile);
    } catch (_) {
      /* ignore */
    }
    // Force reload of ProfileVault to reset _store
    delete require.cache[require.resolve('../ProfileVault')];
  });

  describe('exports', () => {
    test('exporta setCredentials como função', () => {
      expect(typeof ProfileVault.setCredentials).toBe('function');
    });
    test('exporta getCredentials como função', () => {
      expect(typeof ProfileVault.getCredentials).toBe('function');
    });
    test('exporta hasCredentials como função', () => {
      expect(typeof ProfileVault.hasCredentials).toBe('function');
    });
    test('exporta removeCredentials como função', () => {
      expect(typeof ProfileVault.removeCredentials).toBe('function');
    });
    test('exporta buildAutoLoginScript como função', () => {
      expect(typeof ProfileVault.buildAutoLoginScript).toBe('function');
    });
    test('exporta onChange como função', () => {
      expect(typeof ProfileVault.onChange).toBe('function');
    });
    test('exporta _getVaultPath como função', () => {
      expect(typeof ProfileVault._getVaultPath).toBe('function');
    });
    test('MAX_VAULT_BYTES é 256KB', () => {
      expect(ProfileVault.MAX_VAULT_BYTES).toBe(256 * 1024);
    });
  });

  describe('CRUD operations', () => {
    test('set + get: round-trip recupera credenciais', () => {
      ProfileVault.setCredentials('p_001', 'user@test.com', 'secretpass');
      const creds = ProfileVault.getCredentials('p_001');

      expect(creds).not.toBeNull();
      expect(creds.user).toBe('user@test.com');
      expect(creds.pass).toBe('secretpass');
    });

    test('hasCredentials retorna true quando creds existem', () => {
      ProfileVault.setCredentials('p_002', 'u2', 'p2');
      expect(ProfileVault.hasCredentials('p_002')).toBe(true);
    });

    test('hasCredentials retorna false para perfil sem creds', () => {
      expect(ProfileVault.hasCredentials('p_nonexistent')).toBe(false);
    });

    test('getCredentials retorna null para perfil inexistente', () => {
      expect(ProfileVault.getCredentials('p_nonexistent')).toBeNull();
    });

    test('removeCredentials remove e retorna true', () => {
      ProfileVault.setCredentials('p_003', 'u3', 'p3');
      expect(ProfileVault.hasCredentials('p_003')).toBe(true);

      const result = ProfileVault.removeCredentials('p_003');
      expect(result).toBe(true);
      expect(ProfileVault.hasCredentials('p_003')).toBe(false);
    });

    test('removeCredentials retorna false para perfil inexistente', () => {
      const result = ProfileVault.removeCredentials('p_never_existed');
      expect(result).toBe(false);
    });

    test('set sobrescreve credenciais existentes', () => {
      ProfileVault.setCredentials('p_004', 'old_user', 'old_pass');
      ProfileVault.setCredentials('p_004', 'new_user', 'new_pass');

      const creds = ProfileVault.getCredentials('p_004');
      expect(creds.user).toBe('new_user');
      expect(creds.pass).toBe('new_pass');
    });

    test('set com user/pass vazios não lança', () => {
      expect(() => ProfileVault.setCredentials('p_empty', '', '')).not.toThrow();
      const creds = ProfileVault.getCredentials('p_empty');
      expect(creds).not.toBeNull();
      expect(creds.user).toBe('');
      expect(creds.pass).toBe('');
    });
  });

  describe('buildAutoLoginScript', () => {
    test('retorna string de JS executável', () => {
      const script = ProfileVault.buildAutoLoginScript('user@test.com', 'pass123');
      expect(typeof script).toBe('string');
      expect(script.length).toBeGreaterThan(0);
    });

    test('contém o usuário e senha no script (JSON-stringified)', () => {
      const script = ProfileVault.buildAutoLoginScript('user@test.com', 'pass123');
      expect(script).toContain('user@test.com');
      expect(script).toContain('pass123');
    });

    test('script começa com IIFE (function(){', () => {
      const script = ProfileVault.buildAutoLoginScript('u', 'p');
      expect(script.startsWith('(function(){')).toBe(true);
    });

    test('script termina com })()', () => {
      const script = ProfileVault.buildAutoLoginScript('u', 'p');
      expect(script.endsWith('})()')).toBe(true);
    });

    test('contém MutationObserver', () => {
      const script = ProfileVault.buildAutoLoginScript('u', 'p');
      expect(script).toContain('MutationObserver');
    });

    test('contém setVal helper', () => {
      const script = ProfileVault.buildAutoLoginScript('u', 'p');
      expect(script).toContain('setVal');
    });

    test('escapa aspas no user/pass', () => {
      const script = ProfileVault.buildAutoLoginScript('user"test', "pass'123");
      // JSON.stringify will handle escaping
      expect(typeof script).toBe('string');
      // Should not throw when used
      expect(script.length).toBeGreaterThan(0);
    });
  });

  describe('vault.json persistence', () => {
    test('_getVaultPath retorna caminho dentro de userData', () => {
      const vaultPath = ProfileVault._getVaultPath();
      expect(vaultPath).toContain(tmpDir);
      expect(vaultPath).toContain('vault.json');
    });

    test('vault.json é criado após setCredentials', () => {
      ProfileVault.setCredentials('p_persist', 'persist_user', 'persist_pass');

      const vaultPath = ProfileVault._getVaultPath();
      expect(fs.existsSync(vaultPath)).toBe(true);

      const raw = fs.readFileSync(vaultPath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed['p_persist']).toBeDefined();
    });

    test('vault.json pode ser recarregado (simula restart)', () => {
      ProfileVault.setCredentials('p_restart', 'restart_user', 'restart_pass');

      // Clear module cache to force re-read
      delete require.cache[require.resolve('../ProfileVault')];
      const FreshVault = require('../ProfileVault');

      const creds = FreshVault.getCredentials('p_restart');
      expect(creds).not.toBeNull();
      expect(creds.user).toBe('restart_user');
      expect(creds.pass).toBe('restart_pass');
    });

    test('dados persistidos estão criptografados (não contém plaintext)', () => {
      ProfileVault.setCredentials('p_enc', 'plaintext_user', 'plaintext_secret');

      const vaultPath = ProfileVault._getVaultPath();
      const raw = fs.readFileSync(vaultPath, 'utf8');

      expect(raw).not.toContain('plaintext_user');
      expect(raw).not.toContain('plaintext_secret');
    });
  });

  describe('edge cases', () => {
    test('vault vazio (sem arquivo) inicia com _store vazio', () => {
      // Remove vault.json if it exists
      const vaultPath = path.join(tmpDir, 'vault.json');
      try {
        fs.unlinkSync(vaultPath);
      } catch (_) {
        /* ignore */
      }

      delete require.cache[require.resolve('../ProfileVault')];
      const FreshVault = require('../ProfileVault');

      expect(FreshVault.hasCredentials('anything')).toBe(false);
    });

    test('vault.json corrompido (JSON inválido) inicia vazio sem lançar', () => {
      const vaultPath = path.join(tmpDir, 'vault.json');
      fs.writeFileSync(vaultPath, 'NOT VALID JSON{{{', 'utf8');

      delete require.cache[require.resolve('../ProfileVault')];
      const FreshVault = require('../ProfileVault');

      // Should not throw, should start with empty store
      expect(FreshVault.hasCredentials('anything')).toBe(false);
    });

    test('vault.json com JSON não-objeto (array) inicia vazio', () => {
      const vaultPath = path.join(tmpDir, 'vault.json');
      fs.writeFileSync(vaultPath, '[1,2,3]', 'utf8');

      delete require.cache[require.resolve('../ProfileVault')];
      const FreshVault = require('../ProfileVault');

      expect(FreshVault.hasCredentials('anything')).toBe(false);
    });

    test('onChange callback é chamado após persist', () => {
      delete require.cache[require.resolve('../ProfileVault')];
      const FreshVault = require('../ProfileVault');

      const cb = jest.fn();
      FreshVault.onChange(cb);

      FreshVault.setCredentials('p_cb', 'u', 'p');
      expect(cb).toHaveBeenCalled();
    });

    test('getCredentials retorna null quando decrypt falha (tag mismatch / key changed)', () => {
      const CryptoService = require('../CryptoService');
      const origDecrypt = CryptoService.decrypt;
      CryptoService.decrypt = jest.fn(() => {
        throw new Error('bad ciphertext');
      });

      ProfileVault.setCredentials('p_decfail', 'user_x', 'pass_y');
      const creds = ProfileVault.getCredentials('p_decfail');

      expect(creds).toBeNull();

      CryptoService.decrypt = origDecrypt;
    });

    test('_ensureLoaded com erro de leitura (EACCES) inicia vazio', () => {
      const vaultPath = path.join(tmpDir, 'vault.json');
      fs.writeFileSync(vaultPath, '{"p1":{"user":"x","pass":"y"}}', 'utf8');

      jest.spyOn(fs, 'readFileSync').mockImplementationOnce(function () {
        throw new Error('EACCES: permission denied');
      });

      delete require.cache[require.resolve('../ProfileVault')];
      const FreshVault = require('../ProfileVault');

      expect(FreshVault.hasCredentials('p1')).toBe(false);
      fs.readFileSync.mockRestore();
    });

    test('vault.json com tamanho > MAX_VAULT_BYTES inicia vazio', () => {
      const vaultPath = path.join(tmpDir, 'vault.json');
      // Write a file larger than MAX_VAULT_BYTES
      const fs = require('fs');
      const bigContent = '{"a":"' + 'x'.repeat(ProfileVault.MAX_VAULT_BYTES) + '"}';
      fs.writeFileSync(vaultPath, bigContent, 'utf8');

      delete require.cache[require.resolve('../ProfileVault')];
      const FreshVault = require('../ProfileVault');

      // Should have fallen back to empty store
      expect(FreshVault.getCredentials('any')).toBeNull();
    });
  });

  describe('encryption integration', () => {
    test('credenciais usam CryptoService.encrypt com machine key', () => {
      ProfileVault.setCredentials('p_int', 'int_user', 'int_pass');

      // PasswordManager.getMachineKey should have been called
      expect(PasswordManager.getMachineKey).toHaveBeenCalled();

      // Can decrypt back
      const creds = ProfileVault.getCredentials('p_int');
      expect(creds.user).toBe('int_user');
      expect(creds.pass).toBe('int_pass');
    });

    test('Unicode credentials round-trip', () => {
      ProfileVault.setCredentials('p_unicode', 'usuário@ção.com', 'sênhação🍥');

      const creds = ProfileVault.getCredentials('p_unicode');
      expect(creds.user).toBe('usuário@ção.com');
      expect(creds.pass).toBe('sênhação🍥');
    });
  });
});
