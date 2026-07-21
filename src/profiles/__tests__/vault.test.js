/**
 * Testes para src/profiles/vault.js — Facade de delegação
 *
 * vault.js é uma facade que compõe CryptoService, PasswordManager e ProfileVault.
 * Testa que as funções encrypt/decrypt delegam corretamente para CryptoService
 * usando a chave de máquina do PasswordManager.
 */

'use strict';

// vault.js é uma facade que compõe CryptoService, PasswordManager e ProfileVault.
// Testa que as funções encrypt/decrypt delegam corretamente para CryptoService
// usando a chave de máquina do PasswordManager.
jest.mock('../PasswordManager', () => ({
  getMachineKey: jest.fn(() => Buffer.alloc(32, 'x'))
}));

const vault = require('../vault');

describe('vault.js facade', () => {
  describe('encrypt', () => {
    test('delega para CryptoService.encrypt com machineKey', () => {
      var result = vault.encrypt('hello world');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('resultado é decryptável', () => {
      var plaintext = 'senha-secreta-123';
      var encrypted = vault.encrypt(plaintext);
      var decrypted = vault.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('plaintexts diferentes produzem ciphertexts diferentes', () => {
      var a = vault.encrypt('aaaa');
      var b = vault.encrypt('bbbb');
      expect(a).not.toBe(b);
    });
  });

  describe('decrypt', () => {
    test('retorna string vazia para payload inválido', () => {
      expect(vault.decrypt('not-valid-base64!!!')).toBe('');
    });

    test('retorna string vazia para payload muito curto', () => {
      expect(vault.decrypt('')).toBe('');
    });
  });

  describe('delegações ProfileVault', () => {
    test('setCredentials, getCredentials, hasCredentials, removeCredentials são exportados', () => {
      expect(typeof vault.setCredentials).toBe('function');
      expect(typeof vault.getCredentials).toBe('function');
      expect(typeof vault.hasCredentials).toBe('function');
      expect(typeof vault.removeCredentials).toBe('function');
    });

    test('buildAutoLoginScript e onChange são exportados', () => {
      expect(typeof vault.buildAutoLoginScript).toBe('function');
      expect(typeof vault.onChange).toBe('function');
    });
  });

  describe('delegações CryptoService (backup)', () => {
    test('exportEncryptedBackup e importEncryptedBackup são exportados', () => {
      expect(typeof vault.exportEncryptedBackup).toBe('function');
      expect(typeof vault.importEncryptedBackup).toBe('function');
    });
  });
});
