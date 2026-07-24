/**
 * Testes para src/profiles/CryptoService.js (Fase 3e split — primitivas puras)
 */

const crypto = require('crypto');
const Cs = require('../CryptoService');

describe('CryptoService.js', () => {
  describe('deriveKey', () => {
    test('deriva chave de 32 bytes', () => {
      const salt = crypto.randomBytes(Cs.PBKDF2_SALT_LEN);
      const key = Cs.deriveKey('password', salt);
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(Cs.PBKDF2_KEYLEN);
      expect(key.length).toBe(32);
    });

    test('é determinística para mesma senha+salt', () => {
      const salt = Buffer.alloc(32, 0xab);
      const k1 = Cs.deriveKey('hunter2', salt);
      const k2 = Cs.deriveKey('hunter2', salt);
      expect(k1.equals(k2)).toBe(true);
    });

    test('diferente para senhas diferentes', () => {
      const salt = Buffer.alloc(32, 0xab);
      const k1 = Cs.deriveKey('hunter2', salt);
      const k2 = Cs.deriveKey('hunter3', salt);
      expect(k1.equals(k2)).toBe(false);
    });
  });

  describe('encrypt / decrypt', () => {
    const key = crypto.randomBytes(32);

    test('round-trip recupera o plaintext', () => {
      const payload = Cs.encrypt('hello world', key);
      expect(typeof payload).toBe('string');
      expect(Cs.decrypt(payload, key)).toBe('hello world');
    });

    test('round-trip com string vazia', () => {
      const payload = Cs.encrypt('', key);
      expect(Cs.decrypt(payload, key)).toBe('');
    });

    test('round-trip com caracteres Unicode (PT-BR/emoji)', () => {
      const msg = 'senhação 🍥 açúcar';
      const payload = Cs.encrypt(msg, key);
      expect(Cs.decrypt(payload, key)).toBe(msg);
    });

    test('decrypt com chave errada lança (auth tag mismatch — primitiva pura)', () => {
      const payload = Cs.encrypt('secret', key);
      const wrongKey = crypto.randomBytes(32);
      // CryptoService.decrypt é uma primitiva PURA: lança em auth tag mismatch.
      // O ProfileVault._decryptWithMachineKey é quem engole o erro retornando ''.
      expect(() => Cs.decrypt(payload, wrongKey)).toThrow();
    });

    test('decrypt de payload muito curto retorna vazio (não tenta decipher)', () => {
      const short = Buffer.alloc(10).toString('base64');
      expect(Cs.decrypt(short, key)).toBe('');
    });

    test('ciphertexts da mesma mensagem são diferentes (IV aleatório)', () => {
      const a = Cs.encrypt('same', key);
      const b = Cs.encrypt('same', key);
      expect(a).not.toBe(b);
    });
  });

  describe('exportEncryptedBackup / importEncryptedBackup', () => {
    const profiles = [
      { id: 'p_1', name: 'Main' },
      { id: 'p_2', name: 'Alt' }
    ];
    const creds = { p_1: { user: 'u1', pass: 's1' } };

    test('round-trip recupera perfis + credenciais', () => {
      const enc = Cs.exportEncryptedBackup(profiles, creds, 'masterpw12');
      expect(typeof enc).toBe('string');
      const payload = Cs.importEncryptedBackup(enc, 'masterpw12');
      expect(payload.profiles).toHaveLength(2);
      expect(payload.profiles[0].id).toBe('p_1');
      expect(payload.credentials.p_1.user).toBe('u1');
      expect(payload.exportedAt).toBeGreaterThan(0);
    });

    test('export rejeita senha curta (<8 chars)', () => {
      expect(() => Cs.exportEncryptedBackup(profiles, creds, 'ab')).toThrow(
        /at least 8 characters/
      );
    });

    test('export rejeita profiles não-array', () => {
      expect(() => Cs.exportEncryptedBackup(null, creds, 'masterpw12')).toThrow(/Invalid profile list/);
    });

    test('import com senha errada lança "Senha incorreta"', () => {
      const enc = Cs.exportEncryptedBackup(profiles, creds, 'masterpw12');
      expect(() => Cs.importEncryptedBackup(enc, 'wrongpw')).toThrow(/Incorrect password|corrupted/);
    });

    test('import de base64 inválido lança "inválido ou corrompido"', () => {
      expect(() => Cs.importEncryptedBackup('not-valid-base64-json', 'pw')).toThrow(
        /Invalid or corrupted/
      );
    });

    test('import rejeita argumentos vazios', () => {
      expect(() => Cs.importEncryptedBackup('', 'pw')).toThrow(/required/);
      expect(() => Cs.importEncryptedBackup('x', '')).toThrow(/required/);
    });

    test('envelope tem versão e kdf documentados', () => {
      const enc = Cs.exportEncryptedBackup(profiles, creds, 'masterpw12');
      const envelope = JSON.parse(Buffer.from(enc, 'base64').toString('utf8'));
      expect(envelope.version).toBe(Cs.BACKUP_VERSION);
      expect(envelope.kdf.algorithm).toBe('pbkdf2');
      expect(envelope.kdf.hash).toBe('sha512');
      expect(envelope.kdf.iterations).toBe(Cs.PBKDF2_ITERATIONS);
      expect(envelope.cipher.algorithm).toBe('aes-256-gcm');
    });
  });

  describe('constants', () => {
    test('PBKDF2_ITERATIONS é 200000', () => {
      expect(Cs.PBKDF2_ITERATIONS).toBe(200000);
    });
    test('PBKDF2_SALT_LEN é 32', () => {
      expect(Cs.PBKDF2_SALT_LEN).toBe(32);
    });
    test('BACKUP_VERSION é 1', () => {
      expect(Cs.BACKUP_VERSION).toBe(1);
    });
  });

  describe('importEncryptedBackup — error branches', () => {
    test('rejeita versão de backup incompatível', () => {
      const encrypted = Cs.exportEncryptedBackup(
        [{ id: 'p1', name: 'Test' }],
        { p1: { user: 'a@b.com', pass: 'x' } },
        'testpass1234'
      );
      const envelope = JSON.parse(Buffer.from(encrypted, 'base64').toString());
      envelope.version = 99;
      const tampered = Buffer.from(JSON.stringify(envelope)).toString('base64');
      expect(() => Cs.importEncryptedBackup(tampered, 'testpass1234')).toThrow(
        'Incompatible backup version'
      );
    });

    test('rejeita estrutura com base64 inválido nos campos criptográficos', () => {
      const envelope = {
        version: Cs.BACKUP_VERSION,
        salt: 'aW52YWxpZA==',
        iv: 'aW52YWxpZA==',
        ct: 'aW52YWxpZA==',
        tag: 'aW52YWxpZA=='
      };
      const tampered = Buffer.from(JSON.stringify(envelope)).toString('base64');
      expect(() => Cs.importEncryptedBackup(tampered, 'testpass1234')).toThrow('Invalid salt');
    });
  });
});
