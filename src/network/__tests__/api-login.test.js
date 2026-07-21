/**
 * Tests for src/network/api-login.js
 *
 * Mocka ./tempmail (login + _decode) pra isolar o fluxo de login/injeção de
 * cookie sem rede. Mocka session do Electron pra validar as chamadas
 * cookies.set/get.
 */

'use strict';

// Mock tempmail (api-login faz require('./tempmail'); do test file, '../tempmail' resolve)
jest.mock('../tempmail', () => ({
  login: jest.fn(),
  _decode: jest.fn()
}));

const tempmail = require('../tempmail');
const apiLogin = require('../api-login');

describe('api-login.js', () => {
  let session;

  beforeEach(() => {
    jest.clearAllMocks();
    session = {
      cookies: {
        set: jest.fn(() => Promise.resolve()),
        get: jest.fn(() => Promise.resolve([]))
      }
    };
  });

  describe('OAS_USER_DOMAIN', () => {
    test('exporta constante "narutowebgame.com"', () => {
      expect(apiLogin.OAS_USER_DOMAIN).toBe('narutowebgame.com');
    });
  });

  describe('loginAndInject', () => {
    test('autentica via tempmail.login e injeta cookies oas_user + language', async () => {
      tempmail.login.mockResolvedValue({
        loginKey: 'JWT_TOKEN_123',
        playerId: 'player-1',
        nickname: 'shinobi',
        expiresAt: 1700000000000
      });

      const result = await apiLogin.loginAndInject(session, 'user@x.com', 'pass');

      expect(tempmail.login).toHaveBeenCalledWith('user@x.com', 'pass', undefined);

      // Cookie oas_user no domínio .narutowebgame.com
      expect(session.cookies.set).toHaveBeenCalledWith({
        url: 'https://narutowebgame.com/pl/serverlist',
        name: 'oas_user',
        value: 'JWT_TOKEN_123',
        domain: '.narutowebgame.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'no_restriction',
        expirationDate: Math.floor(1700000000000 / 1000)
      });

      // Cookie de idioma (pl)
      expect(session.cookies.set).toHaveBeenCalledWith({
        url: 'https://narutowebgame.com/pl/serverlist',
        name: 'oas_lp_language_naruto',
        value: 'pl',
        domain: '.narutowebgame.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'no_restriction'
      });

      // Retorno repassa auth
      expect(result).toEqual({
        loginKey: 'JWT_TOKEN_123',
        playerId: 'player-1',
        nickname: 'shinobi',
        expiresAt: 1700000000000
      });
    });

    test('passa opts.remember para tempmail.login', async () => {
      tempmail.login.mockResolvedValue({
        loginKey: 'JWT',
        playerId: 'p',
        nickname: 'n',
        expiresAt: 1
      });

      await apiLogin.loginAndInject(session, 'a@b.com', 'pw', { remember: true });

      expect(tempmail.login).toHaveBeenCalledWith('a@b.com', 'pw', true);
    });

    test('passa opts.remember=false (falsy) para tempmail.login', async () => {
      tempmail.login.mockResolvedValue({
        loginKey: 'JWT',
        playerId: 'p',
        nickname: 'n',
        expiresAt: 1
      });

      await apiLogin.loginAndInject(session, 'a@b.com', 'pw', { remember: false });

      expect(tempmail.login).toHaveBeenCalledWith('a@b.com', 'pw', false);
    });

    test('propaga erro de tempmail.login (não injeta cookies)', async () => {
      tempmail.login.mockRejectedValue(new Error('Login falhou'));

      await expect(apiLogin.loginAndInject(session, 'x', 'y')).rejects.toThrow('Login falhou');
      expect(session.cookies.set).not.toHaveBeenCalled();
    });

    test('propaga erro de session.cookies.set (oas_user)', async () => {
      tempmail.login.mockResolvedValue({
        loginKey: 'JWT',
        playerId: 'p',
        nickname: 'n',
        expiresAt: 1
      });
      session.cookies.set.mockRejectedValue(new Error('cookie blocked'));

      await expect(apiLogin.loginAndInject(session, 'x', 'y')).rejects.toThrow('cookie blocked');
    });
  });

  describe('checkSession', () => {
    test('consulta cookie com filtro name + domain corretos', async () => {
      session.cookies.get.mockResolvedValue([]);
      await apiLogin.checkSession(session);
      expect(session.cookies.get).toHaveBeenCalledWith({
        name: 'oas_user',
        domain: '.narutowebgame.com'
      });
    });

    test('retorna valid:false quando não há cookie oas_user', async () => {
      session.cookies.get.mockResolvedValue([]);
      const result = await apiLogin.checkSession(session);
      expect(result).toEqual({ valid: false, jwtDecoded: null, expiresInSeconds: 0 });
      expect(tempmail._decode).not.toHaveBeenCalled();
    });

    test('retorna valid:false quando _decode retorna null (JWT inválido)', async () => {
      session.cookies.get.mockResolvedValue([{ value: 'garbage' }]);
      tempmail._decode.mockReturnValue(null);
      const result = await apiLogin.checkSession(session);
      expect(result).toEqual({ valid: false, jwtDecoded: null, expiresInSeconds: 0 });
    });

    test('retorna valid:true quando JWT não expirado', async () => {
      session.cookies.get.mockResolvedValue([{ value: 'valid.jwt.token' }]);
      const decoded = {
        expired: false,
        expiresInSeconds: 6000,
        payload: { playerId: 'p1' }
      };
      tempmail._decode.mockReturnValue(decoded);
      const result = await apiLogin.checkSession(session);
      expect(result.valid).toBe(true);
      expect(result.expiresInSeconds).toBe(6000);
      expect(result.jwtDecoded).toBe(decoded);
    });

    test('retorna valid:false quando JWT expirado', async () => {
      session.cookies.get.mockResolvedValue([{ value: 'expired.jwt' }]);
      tempmail._decode.mockReturnValue({
        expired: true,
        expiresInSeconds: 0,
        payload: {}
      });
      const result = await apiLogin.checkSession(session);
      expect(result.valid).toBe(false);
      expect(result.expiresInSeconds).toBe(0);
      expect(result.jwtDecoded).toEqual({
        expired: true,
        expiresInSeconds: 0,
        payload: {}
      });
    });
  });

  describe('renewIfNeeded', () => {
    test('retorna renewed:false quando sessão válida e acima do threshold default (300s)', async () => {
      session.cookies.get.mockResolvedValue([{ value: 'jwt' }]);
      tempmail._decode.mockReturnValue({
        expired: false,
        expiresInSeconds: 3600,
        payload: {}
      });
      const result = await apiLogin.renewIfNeeded(session, 'e', 'p');
      expect(result).toEqual({ renewed: false, loginKey: null, expiresAt: 0 });
      expect(tempmail.login).not.toHaveBeenCalled();
    });

    test('renova quando abaixo do threshold default (300s)', async () => {
      session.cookies.get.mockResolvedValue([{ value: 'jwt' }]);
      tempmail._decode.mockReturnValue({
        expired: false,
        expiresInSeconds: 100, // < 300 default
        payload: {}
      });
      tempmail.login.mockResolvedValue({
        loginKey: 'NEW',
        playerId: 'p',
        nickname: 'n',
        expiresAt: 1
      });
      const result = await apiLogin.renewIfNeeded(session, 'e', 'p');
      expect(result.renewed).toBe(true);
      expect(result.loginKey).toBe('NEW');
      expect(result.expiresAt).toBe(1);
    });

    test('renova quando sessão expirada', async () => {
      session.cookies.get.mockResolvedValue([{ value: 'jwt' }]);
      tempmail._decode.mockReturnValue({
        expired: true,
        expiresInSeconds: 0,
        payload: {}
      });
      tempmail.login.mockResolvedValue({
        loginKey: 'NEW_JWT',
        playerId: 'p1',
        nickname: 'n',
        expiresAt: 1700000000000
      });
      const result = await apiLogin.renewIfNeeded(session, 'e', 'p');
      expect(result.renewed).toBe(true);
      expect(result.loginKey).toBe('NEW_JWT');
      expect(result.expiresAt).toBe(1700000000000);
    });

    test('renova quando não há cookie (sessão inválida)', async () => {
      session.cookies.get.mockResolvedValue([]);
      tempmail.login.mockResolvedValue({
        loginKey: 'NEW',
        playerId: 'p',
        nickname: 'n',
        expiresAt: 1
      });
      const result = await apiLogin.renewIfNeeded(session, 'e', 'p');
      expect(result.renewed).toBe(true);
    });

    test('respeita threshold customizado (renova quando abaixo)', async () => {
      session.cookies.get.mockResolvedValue([{ value: 'jwt' }]);
      tempmail._decode.mockReturnValue({
        expired: false,
        expiresInSeconds: 500, // > 300 default, < 600 custom
        payload: {}
      });
      tempmail.login.mockResolvedValue({
        loginKey: 'NEW',
        playerId: 'p',
        nickname: 'n',
        expiresAt: 1
      });
      const result = await apiLogin.renewIfNeeded(session, 'e', 'p', 600);
      expect(result.renewed).toBe(true);
    });

    test('respeita threshold customizado (não renova quando acima)', async () => {
      session.cookies.get.mockResolvedValue([{ value: 'jwt' }]);
      tempmail._decode.mockReturnValue({
        expired: false,
        expiresInSeconds: 1000, // > 600 custom
        payload: {}
      });
      const result = await apiLogin.renewIfNeeded(session, 'e', 'p', 600);
      expect(result.renewed).toBe(false);
      expect(tempmail.login).not.toHaveBeenCalled();
    });
  });
});
