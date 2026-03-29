/**
 * Testes para src/window/dialogs.js
 */

const { getGameUrl, BASE_URL, LAUNCHER_PARAMS } = require('../dialogs');

describe('dialogs.js', () => {
  describe('getGameUrl', () => {
    test('retorna URL correta para região pt', () => {
      const url = getGameUrl('pt');
      expect(url).toContain(BASE_URL);
      expect(url).toContain('/pt/');
      expect(url).toContain(LAUNCHER_PARAMS);
    });

    test('retorna URL correta para região en', () => {
      const url = getGameUrl('en');
      expect(url).toContain('/en/');
    });

    test('inclui logintype=4', () => {
      const url = getGameUrl('pt');
      expect(url).toContain('logintype=4');
    });
  });

  describe('constants', () => {
    test('BASE_URL está correto', () => {
      expect(BASE_URL).toBe('https://naruto.narutowebgame.com');
    });

    test('LAUNCHER_PARAMS inclui logintype=4', () => {
      expect(LAUNCHER_PARAMS).toContain('logintype=4');
    });
  });
});
