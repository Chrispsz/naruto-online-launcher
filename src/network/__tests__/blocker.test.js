/**
 * Testes para src/network/blocker.js
 */

const { BLOCKED_DOMAINS, DomainTrie, shouldBlock } = require('../blocker');

describe('blocker.js', () => {
  describe('BLOCKED_DOMAINS', () => {
    test('é um array', () => {
      expect(Array.isArray(BLOCKED_DOMAINS)).toBe(true);
    });

    test('contém domínios de analytics', () => {
      expect(BLOCKED_DOMAINS).toContain('google-analytics.com');
      expect(BLOCKED_DOMAINS).toContain('googletagmanager.com');
    });

    test('contém domínios de ads', () => {
      expect(BLOCKED_DOMAINS).toContain('doubleclick.net');
      expect(BLOCKED_DOMAINS).toContain('googlesyndication.com');
    });

    test('contém domínios de social tracking', () => {
      expect(BLOCKED_DOMAINS).toContain('facebook.com');
      expect(BLOCKED_DOMAINS).toContain('connect.facebook.net');
    });
  });

  describe('DomainTrie', () => {
    test('matches hostname correto', () => {
      const trie = new DomainTrie();
      trie.add('google.com');
      
      expect(trie.matches('google.com')).toBe(true);
      expect(trie.matches('www.google.com')).toBe(true);
      expect(trie.matches('mail.google.com')).toBe(true);
    });

    test('não match hostname diferente', () => {
      const trie = new DomainTrie();
      trie.add('google.com');
      
      expect(trie.matches('yahoo.com')).toBe(false);
      expect(trie.matches('google.org')).toBe(false);
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
