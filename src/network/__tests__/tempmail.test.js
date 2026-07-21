/**
 * Testes para src/network/tempmail.js
 * Mocka as chamadas HTTP (mail.tm + passport.oasgames.com) pra não depender de rede
 */

// Mock electron-log (do setup global) — mock automatic via tests/setup.js

// Mock o módulo https do Node (tempmail usa require('https') inline)
jest.mock('https', () => {
  const handlers = {};
  return {
    get: jest.fn((url, opts, cb) => {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      const key = typeof url === 'string' ? url : url.href || url.path;
      const h = handlers[key] || handlers['*'];
      if (!h) {
        cb({ on: () => {} });
        return { on: () => {} };
      }
      return h(cb);
    }),
    request: jest.fn((opts, cb) => {
      cb({ on: () => {} });
      return { on: () => {}, write: () => {}, end: () => {} };
    }),
    _setHandler: (key, fn) => {
      handlers[key] = fn;
    }
  };
});

const https = require('https');
const tempmail = require('../tempmail');

describe('tempmail.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    https._setHandler('*', null);
  });

  describe('_generatePassword', () => {
    test('gera senha de 16 caracteres', () => {
      const pwd = tempmail._generatePassword();
      expect(pwd).toHaveLength(16);
    });

    test('gera senhas diferentes a cada chamada', () => {
      const p1 = tempmail._generatePassword();
      const p2 = tempmail._generatePassword();
      expect(p1).not.toBe(p2);
    });

    test('contém caracteres de múltiplos conjuntos', () => {
      const pwd = tempmail._generatePassword();
      expect(/[A-Z]/.test(pwd)).toBe(true);
      expect(/[a-z]/.test(pwd)).toBe(true);
      expect(/[0-9]/.test(pwd)).toBe(true);
    });
  });

  describe('_decode', () => {
    test('é alias de jwt.decode', () => {
      const tok = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJwbGF5ZXJJZCI6InRlc3QifQ.sig';
      const d = tempmail._decode(tok);
      expect(d).not.toBeNull();
      expect(d.payload.playerId).toBe('test');
    });
  });

  describe('login (com mock)', () => {
    test('rejeita quando passport retorna status fail', async () => {
      https.get.mockImplementationOnce((url, opts, cb) => {
        if (typeof opts === 'function') cb = opts;
        const res = {
          on: (ev, h) => {
            if (ev === 'end') h();
            if (ev === 'data') h('{"status":"fail","err_code":1,"err_msg":"user not exist"}');
          }
        };
        cb(res);
        return { on: () => {} };
      });

      await expect(tempmail.login('bad@email', 'bad')).rejects.toThrow();
    });
  });
});
