/**
 * Testes para src/network/blocker.js
 */

const { BLOCKED_DOMAINS, isBlockedDomain, shouldBlock } = require('../blocker');

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
      expect(BLOCKED_DOMAINS.has('facebook.com')).toBe(true);
      expect(BLOCKED_DOMAINS.has('connect.facebook.net')).toBe(true);
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

    test('bloqueia Facebook connect', () => {
      expect(shouldBlock('https://connect.facebook.net/en_US/fbevents.js')).toBe(true);
    });

    test('bloqueia mdata.cool', () => {
      expect(shouldBlock('https://collect.mdata.cool/track')).toBe(true);
    });

    test('não bloqueia domínios do jogo', () => {
      expect(shouldBlock('https://naruto.narutowebgame.com/game')).toBe(false);
    });

    test('não bloqueia oasgames.com', () => {
      expect(shouldBlock('https://naruto.oasgames.com/')).toBe(false);
    });

    test('retorna false para URL inválida', () => {
      expect(shouldBlock('not-a-url')).toBe(false);
    });

    test('retorna false para URL vazia', () => {
      expect(shouldBlock('')).toBe(false);
    });
  });
});
