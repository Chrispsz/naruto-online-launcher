/**
 * Testes para src/ui/manager/KeyboardShortcuts.js (Fase 3d split)
 * Verifica F5 clear login (callback + fallback), F12 DevTools, Alt+F4 close, e bloqueios.
 */

const KeyboardShortcuts = require('../KeyboardShortcuts');

function makeMockWin() {
  let handler = null;
  const wc = {
    on: jest.fn((evt, fn) => {
      if (evt === 'before-input-event') handler = fn;
    }),
    reload: jest.fn(),
    toggleDevTools: jest.fn(),
    executeJavaScript: jest.fn(() => Promise.resolve())
  };
  const win = {
    webContents: wc,
    close: jest.fn(),
    isDestroyed: jest.fn(() => false)
  };
  return { win, wc, getHandler: () => handler };
}

function makeMockSession() {
  return {
    clearStorageData: jest.fn(() => Promise.resolve()),
    clearCache: jest.fn(() => Promise.resolve())
  };
}

function fire(handler, input) {
  const event = { preventDefault: jest.fn() };
  handler(event, input);
  return event;
}

describe('KeyboardShortcuts.js', () => {
  test('attach registra handler before-input-event no webContents', () => {
    const { win, wc } = makeMockWin();
    KeyboardShortcuts.attach(win, 'TestProfile');
    expect(wc.on).toHaveBeenCalledWith('before-input-event', expect.any(Function));
  });

  test('attach com win nulo não lança', () => {
    expect(() => KeyboardShortcuts.attach(null, 'x')).not.toThrow();
  });

  describe('F5 → clear login', () => {
    test('F5 com onClearLogin callback delega pro callback (não faz reload direto)', () => {
      // v5.9.7: quando o Launcher passa um callback, F5 delega pra ele
      // (Launcher faz clear + pré-auth via API antes de recarregar — igual ao Play).
      const { win, wc, getHandler } = makeMockWin();
      const ses = makeMockSession();
      const onClearLogin = jest.fn();
      KeyboardShortcuts.attach(win, 'TestProfile', ses, onClearLogin);

      const ev = fire(getHandler(), { key: 'F5', control: false, alt: false, shift: false });
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(onClearLogin).toHaveBeenCalledTimes(1);
      // Não deve chamar o clear/reload manual — responsabilidade do callback agora.
      expect(ses.clearStorageData).not.toHaveBeenCalled();
      expect(ses.clearCache).not.toHaveBeenCalled();
      expect(wc.reload).not.toHaveBeenCalled();
    });

    test('F5 com callback que lança faz fallback pra reload direto', () => {
      // Se o callback quebra, F5 ainda recarrega (não deixa o usuário sem ação).
      const { win, wc, getHandler } = makeMockWin();
      const ses = makeMockSession();
      const onClearLogin = jest.fn(() => {
        throw new Error('mock fail');
      });
      KeyboardShortcuts.attach(win, 'TestProfile', ses, onClearLogin);

      const ev = fire(getHandler(), { key: 'F5', control: false, alt: false, shift: false });
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(onClearLogin).toHaveBeenCalledTimes(1);
      expect(wc.reload).toHaveBeenCalledTimes(1);
    });

    test('F5 sem callback (fallback) limpa storage da session e recarrega', async () => {
      // Comportamento pré-v5.9.7: clear + reload direto (sem pré-auth).
      const { win, wc, getHandler } = makeMockWin();
      const ses = makeMockSession();
      KeyboardShortcuts.attach(win, 'TestProfile', ses);
      const ev = fire(getHandler(), { key: 'F5', control: false, alt: false, shift: false });
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(ses.clearStorageData).toHaveBeenCalledWith({
        storages: ['cookies', 'localstorage', 'sessionstorage']
      });
      expect(ses.clearCache).toHaveBeenCalled();
      // reload é chamado após as promises resolversem
      await new Promise(function (r) {
        setTimeout(r, 10);
      });
      // F5 agora limpa onbeforeunload antes de recarregar
      expect(wc.executeJavaScript).toHaveBeenCalledWith(
        'window.onbeforeunload = null; window.onunload = null;'
      );
      expect(wc.reload).toHaveBeenCalled();
    });

    test('F5 sem session e sem callback faz reload direto (fallback)', () => {
      const { win, wc, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'F5', control: false, alt: false, shift: false });
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(wc.reload).toHaveBeenCalled();
    });

    test('Ctrl+F5 NÃO recarrega (deixa o Chromium tratar)', () => {
      const { win, wc, getHandler } = makeMockWin();
      const ses = makeMockSession();
      const onClearLogin = jest.fn();
      KeyboardShortcuts.attach(win, 'TestProfile', ses, onClearLogin);
      const ev = fire(getHandler(), { key: 'F5', control: true, alt: false, shift: false });
      expect(ev.preventDefault).not.toHaveBeenCalled();
      expect(wc.reload).not.toHaveBeenCalled();
      expect(onClearLogin).not.toHaveBeenCalled();
    });
  });

  describe('F12 → toggle DevTools', () => {
    test('F12 (sem modificadores) chama toggleDevTools', () => {
      const { win, wc, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'F12', control: false, alt: false, shift: false });
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(wc.toggleDevTools).toHaveBeenCalled();
    });
  });

  describe('Alt+F4 → close', () => {
    test('Alt+F4 chama win.close', () => {
      const { win, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'F4', alt: true, control: false, shift: false });
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(win.close).toHaveBeenCalled();
    });
  });

  describe('Bloqueios', () => {
    test('F10 é bloqueado', () => {
      const { win, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'F10', control: false, alt: false, shift: false });
      expect(ev.preventDefault).toHaveBeenCalled();
    });

    test('Ctrl+Shift+I é bloqueado (use F12)', () => {
      const { win, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'I', control: true, alt: false, shift: true });
      expect(ev.preventDefault).toHaveBeenCalled();
    });

    test('Ctrl+Shift+J é bloqueado', () => {
      const { win, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'J', control: true, alt: false, shift: true });
      expect(ev.preventDefault).toHaveBeenCalled();
    });

    test('Alt sozinho (sem F4) é bloqueado (menu toggle)', () => {
      const { win, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'Alt', alt: true, control: false, shift: false });
      expect(ev.preventDefault).toHaveBeenCalled();
    });
  });

  describe('teclas normais não são interceptadas', () => {
    test('letra "a" sem modificadores passa direto', () => {
      const { win, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'a', control: false, alt: false, shift: false });
      expect(ev.preventDefault).not.toHaveBeenCalled();
    });

    test('Enter passa direto', () => {
      const { win, getHandler } = makeMockWin();
      KeyboardShortcuts.attach(win, 'TestProfile');
      const ev = fire(getHandler(), { key: 'Enter', control: false, alt: false, shift: false });
      expect(ev.preventDefault).not.toHaveBeenCalled();
    });
  });
});
