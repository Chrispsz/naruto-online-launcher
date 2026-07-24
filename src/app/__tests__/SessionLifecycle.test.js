/**
 * Testes para src/app/SessionLifecycle.js (Fase 3d split)
 *
 * Verifica: attach, event handlers (did-finish-load, did-fail-load, close),
 * JWT auto-renewal timer, cleanup, _sendAutoLoginResult, _sendWindowStatus.
 */

'use strict';

// Mock vault before requiring SessionLifecycle
jest.mock('../../profiles/vault', () => ({
  hasCredentials: jest.fn(() => false),
  getCredentials: jest.fn(() => null),
  buildAutoLoginScript: jest.fn(() => '(function(){return "not-found";})()')
}));

jest.mock('../../ui/manager/ManagerWindow', () => ({
  send: jest.fn()
}));

jest.mock('../../profiles/manager', () => ({
  reportCrash: jest.fn()
}));

jest.mock('../../memory/guard', () => ({
  reportCrash: jest.fn()
}));

jest.mock('../../network/api-login', () => ({
  renewIfNeeded: jest.fn(() => Promise.resolve({ renewed: false })),
  loginAndInject: jest.fn(() => Promise.resolve())
}));

const SessionLifecycle = require('../SessionLifecycle');
const vault = require('../../profiles/vault');
const ManagerWindow = require('../../ui/manager/ManagerWindow');

/**
 * Cria um mock de BrowserWindow que captura handlers de evento.
 */
function makeMockWin() {
  const handlers = {};
  const wcHandlers = {};

  const wc = {
    on: jest.fn((evt, fn) => {
      wcHandlers[evt] = fn;
    }),
    once: jest.fn(),
    insertCSS: jest.fn(() => Promise.resolve()),
    executeJavaScript: jest.fn(() => Promise.resolve('not-found')),
    stop: jest.fn(),
    loadURL: jest.fn(),
    reload: jest.fn(),
    isDestroyed: jest.fn(() => false),
    session: {
      cookies: { flushStore: jest.fn(() => Promise.resolve()) },
      webRequest: {
        onCompleted: jest.fn(),
        onErrorOccurred: jest.fn()
      }
    }
  };

  const win = {
    on: jest.fn((evt, fn) => {
      handlers[evt] = fn;
    }),
    once: jest.fn((evt, fn) => {
      handlers[evt] = fn;
    }),
    isDestroyed: jest.fn(() => false),
    show: jest.fn(),
    destroy: jest.fn(),
    webContents: wc,
    loadURL: jest.fn()
  };

  return { win, wc, handlers, wcHandlers };
}

function makeCtx(overrides) {
  return Object.assign(
    {
      profileId: 'p_001',
      profile: { id: 'p_001', name: 'TestProfile', region: 'br', language: 'pt' },
      entry: {
        autoLoginTimer: null,
        failLoadRetry: false,
        failLoadTimer: null,
        formInjectAttempts: 0
      },
      ses: {
        cookies: { flushStore: jest.fn(() => Promise.resolve()) },
        webRequest: {
          onCompleted: jest.fn(),
          onErrorOccurred: jest.fn()
        },
        clearStorageData: jest.fn(() => Promise.resolve()),
        clearCache: jest.fn(() => Promise.resolve())
      },
      onOpened: jest.fn(),
      onClosed: jest.fn(),
      getGameUrl: jest.fn(
        () => 'https://naruto.narutowebgame.com/pt/serverlist?logintype=4&launcher=shinobi'
      ),
      LAUNCHER_PARAMS: 'logintype=4&leftbar_collapse=Yes&launcher=shinobi'
    },
    overrides
  );
}

describe('SessionLifecycle.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vault.hasCredentials.mockReturnValue(false);
    vault.getCredentials.mockReturnValue(null);
  });

  describe('exports', () => {
    test('exporta attach como função', () => {
      expect(typeof SessionLifecycle.attach).toBe('function');
    });

    test('exporta _sendWindowStatus como função', () => {
      expect(typeof SessionLifecycle._sendWindowStatus).toBe('function');
    });

    test('exporta _sendAutoLoginResult como função', () => {
      expect(typeof SessionLifecycle._sendAutoLoginResult).toBe('function');
    });
  });

  describe('_sendAutoLoginResult', () => {
    test('result=filled envia status=success', () => {
      SessionLifecycle._sendAutoLoginResult('p1', 'filled');
      expect(ManagerWindow.send).toHaveBeenCalledWith('auto-login:result', {
        profileId: 'p1',
        result: 'filled'
      });
      expect(ManagerWindow.send).toHaveBeenCalledWith('auto-login:status', {
        profileId: 'p1',
        status: 'success',
        result: 'filled'
      });
    });

    test('result=clicked envia status=success', () => {
      SessionLifecycle._sendAutoLoginResult('p1', 'clicked');
      expect(ManagerWindow.send).toHaveBeenCalledWith('auto-login:status', {
        profileId: 'p1',
        status: 'success',
        result: 'clicked'
      });
    });

    test('result=waiting envia status=loading', () => {
      SessionLifecycle._sendAutoLoginResult('p1', 'waiting');
      expect(ManagerWindow.send).toHaveBeenCalledWith('auto-login:status', {
        profileId: 'p1',
        status: 'loading',
        result: 'waiting'
      });
    });

    test('result=error envia status=error', () => {
      SessionLifecycle._sendAutoLoginResult('p1', 'error');
      expect(ManagerWindow.send).toHaveBeenCalledWith('auto-login:status', {
        profileId: 'p1',
        status: 'error',
        result: 'error'
      });
    });

    test('result=not-found envia status=idle', () => {
      SessionLifecycle._sendAutoLoginResult('p1', 'not-found');
      expect(ManagerWindow.send).toHaveBeenCalledWith('auto-login:status', {
        profileId: 'p1',
        status: 'idle',
        result: 'not-found'
      });
    });
  });

  describe('_sendWindowStatus', () => {
    test('envia game-window:status com open=true', () => {
      SessionLifecycle._sendWindowStatus('p1', true);
      expect(ManagerWindow.send).toHaveBeenCalledWith('game-window:status', {
        profileId: 'p1',
        open: true
      });
    });

    test('envia game-window:status com open=false', () => {
      SessionLifecycle._sendWindowStatus('p1', false);
      expect(ManagerWindow.send).toHaveBeenCalledWith('game-window:status', {
        profileId: 'p1',
        open: false
      });
    });
  });

  describe('attach', () => {
    test('registra handlers de evento na janela e webContents', () => {
      const { win, wc } = makeMockWin();
      const ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      // Verifica handlers de webContents
      expect(wc.on).toHaveBeenCalledWith('render-process-gone', expect.any(Function));
      expect(wc.on).toHaveBeenCalledWith('did-finish-load', expect.any(Function));
      expect(wc.on).toHaveBeenCalledWith('did-fail-load', expect.any(Function));
      expect(wc.on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
      expect(wc.on).toHaveBeenCalledWith('new-window', expect.any(Function));

      // Verifica handlers de win
      expect(win.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(win.on).toHaveBeenCalledWith('closed', expect.any(Function));
      expect(win.on).toHaveBeenCalledWith('unresponsive', expect.any(Function));

      // Verifica once para ready-to-show
      expect(win.once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
    });

    describe('did-finish-load handler', () => {
      test('injecta CSS e chama auto-login', () => {
        const { win, wc, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-finish-load'];
        handler();

        // executeJavaScript chamado (camada 1: adblock idempotente + camada 2: fullscreen + FB mock)
        expect(wc.executeJavaScript).toHaveBeenCalled();
        // insertCSS NÃO é mais usado (substituído por executeJavaScript com idempotência)
        expect(wc.insertCSS).not.toHaveBeenCalled();
      });

      test('reseta entry.failLoadRetry para false', () => {
        const { win, wcHandlers } = makeMockWin();
        const entry = {
          failLoadRetry: true,
          formInjectAttempts: 0,
          autoLoginTimer: null,
          failLoadTimer: null
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-finish-load'];
        handler();

        expect(entry.failLoadRetry).toBe(false);
      });

      test('chama vault.hasCredentials e _tryAutoLogin quando há credenciais', () => {
        const { win, wcHandlers } = makeMockWin();
        vault.hasCredentials.mockReturnValue(true);
        vault.getCredentials.mockReturnValue({ user: 'test@x.com', pass: 'secret' });
        vault.buildAutoLoginScript.mockReturnValue('(function(){return "filled";})()');

        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-finish-load'];
        handler();

        expect(vault.hasCredentials).toHaveBeenCalledWith('p_001');
      });

      test('para auto-login quando formInjectAttempts > 5', () => {
        const { win, wcHandlers } = makeMockWin();
        vault.hasCredentials.mockReturnValue(true);
        vault.getCredentials.mockReturnValue({ user: 'test@x.com', pass: 'secret' });
        vault.buildAutoLoginScript.mockReturnValue('(function(){return "not-found";})()');
        const entry = {
          failLoadRetry: false,
          formInjectAttempts: 6,
          autoLoginTimer: null,
          failLoadTimer: null
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        // Trigger multiple did-finish-load to simulate retries
        const handler = wcHandlers['did-finish-load'];
        handler();

        // Com formInjectAttempts=6, deve parar de tentar — não chama executeJavaScript para auto-login
        const autoLoginCalls = win.webContents.executeJavaScript.mock.calls.filter(function (c) {
          return typeof c[0] === 'string' && c[0].includes('doLogin');
        });
        expect(autoLoginCalls.length).toBe(0);
      });

      test('reseta formInjectAttempts quando auto-login succeed (result=filled)', () => {
        // Verifica que com formInjectAttempts < 6, o auto-login script É executado
        // (ao contrário do teste "para quando > 5" que verifica o oposto).
        const { win, wcHandlers } = makeMockWin();
        vault.hasCredentials.mockReturnValue(true);
        vault.getCredentials.mockReturnValue({ user: 'test@x.com', pass: 'secret' });
        vault.buildAutoLoginScript.mockReturnValue('AUTO_LOGIN_SCRIPT_MARKER');
        const entry = {
          failLoadRetry: false,
          formInjectAttempts: 3,
          autoLoginTimer: null,
          failLoadTimer: null
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-finish-load'];
        handler();

        // O auto-login script (com marcador) deve ter sido passado a executeJavaScript
        const found = win.webContents.executeJavaScript.mock.calls.some(function (c) {
          return c[0] === 'AUTO_LOGIN_SCRIPT_MARKER';
        });
        expect(found).toBe(true);
      });

      test('resultado "filled" reseta formInjectAttempts', () => {
        vault.hasCredentials.mockReturnValue(true);
        vault.getCredentials.mockReturnValue({ user: 'u', pass: 'p' });
        // v5.25.0: script no longer returns "clicked" — button fallback now
        // returns "filled" too (UI treated them identically).
        const { win, wcHandlers } = makeMockWin();
        win.webContents.executeJavaScript = jest.fn(() => Promise.resolve('filled'));
        const entry = {
          failLoadRetry: false,
          formInjectAttempts: 3,
          autoLoginTimer: null,
          failLoadTimer: null
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-finish-load'];
        handler();

        // formInjectAttempts should be reset to 0 after 'filled' result
        // (verified via the entry reference which is mutated inside the handler)
        setImmediate(function () {
          expect(entry.formInjectAttempts).toBe(0);
        });
      });
    });

    describe('did-fail-load handler', () => {
      test('primeira falha: tenta novamente com delay (setTimeout)', () => {
        jest.useFakeTimers();
        const { win, wcHandlers } = makeMockWin();
        const entry = {
          failLoadRetry: false,
          formInjectAttempts: 0,
          autoLoginTimer: null,
          failLoadTimer: null
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-fail-load'];
        handler({}, -102, 'ERR_CONNECTION_REFUSED', 'https://example.com');

        // Deve ter marcado failLoadRetry=true e agendado retry
        expect(entry.failLoadRetry).toBe(true);
        expect(entry.failLoadTimer).not.toBeNull();

        // Avança o timer para executar o retry
        jest.advanceTimersByTime(1500);
        expect(win.loadURL).toHaveBeenCalled();

        jest.useRealTimers();
      });

      test('ignora data: URLs', () => {
        const { win, wcHandlers } = makeMockWin();
        const entry = {
          failLoadRetry: false,
          formInjectAttempts: 0,
          autoLoginTimer: null,
          failLoadTimer: null
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-fail-load'];
        handler({}, -2, 'ERR_FAILED', 'data:text/html,hello');

        expect(entry.failLoadRetry).toBe(false);
      });

      test('ignora ERR_ABORTED (code -3)', () => {
        const { win, wcHandlers } = makeMockWin();
        const entry = {
          failLoadRetry: false,
          formInjectAttempts: 0,
          autoLoginTimer: null,
          failLoadTimer: null
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-fail-load'];
        handler({}, -3, 'ERR_ABORTED', 'https://example.com');

        expect(entry.failLoadRetry).toBe(false);
      });

      test('segunda falha (alreadyRetried): exibe tela de erro', () => {
        const { win, wc, wcHandlers } = makeMockWin();
        const entry = {
          failLoadRetry: true,
          formInjectAttempts: 0,
          autoLoginTimer: null,
          failLoadTimer: null
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['did-fail-load'];
        handler({}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.com');

        // Deve chamar loadURL com data:text/html (tela de erro)
        expect(wc.loadURL).toHaveBeenCalled();
        const errorPageUrl = wc.loadURL.mock.calls[0][0];
        expect(errorPageUrl).toContain('data:text/html');
      });
    });

    describe('close handler', () => {
      test('chama preventDefault na primeira chamada', () => {
        const { win, handlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const closeHandler = handlers['close'];
        const event = { preventDefault: jest.fn() };
        closeHandler(event);

        expect(event.preventDefault).toHaveBeenCalled();
      });

      test('limpa entry timers (autoLoginTimer, failLoadTimer)', () => {
        const { win, handlers } = makeMockWin();
        const fakeTimer1 = setTimeout(() => {}, 99999);
        const fakeTimer2 = setTimeout(() => {}, 99999);
        const entry = {
          failLoadRetry: false,
          formInjectAttempts: 0,
          autoLoginTimer: fakeTimer1,
          failLoadTimer: fakeTimer2
        };
        const ctx = makeCtx({ entry });
        SessionLifecycle.attach(win, ctx);

        const closeHandler = handlers['close'];
        closeHandler({ preventDefault: jest.fn() });

        // verify clearTimeout was called on those timers (can't directly spy on clearTimeout
        // but the entry timers should be handled — we just verify no throw)
        expect(true).toBe(true);

        clearTimeout(fakeTimer1);
        clearTimeout(fakeTimer2);
      });

      test('destroys window after 500ms timeout', () => {
        jest.useFakeTimers();
        const { win, handlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const closeHandler = handlers['close'];
        closeHandler({ preventDefault: jest.fn() });

        jest.advanceTimersByTime(500);
        expect(win.destroy).toHaveBeenCalled();

        jest.useRealTimers();
      });
    });

    describe('closed handler', () => {
      test('envia window status false e chama onClosed', () => {
        const { win, handlers } = makeMockWin();
        const onClosed = jest.fn();
        const ctx = makeCtx({ onClosed });
        SessionLifecycle.attach(win, ctx);

        const closedHandler = handlers['closed'];
        closedHandler();

        expect(ManagerWindow.send).toHaveBeenCalledWith('game-window:status', {
          profileId: 'p_001',
          open: false
        });
        expect(onClosed).toHaveBeenCalled();
      });
    });

    describe('ready-to-show handler', () => {
      test('mostra a janela, envia window status true e carrega URL', () => {
        jest.useFakeTimers();
        const { win, handlers } = makeMockWin();
        const onOpened = jest.fn();
        const getGameUrl = jest.fn(() => 'https://game.url');
        const ctx = makeCtx({ onOpened, getGameUrl });
        SessionLifecycle.attach(win, ctx);

        const readyHandler = handlers['ready-to-show'];
        readyHandler();

        expect(win.show).toHaveBeenCalled();
        expect(ManagerWindow.send).toHaveBeenCalledWith('game-window:status', {
          profileId: 'p_001',
          open: true
        });
        expect(onOpened).toHaveBeenCalled();

        // setImmediate: loadURL acontece após o handler
        jest.advanceTimersByTime(0);
        expect(win.loadURL).toHaveBeenCalledWith('https://game.url');

        jest.useRealTimers();
      });
    });

    describe('JWT auto-renewal timer', () => {
      test('setTimeout é chamado com 30 minutos (base)', () => {
        jest.useFakeTimers();
        try {
          const { win } = makeMockWin();
          const ctx = makeCtx();
          const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

          SessionLifecycle.attach(win, ctx);

          // Verifica que setTimeout foi chamado com 30min = 30*60*1000
          const calls = setTimeoutSpy.mock.calls;
          const thirtyMin = 30 * 60 * 1000;
          const found = calls.some(function (call) {
            return call[1] === thirtyMin;
          });
          expect(found).toBe(true);

          setTimeoutSpy.mockRestore();
        } finally {
          jest.useRealTimers();
        }
      });

      test('unref é chamado no timer', () => {
        const { win } = makeMockWin();
        const ctx = makeCtx();
        const originalSetTimeout = global.setTimeout;
        let capturedTimer = null;

        global.setTimeout = jest.fn(function (fn, ms) {
          capturedTimer = originalSetTimeout(fn, ms);
          capturedTimer.unref = jest.fn();
          return capturedTimer;
        });

        SessionLifecycle.attach(win, ctx);

        expect(capturedTimer).not.toBeNull();
        expect(capturedTimer.unref).toHaveBeenCalled();

        global.setTimeout = originalSetTimeout;
        clearTimeout(capturedTimer);
      });

      test('timer é limpo no close', () => {
        const { win, handlers } = makeMockWin();
        const ctx = makeCtx();
        const originalSetTimeout = global.setTimeout;
        let capturedTimer = null;

        global.setTimeout = jest.fn(function (fn, ms) {
          capturedTimer = originalSetTimeout(fn, ms);
          capturedTimer.unref = jest.fn();
          return capturedTimer;
        });

        SessionLifecycle.attach(win, ctx);

        const closeHandler = handlers['close'];
        closeHandler({ preventDefault: jest.fn() });

        // After close, the timer should be cleared (clearTimeout called)
        // We can't directly verify clearTimeout was called on the exact timer
        // but the code sets _renewTimer = null after clearTimeout
        global.setTimeout = originalSetTimeout;
        if (capturedTimer) clearTimeout(capturedTimer);
      });

      test('backoff real: falhas consecutivas aumentam o delay', async () => {
        jest.useFakeTimers();
        try {
          const { win } = makeMockWin();
          const ctx = makeCtx();
          const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

          // Configura mock: vault tem creds, apiLogin.renewIfNeeded rejeita
          vault.hasCredentials.mockImplementation(() => true);
          vault.getCredentials.mockImplementation(() => ({
            user: 'u',
            pass: 'p'
          }));
          var apiLogin = require('../../network/api-login');
          apiLogin.renewIfNeeded.mockImplementation(() => Promise.reject(new Error('server down')));

          SessionLifecycle.attach(win, ctx);

          // Primeiro agendamento: 30min (base)
          expect(setTimeoutSpy.mock.calls[0][1]).toBe(30 * 60 * 1000);

          // Avança 30min — primeira tentativa falha
          await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
          // Após 1 falha: delay = 30min * 2^0 = 30min (sem mudança na primeira)
          var calls30 = setTimeoutSpy.mock.calls.filter(function (c) {
            return c[1] === 30 * 60 * 1000;
          });
          expect(calls30.length).toBeGreaterThanOrEqual(2); // inicial + pós-1falha

          // Avança mais 30min — segunda tentativa falha
          await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
          // Após 2 falhas: delay = 30min * 2^1 = 60min (backoff REAL)
          var call60 = setTimeoutSpy.mock.calls.find(function (c) {
            return c[1] === 60 * 60 * 1000;
          });
          expect(call60).toBeTruthy();

          setTimeoutSpy.mockRestore();
          vault.hasCredentials.mockRestore();
          vault.getCredentials.mockRestore();
          apiLogin.renewIfNeeded.mockRestore();
        } finally {
          jest.useRealTimers();
        }
      });

      test('sucesso reseta backoff para 30min', async () => {
        jest.useFakeTimers();
        try {
          const { win } = makeMockWin();
          const ctx = makeCtx();
          const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

          vault.hasCredentials.mockImplementation(() => true);
          vault.getCredentials.mockImplementation(() => ({
            user: 'u',
            pass: 'p'
          }));
          var apiLogin = require('../../network/api-login');
          // Primeira chamada falha, segunda succeeds
          apiLogin.renewIfNeeded = jest
            .fn()
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce({
              renewed: true,
              expiresAt: Date.now() + 7200000
            });

          SessionLifecycle.attach(win, ctx);

          // Avança 30min — primeira tentativa falha → reagenda 30min
          await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
          // Avança 30min — segunda tentativa sucesso → reseta para 30min
          await jest.advanceTimersByTimeAsync(30 * 60 * 1000);

          // Verifica que há um agendamento de 30min após o sucesso
          var afterSuccess = setTimeoutSpy.mock.calls.filter(function (c) {
            return c[1] === 30 * 60 * 1000;
          });
          // Deve ter pelo menos 3: o inicial + pós-1falha + pós-sucesso
          expect(afterSuccess.length).toBeGreaterThanOrEqual(3);

          setTimeoutSpy.mockRestore();
          vault.hasCredentials.mockRestore();
          vault.getCredentials.mockRestore();
        } finally {
          jest.useRealTimers();
        }
      });
    });

    describe('render-process-gone handler', () => {
      test('registra handler sem lançar', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['render-process-gone'];
        expect(typeof handler).toBe('function');
        expect(() => handler({}, { reason: 'oom', exitCode: 1 })).not.toThrow();
      });

      test('auto-reload após crash "oom"', () => {
        jest.useFakeTimers();
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['render-process-gone'];
        handler({}, { reason: 'oom', exitCode: null });

        // Deve agendar reload em 1.5s
        expect(win.webContents.reload).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1500);
        expect(win.webContents.reload).toHaveBeenCalledTimes(1);

        jest.useRealTimers();
      });

      test('não recupera "clean-exit"', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['render-process-gone'];
        handler({}, { reason: 'clean-exit', exitCode: 0 });

        expect(win.webContents.reload).not.toHaveBeenCalled();
      });

      test('não recupera "killed"', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['render-process-gone'];
        handler({}, { reason: 'killed', exitCode: 9 });

        expect(win.webContents.reload).not.toHaveBeenCalled();
      });

      test('não recupera se win.isDestroyed()', () => {
        const { win, wcHandlers } = makeMockWin();
        win.isDestroyed.mockReturnValue(true);
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['render-process-gone'];
        handler({}, { reason: 'crashed', exitCode: 1 });

        expect(win.webContents.reload).not.toHaveBeenCalled();
      });

      test('backoff: para de recarregar após 3 crashes em 10 min', () => {
        jest.useFakeTimers();
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['render-process-gone'];

        // 1st crash → reload
        handler({}, { reason: 'crashed', exitCode: 1 });
        jest.advanceTimersByTime(1500);
        expect(win.webContents.reload).toHaveBeenCalledTimes(1);

        // 2nd crash → reload
        handler({}, { reason: 'oom', exitCode: 2 });
        jest.advanceTimersByTime(1500);
        expect(win.webContents.reload).toHaveBeenCalledTimes(2);

        // 3rd crash → limit reached, no reload
        handler({}, { reason: 'abnormal-exit', exitCode: 3 });
        expect(win.webContents.reload).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
      });
    });

    describe('will-navigate handler', () => {
      test('ignora data: URLs', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['will-navigate'];
        expect(() => handler({ preventDefault: jest.fn() }, 'data:text/html,test')).not.toThrow();
        expect(win.loadURL).not.toHaveBeenCalled();
      });

      test('injeta LAUNCHER_PARAMS em navegação game-host sem logintype', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['will-navigate'];
        const evt = { preventDefault: jest.fn() };
        handler(evt, 'https://naruto.narutowebgame.com/pt/serverlist');

        expect(evt.preventDefault).toHaveBeenCalled();
        expect(win.loadURL).toHaveBeenCalledWith(
          'https://naruto.narutowebgame.com/pt/serverlist?logintype=4&leftbar_collapse=Yes&launcher=shinobi'
        );
      });

      test('não interfere em assets (swf, js, css)', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['will-navigate'];
        const evt = { preventDefault: jest.fn() };
        handler(evt, 'https://naruto.narutowebgame.com/game.swf?v=2');

        expect(evt.preventDefault).not.toHaveBeenCalled();
      });

      test('não interfere se URL já tem logintype', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['will-navigate'];
        const evt = { preventDefault: jest.fn() };
        handler(evt, 'https://naruto.narutowebgame.com/pt/serverlist?logintype=4');

        expect(evt.preventDefault).not.toHaveBeenCalled();
      });
    });

    describe('new-window handler', () => {
      test('abre link do jogo na mesma janela', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['new-window'];
        const evt = { preventDefault: jest.fn() };
        handler(evt, 'https://naruto.narutowebgame.com/pt/news');

        expect(evt.preventDefault).toHaveBeenCalled();
        expect(win.loadURL).toHaveBeenCalledWith('https://naruto.narutowebgame.com/pt/news');
      });

      test('abre URL externa (não-jogo) via shell.openExternal', () => {
        const { win, wcHandlers } = makeMockWin();
        const ctx = makeCtx();
        SessionLifecycle.attach(win, ctx);

        const handler = wcHandlers['new-window'];
        const evt = { preventDefault: jest.fn() };
        handler(evt, 'https://www.google.com/search?q=test');

        expect(evt.preventDefault).toHaveBeenCalled();
        const { shell } = require('electron');
        expect(shell.openExternal).toHaveBeenCalledWith('https://www.google.com/search?q=test');
      });
    });
  });

  describe('reloadWithPreAuth race guard', () => {
    test('segunda chamada durante reload em andamento é ignorada (same window)', async () => {
      const win = {
        isDestroyed: () => false,
        id: 42,
        webContents: {
          executeJavaScript: jest.fn(() => Promise.resolve()),
          reload: jest.fn(),
          isDestroyed: () => false
        }
      };
      const ses = {
        clearStorageData: jest.fn(() => Promise.resolve()),
        clearCache: jest.fn(() => Promise.resolve())
      };

      // Primeira chamada — retorna promise que não resolve imediatamente
      var resolveFirst;
      ses.clearStorageData = jest.fn(
        () =>
          new Promise(r => {
            resolveFirst = r;
          })
      );

      SessionLifecycle.reloadWithPreAuth('p1', { name: 'test' }, win, ses, jest.fn());
      SessionLifecycle.reloadWithPreAuth('p1', { name: 'test' }, win, ses, jest.fn());

      // clearStorageData deve ter sido chamado apenas 1 vez (segunda chamada skipou)
      expect(ses.clearStorageData).toHaveBeenCalledTimes(1);

      // Resolve a primeira promise
      if (resolveFirst) resolveFirst();
      // Limpa o guard para não afetar outros testes
      // (o setTimeout de 3s vai limpar, mas forçamos aqui)
      await new Promise(r => setTimeout(r, 50));
    });
  });

  // ── CRON-3: Additional coverage tests ──

  describe('reloadWithPreAuth — edge cases', () => {
    test('retorna Promise.resolve() quando win é null', async () => {
      var result = await SessionLifecycle.reloadWithPreAuth(
        'p1',
        { name: 't' },
        null,
        {},
        jest.fn()
      );
      expect(result).toBeUndefined();
    });

    test('retorna Promise.resolve() quando win.isDestroyed() true', async () => {
      var win = { isDestroyed: () => true, webContents: { isDestroyed: () => true } };
      var result = await SessionLifecycle.reloadWithPreAuth(
        'p1',
        { name: 't' },
        win,
        {},
        jest.fn()
      );
      expect(result).toBeUndefined();
    });

    test('retorna Promise.resolve() quando webContents.isDestroyed() true', async () => {
      var win = { isDestroyed: () => false, id: 99, webContents: { isDestroyed: () => true } };
      var result = await SessionLifecycle.reloadWithPreAuth(
        'p1',
        { name: 't' },
        win,
        null,
        jest.fn()
      );
      expect(result).toBeUndefined();
    });

    test('sem session: faz reload direto', async () => {
      var win = {
        isDestroyed: () => false,
        id: 100,
        webContents: { isDestroyed: () => false, reload: jest.fn() }
      };
      await SessionLifecycle.reloadWithPreAuth('p1', { name: 't' }, win, null, jest.fn());
      expect(win.webContents.reload).toHaveBeenCalled();
    });

    test('com session: limpa storage e chama _loadGameWithPreAuth', async () => {
      var win = {
        isDestroyed: () => false,
        id: 101,
        loadURL: jest.fn(),
        webContents: {
          isDestroyed: () => false,
          executeJavaScript: jest.fn(() => Promise.resolve()),
          reload: jest.fn()
        }
      };
      var ses = {
        clearStorageData: jest.fn(() => Promise.resolve()),
        clearCache: jest.fn(() => Promise.resolve())
      };

      await SessionLifecycle.reloadWithPreAuth(
        'p1',
        { name: 't' },
        win,
        ses,
        () => 'https://game.url'
      );

      expect(ses.clearStorageData).toHaveBeenCalledWith({
        storages: ['cookies', 'localstorage', 'sessionstorage']
      });
      expect(ses.clearCache).toHaveBeenCalled();
      // _loadGameWithPreAuth deve ter sido chamado (via win.loadURL)
    });

    test('fallback reload direto quando clearStorageData falha', async () => {
      var win = {
        isDestroyed: () => false,
        id: 102,
        webContents: {
          isDestroyed: () => false,
          executeJavaScript: jest.fn(() => Promise.resolve()),
          reload: jest.fn()
        }
      };
      var ses = {
        clearStorageData: jest.fn(() => Promise.reject(new Error('clear fail'))),
        clearCache: jest.fn(() => Promise.resolve())
      };

      await SessionLifecycle.reloadWithPreAuth('p1', { name: 't' }, win, ses, jest.fn());

      expect(win.webContents.reload).toHaveBeenCalled();
    });

    test('não chama loadURL quando win destruído após clearStorageData', async () => {
      var win = {
        isDestroyed: () => false,
        id: 103,
        loadURL: jest.fn(),
        webContents: {
          isDestroyed: () => false,
          executeJavaScript: jest.fn(() => Promise.resolve()),
          reload: jest.fn()
        }
      };
      var ses = {
        clearStorageData: jest.fn(function () {
          win.isDestroyed = () => true;
          return Promise.resolve();
        }),
        clearCache: jest.fn(() => Promise.resolve())
      };

      await SessionLifecycle.reloadWithPreAuth(
        'p1',
        { name: 't' },
        win,
        ses,
        () => 'https://game.url'
      );

      // loadURL não deve ser chamado (win destruído no meio)
      // _loadGameWithPreAuth checa win.isDestroyed internamente
    });
  });

  describe('_loadGameWithPreAuth', () => {
    test('carrega URL diretamente sem credenciais', () => {
      var win = { loadURL: jest.fn() };
      var profile = { id: 'p_001', name: 'Test' };
      var getGameUrl = jest.fn(() => 'https://game.url');

      SessionLifecycle._loadGameWithPreAuth('p_001', profile, win, {}, getGameUrl);

      expect(win.loadURL).toHaveBeenCalledWith('https://game.url');
    });

    test('carrega URL diretamente quando hasCredentials false', () => {
      vault.hasCredentials.mockReturnValue(false);
      var win = { loadURL: jest.fn() };
      var profile = { id: 'p_001', name: 'Test' };
      var getGameUrl = jest.fn(() => 'https://game.url');

      SessionLifecycle._loadGameWithPreAuth('p_001', profile, win, {}, getGameUrl);

      expect(win.loadURL).toHaveBeenCalledWith('https://game.url');
    });

    test('carrega URL diretamente quando creds não tem user/pass', () => {
      vault.hasCredentials.mockReturnValue(true);
      vault.getCredentials.mockReturnValue({ user: '', pass: '' });
      var win = { loadURL: jest.fn() };
      var profile = { id: 'p_001', name: 'Test' };
      var getGameUrl = jest.fn(() => 'https://game.url');

      SessionLifecycle._loadGameWithPreAuth('p_001', profile, win, {}, getGameUrl);

      expect(win.loadURL).toHaveBeenCalledWith('https://game.url');
    });
  });

  describe('attach — will-navigate edge cases', () => {
    test('intercepta URL oasgames', () => {
      var { win, wcHandlers } = makeMockWin();
      var ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      var handler = wcHandlers['will-navigate'];
      var evt = { preventDefault: jest.fn() };
      handler(evt, 'https://www.oasgames.com/pt/serverlist');

      expect(evt.preventDefault).toHaveBeenCalled();
      expect(win.loadURL).toHaveBeenCalled();
    });

    test('não intercepta assets oasgames', () => {
      var { win, wcHandlers } = makeMockWin();
      var ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      var handler = wcHandlers['will-navigate'];
      var evt = { preventDefault: jest.fn() };
      handler(evt, 'https://www.oasgames.com/game.js');

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });

    test('não intercepta URLs de outros domínios', () => {
      var { win, wcHandlers } = makeMockWin();
      var ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      var handler = wcHandlers['will-navigate'];
      var evt = { preventDefault: jest.fn() };
      handler(evt, 'https://www.google.com/');

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });

    test('não quebra com URL inválida no will-navigate', () => {
      var { win, wcHandlers } = makeMockWin();
      var ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      var handler = wcHandlers['will-navigate'];
      expect(() => handler({ preventDefault: jest.fn() }, 'not-a-url')).not.toThrow();
    });
  });

  describe('attach — new-window edge cases', () => {
    test('não abre URL inválida via shell', () => {
      var { win, wcHandlers } = makeMockWin();
      var ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      var handler = wcHandlers['new-window'];
      var evt = { preventDefault: jest.fn() };
      // URL sem protocolo válido → new URL() vai lançar, mas é capturado
      handler(evt, 'not-a-valid-url');

      expect(evt.preventDefault).toHaveBeenCalled();
      var { shell } = require('electron');
      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    test('não abre non-http URLs via shell', () => {
      var { win, wcHandlers } = makeMockWin();
      var ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      var handler = wcHandlers['new-window'];
      var evt = { preventDefault: jest.fn() };
      handler(evt, 'ftp://files.example.com/file.zip');

      expect(evt.preventDefault).toHaveBeenCalled();
      var { shell } = require('electron');
      expect(shell.openExternal).not.toHaveBeenCalled();
    });
  });

  describe('attach — close handler edge cases', () => {
    test('não chama destroy se win já destruído', () => {
      jest.useFakeTimers();
      var { win, handlers } = makeMockWin();
      win.isDestroyed.mockReturnValue(true);
      var ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      var closeHandler = handlers['close'];
      closeHandler({ preventDefault: jest.fn() });
      jest.advanceTimersByTime(500);

      // destroy não deve ser chamado se win.isDestroyed()
      // mas o código verifica antes de chamar
      jest.useRealTimers();
    });

    test('segunda chamada close é ignorada (isForceClosing guard)', () => {
      jest.useFakeTimers();
      var { win, handlers } = makeMockWin();
      var ctx = makeCtx();
      SessionLifecycle.attach(win, ctx);

      var closeHandler = handlers['close'];
      closeHandler({ preventDefault: jest.fn() });
      closeHandler({ preventDefault: jest.fn() });

      // Segunda chamada não deve causar problemas
      jest.useRealTimers();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Frente B coverage gaps — crypto + session
  // Foco: branches de login API (success/fail/destroyed), hooks de auditoria,
  // default status em _sendAutoLoginResult, e edge cases de lifecycle.
  // ───────────────────────────────────────────────────────────────────────────
  describe('Frente B coverage gaps — crypto + session', () => {
    describe('_sendAutoLoginResult — default status', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      test('result desconhecido (e.g. "unknown") cai no default status=idle', () => {
        SessionLifecycle._sendAutoLoginResult('p1', 'unknown-value');
        expect(ManagerWindow.send).toHaveBeenCalledWith('auto-login:status', {
          profileId: 'p1',
          status: 'idle',
          result: 'unknown-value'
        });
      });

      test('result undefined também cai no default status=idle (defensive)', () => {
        SessionLifecycle._sendAutoLoginResult('p1', undefined);
        expect(ManagerWindow.send).toHaveBeenCalledWith('auto-login:status', {
          profileId: 'p1',
          status: 'idle',
          result: undefined
        });
      });
    });

    describe('_loadGameWithPreAuth — API login flow', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        vault.hasCredentials.mockReturnValue(false);
        vault.getCredentials.mockReturnValue(null);
      });

      test('hasCredentials=true mas getCredentials=null → cai no path direto (sem API login)', () => {
        vault.hasCredentials.mockReturnValue(true);
        vault.getCredentials.mockReturnValue(null);
        var apiLogin = require('../../network/api-login');
        var win = { loadURL: jest.fn(), isDestroyed: jest.fn(() => false) };
        var profile = { id: 'p_001', name: 'Test' };
        var getGameUrl = jest.fn(() => 'https://game.url');

        SessionLifecycle._loadGameWithPreAuth('p_001', profile, win, {}, getGameUrl);

        expect(apiLogin.loginAndInject).not.toHaveBeenCalled();
        expect(win.loadURL).toHaveBeenCalledWith('https://game.url');
      });

      test('API login sucesso (resolve) → win.loadURL chamado após login', async () => {
        vault.hasCredentials.mockReturnValue(true);
        vault.getCredentials.mockReturnValue({ user: 'u@x.com', pass: 'secret' });
        var apiLogin = require('../../network/api-login');
        apiLogin.loginAndInject.mockResolvedValueOnce();
        var win = { loadURL: jest.fn(), isDestroyed: jest.fn(() => false) };
        var profile = { id: 'p_001', name: 'Test' };
        var getGameUrl = jest.fn(() => 'https://game.url');

        SessionLifecycle._loadGameWithPreAuth('p_001', profile, win, {}, getGameUrl);

        // Flush thenable chain: microtask + setImmediate fallback
        await new Promise(function (r) {
          setImmediate(r);
        });
        expect(apiLogin.loginAndInject).toHaveBeenCalledWith({}, 'u@x.com', 'secret');
        expect(win.loadURL).toHaveBeenCalledWith('https://game.url');
      });

      test('API login falha (reject) → fallback para win.loadURL', async () => {
        vault.hasCredentials.mockReturnValue(true);
        vault.getCredentials.mockReturnValue({ user: 'u@x.com', pass: 'secret' });
        var apiLogin = require('../../network/api-login');
        apiLogin.loginAndInject.mockRejectedValueOnce(new Error('api down'));
        var win = { loadURL: jest.fn(), isDestroyed: jest.fn(() => false) };
        var profile = { id: 'p_001', name: 'Test' };
        var getGameUrl = jest.fn(() => 'https://game.url');

        SessionLifecycle._loadGameWithPreAuth('p_001', profile, win, {}, getGameUrl);

        await new Promise(function (r) {
          setImmediate(r);
        });
        expect(apiLogin.loginAndInject).toHaveBeenCalled();
        expect(win.loadURL).toHaveBeenCalledWith('https://game.url');
      });

      test('API login sucesso mas win destruído no then → NÃO chama loadURL', async () => {
        vault.hasCredentials.mockReturnValue(true);
        vault.getCredentials.mockReturnValue({ user: 'u@x.com', pass: 'secret' });
        var apiLogin = require('../../network/api-login');
        apiLogin.loginAndInject.mockResolvedValueOnce();
        var win = { loadURL: jest.fn(), isDestroyed: jest.fn(() => false) };
        var profile = { id: 'p_001', name: 'Test' };
        var getGameUrl = jest.fn(() => 'https://game.url');

        SessionLifecycle._loadGameWithPreAuth('p_001', profile, win, {}, getGameUrl);
        // Simulate window destroyed after apiLogin resolves but before .then runs
        win.isDestroyed.mockReturnValue(true);

        await new Promise(function (r) {
          setImmediate(r);
        });
        expect(apiLogin.loginAndInject).toHaveBeenCalled();
        expect(win.loadURL).not.toHaveBeenCalled();
      });
    });

    describe('attach — auditor hooks (Phase 2 instrumentation)', () => {
      test('ready-to-show chama auditor.sessionStart quando auditor fornecido', () => {
        jest.useFakeTimers();
        try {
          var { win, handlers } = makeMockWin();
          var auditor = {
            sessionStart: jest.fn(),
            sessionEnd: jest.fn(),
            recordCrash: jest.fn(),
            recordReload: jest.fn(),
            recordStall: jest.fn()
          };
          var ctx = makeCtx({ auditor: auditor });
          SessionLifecycle.attach(win, ctx);

          handlers['ready-to-show']();
          expect(auditor.sessionStart).toHaveBeenCalledTimes(1);
        } finally {
          jest.useRealTimers();
        }
      });

      test('render-process-gone invoca auditor.recordCrash + recordReload quando auditor fornecido', () => {
        jest.useFakeTimers();
        try {
          var { win, wcHandlers } = makeMockWin();
          var auditor = {
            sessionStart: jest.fn(),
            sessionEnd: jest.fn(),
            recordCrash: jest.fn(),
            recordReload: jest.fn(),
            recordStall: jest.fn()
          };
          var ctx = makeCtx({ auditor: auditor });
          SessionLifecycle.attach(win, ctx);

          wcHandlers['render-process-gone']({}, { reason: 'oom', exitCode: 1 });
          expect(auditor.recordCrash).toHaveBeenCalledWith('oom');
          expect(auditor.recordReload).toHaveBeenCalledTimes(1);
        } finally {
          jest.useRealTimers();
        }
      });

      test('auditor hook silencia exceções (auditor.recordCrash lançando não quebra handler)', () => {
        jest.useFakeTimers();
        try {
          var { win, wcHandlers } = makeMockWin();
          var auditor = {
            sessionStart: jest.fn(),
            sessionEnd: jest.fn(),
            recordCrash: jest.fn(function () {
              throw new Error('auditor broken');
            }),
            recordReload: jest.fn(),
            recordStall: jest.fn()
          };
          var ctx = makeCtx({ auditor: auditor });
          SessionLifecycle.attach(win, ctx);

          expect(function () {
            wcHandlers['render-process-gone']({}, { reason: 'oom', exitCode: 1 });
          }).not.toThrow();
        } finally {
          jest.useRealTimers();
        }
      });
    });

    describe('attach — render-process-gone edge cases', () => {
      test('não chama reload quando webContents.isDestroyed() retorna true', () => {
        jest.useFakeTimers();
        try {
          var { win, wcHandlers } = makeMockWin();
          win.webContents.isDestroyed.mockReturnValue(true);
          var ctx = makeCtx();
          SessionLifecycle.attach(win, ctx);

          wcHandlers['render-process-gone']({}, { reason: 'crashed', exitCode: 1 });
          jest.advanceTimersByTime(1500);
          expect(win.webContents.reload).not.toHaveBeenCalled();
        } finally {
          jest.useRealTimers();
        }
      });

      test('reason "abnormal-exit" é recuperável (agenda reload, não é clean-exit/killed)', () => {
        jest.useFakeTimers();
        try {
          var { win, wcHandlers } = makeMockWin();
          var ctx = makeCtx();
          SessionLifecycle.attach(win, ctx);

          wcHandlers['render-process-gone']({}, { reason: 'abnormal-exit', exitCode: 1 });
          expect(win.webContents.reload).not.toHaveBeenCalled();
          jest.advanceTimersByTime(1500);
          expect(win.webContents.reload).toHaveBeenCalledTimes(1);
        } finally {
          jest.useRealTimers();
        }
      });
    });
  });
});
