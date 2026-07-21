/**
 * Testes para src/network/blocker.js
 */

const {
  BLOCKED_DOMAINS,
  BLOCKED_PATH_PATTERNS,
  isBlockedDomain,
  isBlockedPath,
  shouldBlock,
  setupBlocker,
  forgetSession
} = require('../blocker');

describe('blocker.js', () => {
  describe('BLOCKED_DOMAINS', () => {
    test('é um Set', () => {
      expect(BLOCKED_DOMAINS instanceof Set).toBe(true);
    });

    test('contém domínios de analytics', () => {
      expect(BLOCKED_DOMAINS.has('google-analytics.com')).toBe(true);
      expect(BLOCKED_DOMAINS.has('googletagmanager.com')).toBe(true);
    });

    test('contém domínios de ads', () => {
      expect(BLOCKED_DOMAINS.has('doubleclick.net')).toBe(true);
      expect(BLOCKED_DOMAINS.has('googlesyndication.com')).toBe(true);
    });

    test('contém domínios de social tracking', () => {
      // facebook.com NOT blocked — needed for OAuth login
      // connect.facebook.net NOT blocked — game SDK needs real FB object
      expect(BLOCKED_DOMAINS.has('facebook.com')).toBe(false);
      expect(BLOCKED_DOMAINS.has('connect.facebook.net')).toBe(false);
      // pixel endpoints ARE blocked (tracking only)
      expect(BLOCKED_DOMAINS.has('pixel.facebook.net')).toBe(true);
      expect(BLOCKED_DOMAINS.has('pixel.facebook.com')).toBe(true);
    });

    test('contém domínios de telemetria', () => {
      expect(BLOCKED_DOMAINS.has('sentry.io')).toBe(true);
    });
  });

  describe('isBlockedDomain', () => {
    test('match domínio exato', () => {
      expect(isBlockedDomain('google-analytics.com')).toBe(true);
    });

    test('match subdomínio', () => {
      expect(isBlockedDomain('www.google-analytics.com')).toBe(true);
      expect(isBlockedDomain('collect.mdata.cool')).toBe(true);
    });

    test('não match hostname diferente', () => {
      expect(isBlockedDomain('yahoo.com')).toBe(false);
      expect(isBlockedDomain('google.org')).toBe(false);
    });

    test('não match domínios do jogo', () => {
      expect(isBlockedDomain('naruto.narutowebgame.com')).toBe(false);
      expect(isBlockedDomain('naruto.oasgames.com')).toBe(false);
    });
  });

  describe('shouldBlock', () => {
    test('bloqueia Google Analytics', () => {
      expect(shouldBlock('https://www.google-analytics.com/analytics.js')).toBe(true);
    });

    test('bloqueia Google Tag Manager', () => {
      expect(shouldBlock('https://googletagmanager.com/gtm.js')).toBe(true);
    });

    test('bloqueia DoubleClick', () => {
      expect(shouldBlock('https://doubleclick.net/ad.js')).toBe(true);
    });

    test('bloqueia Facebook pixel (mas NÃO o SDK connect)', () => {
      // pixel.facebook.net blocked (tracking)
      expect(shouldBlock('https://pixel.facebook.net/en_US/fbevents.js')).toBe(true);
      expect(shouldBlock('https://pixel.facebook.com/tr')).toBe(true);
      // connect.facebook.net NOT blocked — game needs the real SDK
      expect(shouldBlock('https://connect.facebook.net/pt_BR/sdk.js')).toBe(false);
    });

    test('bloqueia mdata.cool', () => {
      expect(shouldBlock('https://collect.mdata.cool/track')).toBe(true);
    });

    test('não bloqueia domínios do jogo', () => {
      expect(shouldBlock('https://naruto.narutowebgame.com/game')).toBe(false);
      expect(shouldBlock('https://odp3.oasgames.com/api/game/get-user-servers')).toBe(false);
      expect(shouldBlock('https://odp3.oasgames.com/api/user/getvip')).toBe(false);
      expect(shouldBlock('https://vipsac.oasgames.com/vip')).toBe(false);
      // Tencent CDN — game needs SWF files from here
      expect(shouldBlock('https://res.huoying.qq.com/empty.swf')).toBe(false);
      // v5.9.9: crossdomain.xml agora É bloqueado (path pattern) — sempre falha
      // e só gera ruído/timeout no console. Removido do "não bloqueia".
      expect(shouldBlock('https://cos.huoying.qq.com/assets/game.swf')).toBe(false);
    });

    test('v5.9.9: bloqueia oss_report.fcgi (telemetria iMSDK no mesmo host do jogo)', () => {
      // iMSDK reporta server_id + role_id + uin pra Tencent — vazamento de dados
      // Roda em naruto-pl.oasgames.com (mesmo host do jogo, não dá pra bloquear domínio)
      expect(
        shouldBlock(
          'https://naruto-pl.oasgames.com/oss_report.fcgi?uin=1612222&role_id=0&svr_id=306'
        )
      ).toBe(true);
      expect(shouldBlock('https://naruto.oasgames.com/oss_report.fcgi?log_id=101002')).toBe(true);
    });

    test('v5.9.9: bloqueia crossdomain.xml em qualquer host (Flash policy sempre falha)', () => {
      expect(shouldBlock('https://naruto-pl.oasgames.com/crossdomain.xml')).toBe(true);
      expect(shouldBlock('https://report.huoying.qq.com/crossdomain.xml')).toBe(true);
      expect(shouldBlock('http://img.oasgames.com/crossdomain.xml')).toBe(true);
    });

    test('v5.9.9: não bloqueia paths legítimos do jogo no mesmo host', () => {
      expect(shouldBlock('https://naruto-pl.oasgames.com/main.html')).toBe(false);
      expect(shouldBlock('https://naruto-pl.oasgames.com/static/css/basic.css')).toBe(false);
      expect(shouldBlock('https://naruto-pl.oasgames.com/api/instance/list')).toBe(false);
    });

    test('não bloqueia oasgames.com', () => {
      expect(shouldBlock('https://naruto.oasgames.com/')).toBe(false);
    });
  });

  describe('v5.9.9: BLOCKED_PATH_PATTERNS', () => {
    test('é um array de regexes', () => {
      expect(Array.isArray(BLOCKED_PATH_PATTERNS)).toBe(true);
      expect(BLOCKED_PATH_PATTERNS.length).toBeGreaterThan(0);
      BLOCKED_PATH_PATTERNS.forEach(function (p) {
        expect(p instanceof RegExp).toBe(true);
      });
    });

    test('contém pattern para oss_report.fcgi', () => {
      expect(
        BLOCKED_PATH_PATTERNS.some(function (p) {
          return p.test('/oss_report.fcgi?uin=1');
        })
      ).toBe(true);
    });

    test('contém pattern para crossdomain.xml', () => {
      expect(
        BLOCKED_PATH_PATTERNS.some(function (p) {
          return p.test('/crossdomain.xml');
        })
      ).toBe(true);
    });
  });

  describe('v5.9.9: isBlockedPath', () => {
    test('bloqueia /oss_report.fcgi', () => {
      expect(isBlockedPath('/oss_report.fcgi')).toBe(true);
      expect(isBlockedPath('/oss_report.fcgi?uin=1&svr_id=306')).toBe(true);
    });

    test('bloqueia /crossdomain.xml', () => {
      expect(isBlockedPath('/crossdomain.xml')).toBe(true);
    });

    test('não bloqueia paths legítimos', () => {
      expect(isBlockedPath('/main.html')).toBe(false);
      expect(isBlockedPath('/api/game/list')).toBe(false);
      expect(isBlockedPath('/static/css/basic.css')).toBe(false);
    });

    test('não bloqueia path vazio', () => {
      expect(isBlockedPath('')).toBe(false);
      expect(isBlockedPath('/')).toBe(false);
    });
  });

  describe('shouldBlock edge cases', () => {
    test('bloqueia URL inválida (fail-closed)', () => {
      expect(shouldBlock('not-a-url')).toBe(true);
    });

    test('bloqueia URL vazia (fail-closed)', () => {
      expect(shouldBlock('')).toBe(true);
    });
  });

  describe('setupBlocker', () => {
    test('returns true on first call and registers webRequest handler', () => {
      var mockSession = {
        webRequest: { onBeforeRequest: jest.fn() }
      };
      var result = setupBlocker(mockSession);
      expect(result).toBe(true);
      expect(mockSession.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1);
    });

    test('returns false on second call (idempotent)', () => {
      var mockSession = {
        webRequest: { onBeforeRequest: jest.fn() }
      };
      setupBlocker(mockSession);
      var result = setupBlocker(mockSession);
      expect(result).toBe(false);
      // onBeforeRequest still called only once (from first setupBlocker)
      expect(mockSession.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1);
    });

    test('webRequest handler cancels blocked domain, passes allowed', () => {
      var mockSession = {
        webRequest: { onBeforeRequest: jest.fn() }
      };
      setupBlocker(mockSession);
      var handler = mockSession.webRequest.onBeforeRequest.mock.calls[0][0];
      var mockCallback = jest.fn();

      // Blocked URL
      handler({ url: 'https://www.google-analytics.com/track' }, mockCallback);
      expect(mockCallback).toHaveBeenCalledWith({ cancel: true });

      // Allowed URL
      mockCallback.mockClear();
      handler({ url: 'https://naruto.oasgames.com/game' }, mockCallback);
      expect(mockCallback).toHaveBeenCalledWith({ cancel: false });
    });

    test('webRequest handler replaces logintype=3 with logintype=4', () => {
      var mockSession = {
        webRequest: { onBeforeRequest: jest.fn() }
      };
      setupBlocker(mockSession);
      var handler = mockSession.webRequest.onBeforeRequest.mock.calls[0][0];
      var mockCallback = jest.fn();

      handler({ url: 'https://game.com/login?logintype=3&server=1' }, mockCallback);
      expect(mockCallback).toHaveBeenCalledWith({
        redirectURL: 'https://game.com/login?logintype=4&server=1'
      });
    });

    test('does not replace logintype=30 (boundary-aware) but still redirects', () => {
      var mockSession = {
        webRequest: { onBeforeRequest: jest.fn() }
      };
      setupBlocker(mockSession);
      var handler = mockSession.webRequest.onBeforeRequest.mock.calls[0][0];
      var mockCallback = jest.fn();

      handler({ url: 'https://game.com/login?logintype=30' }, mockCallback);
      // includes('logintype=3') is true for logintype=30, so it enters the block,
      // but regex logintype=3(?=[&#]|$) doesn't match (3 is followed by 0).
      // replaced === url, so it falls through to cancel:false (no infinite redirect).
      expect(mockCallback).toHaveBeenCalledWith({ cancel: false });
    });

    test('handles logintype=3#fragment without infinite redirect', () => {
      var mockSession = {
        webRequest: { onBeforeRequest: jest.fn() }
      };
      setupBlocker(mockSession);
      var handler = mockSession.webRequest.onBeforeRequest.mock.calls[0][0];
      var mockCallback = jest.fn();

      // Old regex (?=&|$) missed # — caused infinite self-redirect loop.
      // New regex (?=[&#]|$) correctly handles # as boundary.
      handler({ url: 'https://game.com/login?logintype=3#section' }, mockCallback);
      expect(mockCallback).toHaveBeenCalledWith({
        redirectURL: 'https://game.com/login?logintype=4#section'
      });
    });
  });

  describe('forgetSession', () => {
    test('allows setupBlocker to run again after forget', () => {
      var mockSession = {
        webRequest: { onBeforeRequest: jest.fn() }
      };
      expect(setupBlocker(mockSession)).toBe(true);
      expect(setupBlocker(mockSession)).toBe(false);
      forgetSession(mockSession);
      expect(setupBlocker(mockSession)).toBe(true);
    });
  });
});
