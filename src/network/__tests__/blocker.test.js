/**
 * Testes para src/network/blocker.js
 */

const { BLOCK_DOMAINS, shouldBlock } = require('../blocker');

describe('blocker.js', () => {
  describe('BLOCK_DOMAINS', () => {
    test('é um Set', () => {
      expect(BLOCK_DOMAINS).toBeInstanceOf(Set);
    });

    test('contém domínios de analytics', () => {
      expect(BLOCK_DOMAINS.has('google-analytics.com')).toBe(true);
      expect(BLOCK_DOMAINS.has('googletagmanager.com')).toBe(true);
    });

    test('contém domínios de ads', () => {
      expect(BLOCK_DOMAINS.has('doubleclick.net')).toBe(true);
      expect(BLOCK_DOMAINS.has('googlesyndication.com')).toBe(true);
    });

    test('contém domínios de social tracking', () => {
      expect(BLOCK_DOMAINS.has('facebook.com/tr')).toBe(true);
      expect(BLOCK_DOMAINS.has('connect.facebook.net')).toBe(true);
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
