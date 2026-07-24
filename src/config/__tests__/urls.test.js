/**
 * Testes para src/config/urls.js — Game URL builder
 */

'use strict';

const urls = require('../urls');

describe('urls.js', () => {
  describe('getGameUrl', () => {
    test('retorna URL com região padrão br quando região não informada', () => {
      const result = urls.getGameUrl(null, 'pt');
      expect(result).toContain('narutowebgame.com/pt/serverlist');
      expect(result).toContain('logintype=4');
    });

    test('retorna URL com servidor normalizado (número sem "s")', () => {
      const result = urls.getGameUrl('br', 'pt', '799');
      expect(result).toContain('/s799?');
    });

    test('retorna URL com servidor normalizado (já com "s")', () => {
      const result = urls.getGameUrl('br', 'pt', 's799');
      expect(result).toContain('/s799?');
    });

    test('retorna URL com servidor normalizado (maiúsculo)', () => {
      const result = urls.getGameUrl('br', 'pt', 'S799');
      expect(result).toContain('/s799?');
    });

    test('retorna URL sem servidor quando server é undefined', () => {
      const result = urls.getGameUrl('br', 'pt');
      expect(result).toMatch(/serverlist\?/);
      // Não deve ter caminho de servidor (/s799 etc)
      expect(result).not.toMatch(/serverlist\/s\d/);
    });

    test('fallback para br quando região inválida', () => {
      const result = urls.getGameUrl('xx', 'pt');
      expect(result).toContain('narutowebgame.com/pt/serverlist');
    });
  });

  describe('getServerlistUrl', () => {
    test('retorna URL br para região br', () => {
      expect(urls.getServerlistUrl('br')).toContain('narutowebgame.com/pt/serverlist');
    });

    test('fallback para br quando região inexistente', () => {
      const invalid = urls.getServerlistUrl('invalid');
      const br = urls.getServerlistUrl('br');
      expect(invalid).toBe(br);
    });
  });

  describe('getGameCode', () => {
    test('retorna game code correto para br', () => {
      expect(urls.getGameCode('br')).toBe('narutopt');
    });

    test('fallback para br quando região inexistente', () => {
      expect(urls.getGameCode('invalid')).toBe('narutopt');
    });
  });

  describe('getLauncherParams', () => {
    test('inclui logintype=4', () => {
      expect(urls.getLauncherParams()).toContain('logintype=4');
    });

    test('inclui launcher=shinobi', () => {
      expect(urls.getLauncherParams()).toContain('launcher=shinobi');
    });
  });
});
