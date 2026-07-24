/**
 * Testes para src/app/Launcher.js (Fase 3d split)
 *
 * Verifica: launchProfile, focusProfile, closeProfile, isProfileOpen,
 * getWebContents, hasOpenWindows, getGameUrl, window registry Map.
 *
 * NOTA: Launcher.js mantém gameWindows Map como estado de módulo persistente.
 * O afterEach limpa o registry via onClosed callback extraído de
 * SessionLifecycle.attach. NÃO usar jest.clearAllMocks() dentro dos testes
 * — apenas no beforeEach — para que o afterEach possa encontrar os callbacks.
 */

'use strict';

const electron = require('electron');

// Mock submodules
jest.mock('../../profiles/store', () => ({
  get: jest.fn(),
  getAll: jest.fn(() => [])
}));

jest.mock('../../profiles/partition', () => ({
  getPartitionName: jest.fn(() => 'persist:profile-p_001'),
  shouldUseShadow: jest.fn(() => false)
}));

jest.mock('../../network/blocker', () => ({
  setupBlocker: jest.fn()
}));

jest.mock('../../network/cookies', () => ({
  setupPersistentCookies: jest.fn()
}));

jest.mock('../SessionLifecycle', () => ({
  attach: jest.fn(),
  reloadWithPreAuth: jest.fn()
}));

jest.mock('../../ui/manager/KeyboardShortcuts', () => ({
  attach: jest.fn()
}));

jest.mock('../../config/urls', () => ({
  getGameUrl: jest.fn(
    () => 'https://naruto.narutowebgame.com/pt/serverlist?logintype=4&launcher=shinobi'
  ),
  getLauncherParams: jest.fn(() => 'logintype=4&leftbar_collapse=Yes&launcher=shinobi')
}));

const Launcher = require('../Launcher');
const store = require('../../profiles/store');
const SessionLifecycle = require('../SessionLifecycle');
const KeyboardShortcuts = require('../../ui/manager/KeyboardShortcuts');
const blocker = require('../../network/blocker');
const cookies = require('../../network/cookies');

/**
 * Cria mock de BrowserWindow para electron.BrowserWindow.
 */
function mockBrowserWindow() {
  const wc = {
    session: {
      setUserAgent: jest.fn(),
      cookies: { flushStore: jest.fn(() => Promise.resolve()) }
    },
    on: jest.fn(),
    once: jest.fn(),
    stop: jest.fn()
  };
  const win = {
    webContents: wc,
    on: jest.fn(),
    once: jest.fn(),
    isDestroyed: jest.fn(() => false),
    show: jest.fn(),
    focus: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
    setMenuBarVisibility: jest.fn(),
    setTitle: jest.fn(),
    loadURL: jest.fn()
  };
  return { win, wc };
}

describe('Launcher.js', () => {
  let bwMock;
  let origResourcesPath;
  // Track onClosed callbacks for cleanup
  let onClosedCallbacks = {};

  beforeAll(() => {
    origResourcesPath = process.resourcesPath;
    process.resourcesPath = '/tmp/naruto-test/resources';
  });

  afterAll(() => {
    process.resourcesPath = origResourcesPath;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    onClosedCallbacks = {};
    bwMock = mockBrowserWindow();
    electron.BrowserWindow.mockImplementation(function (opts) {
      bwMock._lastOpts = opts;
      return bwMock.win;
    });

    store.get.mockReturnValue({
      id: 'p_001',
      name: 'TestProfile',
      region: 'br',
      language: 'pt',
      server: 's799'
    });
  });

  afterEach(() => {
    // Clean up all tracked profiles from gameWindows registry
    Object.keys(onClosedCallbacks).forEach(function (profileId) {
      if (Launcher.isProfileOpen(profileId) && onClosedCallbacks[profileId]) {
        onClosedCallbacks[profileId]();
      }
    });
  });

  /**
   * Launches a profile and tracks the onClosed callback for cleanup.
   */
  function launchAndTrack(profileId) {
    Launcher.launchProfile(profileId);
    // Extract the onClosed callback from SessionLifecycle.attach
    var calls = SessionLifecycle.attach.mock.calls;
    for (var i = calls.length - 1; i >= 0; i--) {
      var ctx = calls[i][1];
      if (ctx.profileId === profileId && ctx.onClosed) {
        onClosedCallbacks[profileId] = ctx.onClosed;
        break;
      }
    }
  }

  describe('exports', () => {
    test('exporta launchProfile como função', () => {
      expect(typeof Launcher.launchProfile).toBe('function');
    });
    test('exporta closeProfile como função', () => {
      expect(typeof Launcher.closeProfile).toBe('function');
    });
    test('exporta isProfileOpen como função', () => {
      expect(typeof Launcher.isProfileOpen).toBe('function');
    });
    test('exporta getWebContents como função', () => {
      expect(typeof Launcher.getWebContents).toBe('function');
    });
    test('exporta hasOpenWindows como função', () => {
      expect(typeof Launcher.hasOpenWindows).toBe('function');
    });
    test('exporta getGameUrl como função', () => {
      expect(typeof Launcher.getGameUrl).toBe('function');
    });
  });

  describe('getGameUrl', () => {
    test('retorna URL com região BR por padrão (sem perfil)', () => {
      const url = Launcher.getGameUrl();
      expect(url).toContain('naruto');
    });

    test('retorna URL para perfil específico', () => {
      const url = Launcher.getGameUrl({ region: 'br', language: 'pt', server: 's799' });
      expect(url).toContain('naruto');
    });
  });

  describe('launchProfile', () => {
    test('retorna early se perfil não encontrado', () => {
      store.get.mockReturnValue(null);
      Launcher.launchProfile('nonexistent');
      expect(electron.BrowserWindow).not.toHaveBeenCalled();
    });

    test('cria BrowserWindow com opções corretas', () => {
      launchAndTrack('p_001');

      expect(electron.BrowserWindow).toHaveBeenCalled();
      const opts = bwMock._lastOpts;
      expect(opts).toBeDefined();
      expect(opts.show).toBe(false);
      expect(opts.autoHideMenuBar).toBe(true);
      expect(opts.webPreferences).toBeDefined();
      expect(opts.webPreferences.plugins).toBe(true);
      expect(opts.webPreferences.nodeIntegration).toBe(false);
      expect(opts.webPreferences.contextIsolation).toBe(true);
      expect(opts.webPreferences.partition).toBe('persist:profile-p_001');
    });

    test('chama setupBlocker e setupPersistentCookies com a session', () => {
      launchAndTrack('p_001');

      expect(blocker.setupBlocker).toHaveBeenCalledWith(bwMock.wc.session);
      expect(cookies.setupPersistentCookies).toHaveBeenCalledWith(
        bwMock.wc.session,
        expect.any(Object)
      );
    });

    test('anexa SessionLifecycle com contexto correto', () => {
      launchAndTrack('p_001');

      expect(SessionLifecycle.attach).toHaveBeenCalledWith(
        bwMock.win,
        expect.objectContaining({
          profileId: 'p_001',
          profile: expect.objectContaining({ id: 'p_001' }),
          entry: expect.objectContaining({
            failLoadRetry: false,
            formInjectAttempts: 0
          })
        })
      );
    });

    test('anexa KeyboardShortcuts com callback onClearLogin (F5 pré-auth)', () => {
      // v5.9.7: F5 agora delega pro callback em vez de fazer reload direto,
      // pra pré-autenticar via API antes de recarregar (igual ao Play).
      launchAndTrack('p_001');

      expect(KeyboardShortcuts.attach).toHaveBeenCalledWith(
        bwMock.win,
        'TestProfile',
        bwMock.wc.session,
        expect.any(Function)
      );
    });

    test('carrega loading screen (data:text/html)', () => {
      launchAndTrack('p_001');

      expect(bwMock.win.loadURL).toHaveBeenCalled();
      const url = bwMock.win.loadURL.mock.calls[0][0];
      expect(url).toContain('data:text/html');
    });

    test('se perfil já está aberto: foca a janela existente', () => {
      launchAndTrack('p_001');
      const callCount = electron.BrowserWindow.mock.calls.length;

      // Launch again — should focus existing, not create new window
      Launcher.launchProfile('p_001');

      expect(electron.BrowserWindow.mock.calls.length).toBe(callCount);
      expect(bwMock.win.show).toHaveBeenCalled();
      expect(bwMock.win.focus).toHaveBeenCalled();
    });

    test('page-title-updated previne mudança de título da janela', () => {
      launchAndTrack('p_001');
      bwMock.win.setTitle.mockClear();

      var onCalls = bwMock.win.on.mock.calls;
      var titleCall = onCalls.find(function (c) {
        return c[0] === 'page-title-updated';
      });
      expect(titleCall).toBeDefined();

      var mockEvent = { preventDefault: jest.fn() };
      titleCall[1](mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(bwMock.win.setTitle).toHaveBeenCalledWith(expect.stringContaining('TestProfile'));
    });
  });

  describe('hasOpenWindows', () => {
    test('retorna false quando não há janelas', () => {
      expect(Launcher.hasOpenWindows()).toBe(false);
    });

    test('retorna true após launch', () => {
      launchAndTrack('p_001');
      expect(Launcher.hasOpenWindows()).toBe(true);
    });
  });

  describe('isProfileOpen', () => {
    test('retorna false para perfil não aberto', () => {
      expect(Launcher.isProfileOpen('nonexistent')).toBe(false);
    });

    test('retorna true após launch', () => {
      launchAndTrack('p_001');
      expect(Launcher.isProfileOpen('p_001')).toBe(true);
    });
  });

  describe('getWebContents', () => {
    test('retorna null para perfil não aberto', () => {
      expect(Launcher.getWebContents('nonexistent')).toBe(null);
    });

    test('retorna webContents para perfil aberto', () => {
      launchAndTrack('p_001');
      const wc = Launcher.getWebContents('p_001');
      expect(wc).toBe(bwMock.wc);
    });
  });

  describe('closeProfile', () => {
    test('não lança para perfil não aberto', () => {
      expect(() => Launcher.closeProfile('nonexistent')).not.toThrow();
    });

    test('chama close na janela existente', () => {
      launchAndTrack('p_001');
      bwMock.win.close.mockClear();

      Launcher.closeProfile('p_001');
      expect(bwMock.win.close).toHaveBeenCalled();
    });
  });

  describe('window registry (gameWindows Map)', () => {
    test('onClosed callback remove entrada do registry', () => {
      launchAndTrack('p_001');
      expect(Launcher.isProfileOpen('p_001')).toBe(true);

      // Call the tracked onClosed callback
      onClosedCallbacks['p_001']();
      expect(Launcher.isProfileOpen('p_001')).toBe(false);
    });

    test('launch cria entrada no registry com campos esperados', () => {
      launchAndTrack('p_001');

      var calls = SessionLifecycle.attach.mock.calls;
      var ctx = calls[calls.length - 1][1];
      var entry = ctx.entry;
      expect(entry).toHaveProperty('window');
      expect(entry).toHaveProperty('partitionName');
      expect(entry).toHaveProperty('isShadow');
      expect(entry).toHaveProperty('autoLoginTimer');
      expect(entry).toHaveProperty('failLoadRetry');
      expect(entry).toHaveProperty('formInjectAttempts');
    });
  });

  describe('reloadWithPreAuth (v5.9.7)', () => {
    test('exporta reloadWithPreAuth como função', () => {
      expect(typeof Launcher.reloadWithPreAuth).toBe('function');
    });

    test('não lança se perfil não está aberto', () => {
      expect(() => Launcher.reloadWithPreAuth('nonexistent')).not.toThrow();
      expect(SessionLifecycle.reloadWithPreAuth).not.toHaveBeenCalled();
    });

    test('delega pro SessionLifecycle.reloadWithPreAuth com perfil + win + session', () => {
      launchAndTrack('p_001');
      SessionLifecycle.reloadWithPreAuth.mockClear();

      Launcher.reloadWithPreAuth('p_001');

      expect(SessionLifecycle.reloadWithPreAuth).toHaveBeenCalledTimes(1);
      // Args: (profileId, profile, win, ses, getGameUrl)
      const args = SessionLifecycle.reloadWithPreAuth.mock.calls[0];
      expect(args[0]).toBe('p_001');
      expect(args[1]).toEqual(expect.objectContaining({ id: 'p_001' }));
      expect(args[2]).toBe(bwMock.win);
      expect(args[3]).toBe(bwMock.wc.session);
      expect(typeof args[4]).toBe('function'); // getGameUrl
    });

    test('não chama SessionLifecycle se a janela foi destruída', () => {
      launchAndTrack('p_001');
      bwMock.win.isDestroyed.mockReturnValue(true);
      SessionLifecycle.reloadWithPreAuth.mockClear();

      Launcher.reloadWithPreAuth('p_001');

      expect(SessionLifecycle.reloadWithPreAuth).not.toHaveBeenCalled();
    });

    test('não chama SessionLifecycle se perfil não está no store', () => {
      launchAndTrack('p_001');
      store.get.mockReturnValueOnce(null); // perfil sumiu do store
      SessionLifecycle.reloadWithPreAuth.mockClear();

      expect(() => Launcher.reloadWithPreAuth('p_001')).not.toThrow();
      expect(SessionLifecycle.reloadWithPreAuth).not.toHaveBeenCalled();
    });
  });
});
