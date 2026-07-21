/**
 * Tests for src/network/cookies.js
 *
 * Mocka session do Electron (cookies.on/set/remove/get, webRequest,
 * clearCache, clearStorageData) pra testar:
 *   - setupPersistentCookies (idempotência, listener 'changed', handler
 *     onHeadersReceived com CSP + extensão de cookies + bloqueio tracking)
 *   - clearAllCookies (sucesso, falha parcial, falha total)
 *   - forgetSession (reset de idempotência)
 *   - domain matching indireto via listener (isGameDomain/isTrackingDomain/buildCookieUrl internos)
 */

'use strict';

const cookies = require('../cookies');

function makeSession() {
  return {
    cookies: {
      on: jest.fn(),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      get: jest.fn(() => Promise.resolve([]))
    },
    webRequest: {
      onHeadersReceived: jest.fn()
    },
    clearCache: jest.fn(() => Promise.resolve()),
    clearStorageData: jest.fn(() => Promise.resolve())
  };
}

describe('cookies.js', () => {
  let session;

  beforeEach(() => {
    session = makeSession();
    // Reset idempotência entre testes (defensive — session é nova, mas garante
    // estado limpo se algum teste reutilizar objeto)
    cookies.forgetSession(session);
  });

  describe('setupPersistentCookies', () => {
    test('retorna true na primeira chamada e registra listeners', () => {
      const result = cookies.setupPersistentCookies(session);
      expect(result).toBe(true);
      expect(session.cookies.on).toHaveBeenCalledWith('changed', expect.any(Function));
      expect(session.webRequest.onHeadersReceived).toHaveBeenCalledWith(expect.any(Function));
    });

    test('retorna false na segunda chamada (idempotência) e não re-registra listeners', () => {
      cookies.setupPersistentCookies(session);
      const result2 = cookies.setupPersistentCookies(session);
      expect(result2).toBe(false);
      // Counts permanecem 1 (não duplica)
      expect(session.cookies.on).toHaveBeenCalledTimes(1);
      expect(session.webRequest.onHeadersReceived).toHaveBeenCalledTimes(1);
    });

    test('forgetSession permite reconfigurar e retorna true novamente', () => {
      cookies.setupPersistentCookies(session);
      cookies.forgetSession(session);
      const result2 = cookies.setupPersistentCookies(session);
      expect(result2).toBe(true);
      expect(session.cookies.on).toHaveBeenCalledTimes(2);
      expect(session.webRequest.onHeadersReceived).toHaveBeenCalledTimes(2);
    });

    test('configura sem options (csp=null default)', () => {
      expect(() => cookies.setupPersistentCookies(session)).not.toThrow();
      expect(session.webRequest.onHeadersReceived).toHaveBeenCalled();
    });

    test('configura com options.csp fornecido', () => {
      expect(() =>
        cookies.setupPersistentCookies(session, { csp: 'default-src self' })
      ).not.toThrow();
      expect(session.webRequest.onHeadersReceived).toHaveBeenCalled();
    });
  });

  describe("'changed' listener — extensão/bloqueio de cookies", () => {
    let changedListener;

    beforeEach(() => {
      cookies.setupPersistentCookies(session);
      const call = session.cookies.on.mock.calls.find(c => c[0] === 'changed');
      changedListener = call ? call[1] : null;
      expect(changedListener).toBeInstanceOf(Function);
    });

    test('estende cookie do jogo quando faltam menos de 7 dias para expirar', () => {
      const cookie = {
        domain: '.narutowebgame.com',
        name: 'session_id',
        value: 'abc',
        path: '/',
        httpOnly: true,
        secure: false,
        expirationDate: Math.floor(Date.now() / 1000) + 100 // 100s restantes
      };
      changedListener({}, cookie, 'explicit', false);
      expect(session.cookies.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'session_id',
          value: 'abc',
          domain: '.narutowebgame.com',
          secure: false,
          sameSite: 'no_restriction'
        })
      );
    });

    test('estende cookie de subdomínio do jogo (oasgames.com)', () => {
      const cookie = {
        domain: '.oasgames.com',
        name: 'sess',
        value: 'v',
        path: '/',
        httpOnly: false,
        secure: true,
        expirationDate: Math.floor(Date.now() / 1000) + 50
      };
      changedListener({}, cookie, 'explicit', false);
      expect(session.cookies.set).toHaveBeenCalled();
    });

    test('não estende cookie do jogo com mais de 7 dias restantes', () => {
      const cookie = {
        domain: '.narutowebgame.com',
        name: 'session_id',
        value: 'abc',
        path: '/',
        httpOnly: true,
        secure: false,
        expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400 // 30 dias
      };
      changedListener({}, cookie, 'explicit', false);
      expect(session.cookies.set).not.toHaveBeenCalled();
    });

    test('não processa cookie removido (removed=true)', () => {
      const cookie = {
        domain: '.narutowebgame.com',
        name: 'x',
        value: 'y',
        path: '/',
        secure: false,
        expirationDate: 1
      };
      changedListener({}, cookie, 'explicit', true);
      expect(session.cookies.set).not.toHaveBeenCalled();
      expect(session.cookies.remove).not.toHaveBeenCalled();
    });

    test('não processa cookie com cause=overwrite (evita loop)', () => {
      const cookie = {
        domain: '.narutowebgame.com',
        name: 'x',
        value: 'y',
        path: '/',
        secure: false,
        expirationDate: 1
      };
      changedListener({}, cookie, 'overwrite', false);
      expect(session.cookies.set).not.toHaveBeenCalled();
    });

    test('remove cookie de domínio de tracking (google-analytics.com)', () => {
      const cookie = {
        domain: '.google-analytics.com',
        name: '_ga',
        value: 'GA1.2.x',
        path: '/',
        secure: false
      };
      changedListener({}, cookie, 'explicit', false);
      expect(session.cookies.remove).toHaveBeenCalledWith('http://google-analytics.com/', '_ga');
    });

    test('remove cookie de subdomínio de tracking (collect.mdata.cool)', () => {
      const cookie = {
        domain: '.collect.mdata.cool',
        name: 'tid',
        value: 'xyz',
        path: '/',
        secure: false
      };
      changedListener({}, cookie, 'explicit', false);
      expect(session.cookies.remove).toHaveBeenCalledWith('http://collect.mdata.cool/', 'tid');
    });

    test('não faz nada para cookie de domínio desconhecido (não game, não tracking)', () => {
      const cookie = {
        domain: '.random-site.com',
        name: 'foo',
        value: 'bar',
        path: '/',
        secure: false
      };
      changedListener({}, cookie, 'explicit', false);
      expect(session.cookies.set).not.toHaveBeenCalled();
      expect(session.cookies.remove).not.toHaveBeenCalled();
    });

    test('buildCookieUrl usa https:// quando cookie.secure=true', () => {
      const cookie = {
        domain: '.google-analytics.com',
        name: '_ga',
        value: 'x',
        path: '/path',
        secure: true
      };
      changedListener({}, cookie, 'explicit', false);
      expect(session.cookies.remove).toHaveBeenCalledWith(
        'https://google-analytics.com/path',
        '_ga'
      );
    });
  });

  describe('onHeadersReceived handler', () => {
    let headersHandler;

    beforeEach(() => {
      cookies.setupPersistentCookies(session);
      headersHandler = session.webRequest.onHeadersReceived.mock.calls[0][0];
    });

    test('remove set-cookie em domínio de tracking', () => {
      const callback = jest.fn();
      const details = {
        url: 'https://www.google-analytics.com/collect',
        responseHeaders: { 'set-cookie': ['_ga=GA1.2.x; path=/'] }
      };
      headersHandler(details, callback);
      expect(callback).toHaveBeenCalledTimes(1);
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['set-cookie']).toBeUndefined();
    });

    test('estende cookies do jogo com Max-Age quando não tem expires/max-age', () => {
      const callback = jest.fn();
      const details = {
        url: 'https://naruto.narutowebgame.com/game',
        responseHeaders: { 'set-cookie': ['oas_user=jwt; path=/'] }
      };
      headersHandler(details, callback);
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['set-cookie'][0]).toMatch(/Max-Age=/);
    });

    test('não modifica cookie do jogo que já tem Expires=', () => {
      const callback = jest.fn();
      const originalCookie = 'oas_user=jwt; Expires=Wed, 01 Jan 2025 00:00:00 GMT';
      const details = {
        url: 'https://naruto.narutowebgame.com/game',
        responseHeaders: { 'set-cookie': [originalCookie] }
      };
      headersHandler(details, callback);
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['set-cookie'][0]).toBe(originalCookie);
    });

    test('não modifica cookie do jogo que já tem max-age=', () => {
      const callback = jest.fn();
      const originalCookie = 'oas_user=jwt; max-age=3600';
      const details = {
        url: 'https://naruto.narutowebgame.com/game',
        responseHeaders: { 'set-cookie': [originalCookie] }
      };
      headersHandler(details, callback);
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['set-cookie'][0]).toBe(originalCookie);
    });

    test('estende cookies de subdomínio do jogo (oasgames.com)', () => {
      const callback = jest.fn();
      const details = {
        url: 'https://odp3.oasgames.com/api/game',
        responseHeaders: { 'set-cookie': ['sess=abc'] }
      };
      headersHandler(details, callback);
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['set-cookie'][0]).toMatch(/Max-Age=/);
    });

    test('callback vazio ({}) para URL inválida', () => {
      const callback = jest.fn();
      const details = {
        url: 'not-a-url',
        responseHeaders: {}
      };
      headersHandler(details, callback);
      expect(callback).toHaveBeenCalledWith({});
    });

    test('preserva headers quando não há set-cookie', () => {
      const callback = jest.fn();
      const details = {
        url: 'https://naruto.narutowebgame.com/game',
        responseHeaders: { 'content-type': ['text/html'] }
      };
      headersHandler(details, callback);
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['content-type']).toEqual(['text/html']);
      expect(arg.responseHeaders['set-cookie']).toBeUndefined();
    });

    test('não modifica set-cookie de domínio desconhecido (não game, não tracking)', () => {
      const callback = jest.fn();
      const original = ['random=v'];
      const details = {
        url: 'https://example.com/page',
        responseHeaders: { 'set-cookie': original }
      };
      headersHandler(details, callback);
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['set-cookie']).toEqual(original);
    });

    test('não injeta CSP quando options.csp não fornecido (default)', () => {
      const callback = jest.fn();
      headersHandler(
        {
          url: 'https://naruto.narutowebgame.com/game',
          responseHeaders: {}
        },
        callback
      );
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['Content-Security-Policy']).toBeUndefined();
    });
  });

  describe('onHeadersReceived handler com CSP', () => {
    test('injeta Content-Security-Policy em URL http(s)', () => {
      const s2 = makeSession();
      cookies.setupPersistentCookies(s2, { csp: 'default-src self' });
      const handler = s2.webRequest.onHeadersReceived.mock.calls[0][0];
      const callback = jest.fn();
      handler(
        {
          url: 'https://naruto.narutowebgame.com/game',
          responseHeaders: {}
        },
        callback
      );
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['Content-Security-Policy']).toEqual(['default-src self']);
    });

    test('não injeta CSP em URLs não-http(s) (file://)', () => {
      const s2 = makeSession();
      cookies.setupPersistentCookies(s2, { csp: 'default-src self' });
      const handler = s2.webRequest.onHeadersReceived.mock.calls[0][0];
      const callback = jest.fn();
      handler(
        {
          url: 'file:///local/index.html',
          responseHeaders: {}
        },
        callback
      );
      const arg = callback.mock.calls[0][0];
      expect(arg.responseHeaders['Content-Security-Policy']).toBeUndefined();
    });
  });

  describe('clearAllCookies', () => {
    test('remove todos os cookies e limpa cache + storage', async () => {
      session.cookies.get.mockResolvedValue([
        { domain: '.narutowebgame.com', name: 'a', path: '/', secure: true },
        { domain: '.oasgames.com', name: 'b', path: '/', secure: false }
      ]);
      const result = await cookies.clearAllCookies(session);
      expect(result).toBe(true);
      expect(session.cookies.remove).toHaveBeenCalledTimes(2);
      expect(session.clearCache).toHaveBeenCalled();
      expect(session.clearStorageData).toHaveBeenCalled();
    });

    test('usa buildCookieUrl pra construir URL de remoção (https quando secure)', async () => {
      session.cookies.get.mockResolvedValue([
        { domain: '.narutowebgame.com', name: 'a', path: '/game', secure: true }
      ]);
      await cookies.clearAllCookies(session);
      expect(session.cookies.remove).toHaveBeenCalledWith('https://narutowebgame.com/game', 'a');
    });

    test('usa http quando secure=false', async () => {
      session.cookies.get.mockResolvedValue([
        { domain: '.oasgames.com', name: 'b', path: '/', secure: false }
      ]);
      await cookies.clearAllCookies(session);
      expect(session.cookies.remove).toHaveBeenCalledWith('http://oasgames.com/', 'b');
    });

    test('retorna true mesmo sem cookies', async () => {
      session.cookies.get.mockResolvedValue([]);
      const result = await cookies.clearAllCookies(session);
      expect(result).toBe(true);
      expect(session.cookies.remove).not.toHaveBeenCalled();
      expect(session.clearCache).toHaveBeenCalled();
      expect(session.clearStorageData).toHaveBeenCalled();
    });

    test('continua removendo outros cookies se um falha (catch silencioso)', async () => {
      session.cookies.get.mockResolvedValue([
        { domain: '.narutowebgame.com', name: 'a', path: '/', secure: true },
        { domain: '.oasgames.com', name: 'b', path: '/', secure: false }
      ]);
      session.cookies.remove.mockResolvedValueOnce().mockRejectedValueOnce(new Error('boom'));
      const result = await cookies.clearAllCookies(session);
      expect(result).toBe(true);
      expect(session.cookies.remove).toHaveBeenCalledTimes(2);
    });

    test('retorna false quando session.cookies.get lança', async () => {
      session.cookies.get.mockRejectedValue(new Error('get failed'));
      const result = await cookies.clearAllCookies(session);
      expect(result).toBe(false);
    });

    test('retorna false quando clearCache lança', async () => {
      session.cookies.get.mockResolvedValue([]);
      session.clearCache.mockRejectedValue(new Error('cache boom'));
      const result = await cookies.clearAllCookies(session);
      expect(result).toBe(false);
    });

    test('retorna false quando clearStorageData lança', async () => {
      session.cookies.get.mockResolvedValue([]);
      session.clearStorageData.mockRejectedValue(new Error('storage boom'));
      const result = await cookies.clearAllCookies(session);
      expect(result).toBe(false);
    });
  });

  describe('forgetSession', () => {
    test('permite reconfigurar mesma session após forget', () => {
      const s = makeSession();
      expect(cookies.setupPersistentCookies(s)).toBe(true);
      expect(cookies.setupPersistentCookies(s)).toBe(false); // idempotente
      cookies.forgetSession(s);
      expect(cookies.setupPersistentCookies(s)).toBe(true); // reconfigurou
    });

    test('não lança para session nunca configurada', () => {
      const s = makeSession();
      expect(() => cookies.forgetSession(s)).not.toThrow();
    });
  });
});
