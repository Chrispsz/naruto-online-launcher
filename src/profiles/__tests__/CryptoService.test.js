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

  // ───────────────────────────────────────────────────────────────────────────
  // Frente B coverage gaps — crypto + session
  // Foco: branches não cobertos, condições de contorno, assertions de segurança.
  // ───────────────────────────────────────────────────────────────────────────
  describe('Frente B coverage gaps — crypto + session', () => {
    describe('deriveKey — Primitivas PBKDF2', () => {
      test('consistência: deriveKey equivale a crypto.pbkdf2Sync SHA-512 200k iters', () => {
        const salt = Buffer.alloc(32, 0x01);
        const expected = crypto.pbkdf2Sync('testpw', salt, 200000, 32, 'sha512');
        expect(Cs.deriveKey('testpw', salt).equals(expected)).toBe(true);
      });

      test('salt diferente produz chave diferente (mesma senha)', () => {
        const salt1 = Buffer.alloc(32, 0x01);
        const salt2 = Buffer.alloc(32, 0x02);
        expect(Cs.deriveKey('samepw', salt1).equals(Cs.deriveKey('samepw', salt2))).toBe(false);
      });

      test('coerção não-string: number é aceito (String(password))', () => {
        const salt = Buffer.alloc(32, 0xab);
        const fromNum = Cs.deriveKey(123456, salt);
        const fromStr = Cs.deriveKey('123456', salt);
        expect(fromNum.equals(fromStr)).toBe(true);
      });
    });

    describe('encrypt — Formato e aleatoriedade (security assertions)', () => {
      test('payload é base64 puro e tem tamanho IV(12) + ct(utf8) + tag(16)', () => {
        const key = crypto.randomBytes(32);
        const plaintext = 'hello world';
        const payload = Cs.encrypt(plaintext, key);
        expect(payload).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
        const buf = Buffer.from(payload, 'base64');
        expect(buf.length).toBe(12 + Buffer.byteLength(plaintext, 'utf8') + 16);
      });

      test('primeiros 12 bytes (IV) diferem a cada chamada (IV aleatório per call)', () => {
        const key = crypto.randomBytes(32);
        const a = Buffer.from(Cs.encrypt('same plaintext', key), 'base64');
        const b = Buffer.from(Cs.encrypt('same plaintext', key), 'base64');
        expect(a.slice(0, 12).equals(b.slice(0, 12))).toBe(false);
      });

      test('ciphertext NUNCA contém o plaintext em claro (bytes do plaintext ausentes do payload)', () => {
        const key = crypto.randomBytes(32);
        const plaintext = 'SUPER_SECRET_TOKEN_42';
        const payload = Cs.encrypt(plaintext, key);
        const buf = Buffer.from(payload, 'base64');
        // plaintext não pode aparecer em nenhum slice do payload (iv+ct+tag)
        const plainBuf = Buffer.from(plaintext, 'utf8');
        expect(buf.includes(plainBuf)).toBe(false);
      });
    });

    describe('decrypt — Condições de contorno e adulteração', () => {
      test('payload com 27 bytes (< IV+tag) retorna string vazia sem lançar (boundary inferior)', () => {
        const key = crypto.randomBytes(32);
        // IV(12) + tag(16) = 28 bytes mínimo; 27 → short-circuito
        const short = Buffer.alloc(27, 0xab).toString('base64');
        expect(Cs.decrypt(short, key)).toBe('');
      });

      test('payload exatamente IV+tag (28 bytes, ct vazio) lança (decipher.final sem ct válido)', () => {
        const key = crypto.randomBytes(32);
        // 28 bytes — passa pela guarda de tamanho mas ct=0 → decipher.final() lança
        const empty = Buffer.alloc(28, 0xab).toString('base64');
        expect(() => Cs.decrypt(empty, key)).toThrow();
      });

      test('bit-flip no ciphertext lança (auth tag mismatch — GCM detects tampering)', () => {
        const key = crypto.randomBytes(32);
        const buf = Buffer.from(Cs.encrypt('secret', key), 'base64');
        // Flip 1 bit no byte 15 (dentro do ct, após IV de 12 bytes)
        buf[15] = buf[15] ^ 0x01;
        expect(() => Cs.decrypt(buf.toString('base64'), key)).toThrow();
      });
    });

    describe('exportEncryptedBackup — Condições de contorno e aleatoriedade', () => {
      test('senha de exatamente 8 caracteres é aceita (boundary mínimo inclusivo)', () => {
        expect(() => Cs.exportEncryptedBackup([], {}, '12345678')).not.toThrow();
      });

      test('senha de 7 caracteres é rejeitada (boundary abaixo do mínimo)', () => {
        expect(() => Cs.exportEncryptedBackup([], {}, '1234567')).toThrow(/at least 8 characters/);
      });

      test('salt gerado é aleatório por chamada (envelopes diferentes para mesmo input)', () => {
        const e1 = Cs.exportEncryptedBackup([], {}, 'masterpw12');
        const e2 = Cs.exportEncryptedBackup([], {}, 'masterpw12');
        const env1 = JSON.parse(Buffer.from(e1, 'base64').toString());
        const env2 = JSON.parse(Buffer.from(e2, 'base64').toString());
        expect(env1.salt).not.toBe(env2.salt);
        expect(env1.iv).not.toBe(env2.iv);
      });

      test('credentialsMap null → envelope/decrypt produz credentials={} (default seguro)', () => {
        const enc = Cs.exportEncryptedBackup([], null, 'masterpw12');
        const payload = Cs.importEncryptedBackup(enc, 'masterpw12');
        expect(payload.credentials).toEqual({});
      });
    });

    describe('importEncryptedBackup — Schema validation post-decrypt', () => {
      // Helper: constrói um envelope cifrado a partir de um payload arbitrário.
      function buildEnvelope(payload, password) {
        const plaintext = JSON.stringify(payload);
        const salt = crypto.randomBytes(Cs.PBKDF2_SALT_LEN);
        const iv = crypto.randomBytes(Cs.GCM_IV_LEN);
        const key = Cs.deriveKey(password, salt);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.from(
          JSON.stringify({
            version: Cs.BACKUP_VERSION,
            kdf: {
              algorithm: 'pbkdf2',
              hash: 'sha512',
              iterations: Cs.PBKDF2_ITERATIONS,
              keyLength: Cs.PBKDF2_KEYLEN
            },
            cipher: { algorithm: 'aes-256-gcm', ivLength: Cs.GCM_IV_LEN },
            salt: salt.toString('base64'),
            iv: iv.toString('base64'),
            ct: ct.toString('base64'),
            tag: tag.toString('base64')
          })
        ).toString('base64');
      }

      test('rejeita IV com tamanho incorreto (mensagem específica sobre IV)', () => {
        const enc = Cs.exportEncryptedBackup(
          [{ id: 'p1', name: 'T' }],
          {},
          'testpass1234'
        );
        const envelope = JSON.parse(Buffer.from(enc, 'base64').toString());
        envelope.iv = Buffer.alloc(10, 0xff).toString('base64'); // 10 bytes, não 12
        const tampered = Buffer.from(JSON.stringify(envelope)).toString('base64');
        expect(() => Cs.importEncryptedBackup(tampered, 'testpass1234')).toThrow(/Invalid IV/);
      });

      test('rejeita credentials como array (não-objeto) após descriptografar', () => {
        const enc = buildEnvelope(
          {
            version: 1,
            exportedAt: 12345,
            profiles: [{ id: 'p1', name: 'T' }],
            credentials: ['not', 'an', 'object']
          },
          'testpass1234'
        );
        expect(() => Cs.importEncryptedBackup(enc, 'testpass1234')).toThrow(
          /credentials is not an object/
        );
      });

      test('rejeita profiles como não-array após descriptografar', () => {
        const enc = buildEnvelope(
          {
            version: 1,
            exportedAt: 12345,
            profiles: { not: 'an array' },
            credentials: {}
          },
          'testpass1234'
        );
        expect(() => Cs.importEncryptedBackup(enc, 'testpass1234')).toThrow(
          /profiles is not an array/
        );
      });

      test('aceita credentials=null no payload (branch aceita null como válido)', () => {
        const enc = buildEnvelope(
          {
            version: 1,
            exportedAt: 12345,
            profiles: [{ id: 'p1', name: 'T' }],
            credentials: null
          },
          'testpass1234'
        );
        const payload = Cs.importEncryptedBackup(enc, 'testpass1234');
        expect(payload.credentials).toBeNull();
      });
    });
  });
});
