/**
 * Testes para src/utils/jwt.js
 * Decodificação de JWT (sem validação de assinatura — servidor valida)
 */

const jwt = require('../jwt');

// JWT real capturado do passport.oasgames.com (conta tempmail de teste)
const SAMPLE_JWT =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRUeXBlIjoiYXBwIiwiY2xpZW50SWQiOjk5OSwidXVpZCI6IjM4ODAwMDI5Mjg1MDA4OCIsInBsYXllcklkIjoiMzg4MDAwMjkyODUwMDg4Iiwibmlja25hbWUiOiI5ODMxOCIsInVzZXJuYW1lIjoic2hpbm9iaWxzNjM0MGt6QHdlYi1saWJyYXJ5Lm5ldCIsImxvZ2luR3JhbnRUeXBlIjoicmVnaXN0ZXJBbmRMb2dpbiIsInBsYXllckxhc3RBY3RpdmVUaW1lIjoxNzg0MDY1NTgyLCJsYXRlc3REZXZpY2UiOiIiLCJpc01haW5CdW5kbGVTd2l0Y2hlZCI6ZmFsc2UsImlzTmV3UmVnaXN0ZXJQbGF5ZXIiOmZhbHNlLCJpYXQiOjE3ODQwNjU1ODIsImV4cCI6MTc4NDA3Mjc4MiwibGlmZXRpbWUiOjcyMDAsInJvbGVzIjpbIlJPTEVfVVNFUiJdfQ.fake_signature_for_test';

describe('jwt.js', () => {
  describe('decode', () => {
    test('decodifica JWT válido (header + payload)', () => {
      const d = jwt.decode(SAMPLE_JWT);
      expect(d).not.toBeNull();
      expect(d.header.typ).toBe('JWT');
      expect(d.header.alg).toBe('HS256');
    });

    test('extrai campos do payload do Naruto Online', () => {
      const d = jwt.decode(SAMPLE_JWT);
      expect(d.payload.clientType).toBe('app');
      expect(d.payload.clientId).toBe(999);
      expect(d.payload.playerId).toBe('388000292850088');
      expect(d.payload.nickname).toBe('98318');
      expect(d.payload.username).toBe('shinobils6340kz@web-library.net');
      expect(d.payload.loginGrantType).toBe('registerAndLogin');
      expect(d.payload.lifetime).toBe(7200);
      expect(d.payload.roles).toEqual(['ROLE_USER']);
    });

    test('calcula datas iat/exp corretamente', () => {
      const d = jwt.decode(SAMPLE_JWT);
      expect(d.iat).toBeInstanceOf(Date);
      expect(d.exp).toBeInstanceOf(Date);
      expect(d.iat.getTime()).toBe(1784065582000);
      expect(d.exp.getTime()).toBe(1784072782000);
      expect(d.lifetime).toBe(7200);
    });

    test('marca expired=true quando exp no passado', () => {
      // Cria JWT expirado (exp = 1 hora atrás)
      const payload = Buffer.from(
        JSON.stringify({
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600,
          playerId: 'test'
        })
      ).toString('base64url');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url'
      );
      const expiredJwt = header + '.' + payload + '.sig';
      const d = jwt.decode(expiredJwt);
      expect(d.expired).toBe(true);
      expect(d.expiresInSeconds).toBe(0);
    });

    test('retorna null para input inválido', () => {
      expect(jwt.decode(null)).toBeNull();
      expect(jwt.decode('')).toBeNull();
      expect(jwt.decode('not-a-jwt')).toBeNull();
      expect(jwt.decode('a.b')).toBeNull(); // só 2 partes
      expect(jwt.decode('a.b.c.d')).toBeNull(); // 4 partes
    });

    test('retorna null para base64 malformado', () => {
      expect(jwt.decode('!!!.!!!.!!!')).toBeNull();
    });
  });
});
