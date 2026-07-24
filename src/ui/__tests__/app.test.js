/**
 * Tests for src/ui/app.js — renderer process UI script
 *
 * app.js is a side-effect-only renderer script (no module.exports). It runs
 * at script load time and wires up:
 *   - window.api = { fetchServers, createTempmail, ... getOptimizationStatus }
 *   - ipcRenderer.on('profiles:updated' | 'events:update' | ...)
 *   - ipcRenderer.send('manager:ready') at init
 *   - Dynamic font-size scale based on window.screen.width
 *
 * Since jest.config.js uses testEnvironment='node' (no jsdom), we install a
 * minimal DOM mock (global.window / global.document / global.localStorage /
 * global.Node / global.confirm) BEFORE requiring app.js. Each test uses
 * jest.isolateModules to load app.js fresh so screen-width variations are
 * observable.
 */

'use strict';

// ── Minimal DOM mock helpers ──────────────────────────────────────────────

function makeElement() {
  const el = {
    style: {},
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      toggle: jest.fn(),
      contains: jest.fn(() => false)
    },
    children: { length: 0 },
    childNodes: [],
    firstChild: null,
    lastChild: null,
    nextElementSibling: null,
    setAttribute: jest.fn(),
    getAttribute: jest.fn(() => null),
    removeAttribute: jest.fn(),
    appendChild: jest.fn(),
    insertBefore: jest.fn(),
    removeChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    innerHTML: '',
    outerHTML: '',
    textContent: '',
    value: '',
    placeholder: '',
    title: '',
    lang: '',
    tabIndex: 0,
    onclick: null,
    onchange: null,
    dataset: {},
    type: '',
    disabled: false,
    checked: false,
    click: jest.fn(),
    focus: jest.fn(),
    select: jest.fn(),
    remove: jest.fn()
  };
  return el;
}

function installDomMock(screenWidth) {
  const elements = new Map();
  const documentElement = makeElement();

  const documentMock = {
    documentElement: documentElement,
    body: makeElement(),
    head: makeElement(),
    getElementById: jest.fn(id => {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    }),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    createElement: jest.fn(() => makeElement()),
    createTextNode: jest.fn(() => ({})),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  };

  const windowMock = {
    screen: { width: screenWidth },
    innerWidth: screenWidth,
    __SHINOBI_DEBUG__: { enabled: false },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  };

  const localStorageMock = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  };

  // Install globals (Node testEnvironment doesn't have these by default).
  global.window = windowMock;
  global.document = documentMock;
  global.localStorage = localStorageMock;
  global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  global.confirm = jest.fn(() => true);
  global.alert = jest.fn();
  global.prompt = jest.fn(() => null);
  global.navigator = { userAgent: 'node.js' };

  return { documentMock, windowMock, localStorageMock, documentElement };
}

// ── Mock electron (override the default __mocks__/electron.js to give
//    ipcRenderer.invoke a Promise-returning implementation so app.js's
//    async initI18n() doesn't throw on `.then(undefined)`. ────────────────

jest.mock('electron', () => {
  const fn = jest.fn();
  return {
    app: {
      getPath: jest.fn(p => '/tmp/naruto-test/' + p),
      getAppPath: jest.fn(() => '/tmp/naruto-test'),
      getName: jest.fn(() => 'Naruto Online'),
      getVersion: jest.fn(() => '4.9.2'),
      isReady: jest.fn(() => true),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      whenReady: jest.fn(() => Promise.resolve()),
      commandLine: { appendSwitch: jest.fn(), appendArgument: jest.fn() },
      requestSingleInstanceLock: jest.fn(() => true),
      quit: jest.fn(),
      exit: jest.fn(),
      relaunch: jest.fn()
    },
    BrowserWindow: fn,
    ipcMain: { handle: jest.fn(), on: jest.fn(), once: jest.fn(), removeHandler: jest.fn() },
    ipcRenderer: {
      send: jest.fn(),
      on: jest.fn(),
      invoke: jest.fn(() => Promise.resolve(undefined))
    },
    shell: { openExternal: jest.fn(), openPath: jest.fn() },
    clipboard: { writeText: jest.fn(), readText: jest.fn() }
  };
});

const electron = require('electron');

describe('src/ui/app.js', () => {
  beforeAll(() => {
    // app.js schedules setTimeout(initCopyButtons, 1000) and setInterval
    // (event badge, 30s) at top level. With real timers, these fire AFTER
    // the test ends and crash with "document is not defined" (globals were
    // cleaned up in afterEach). Fake timers prevent them from firing at all.
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-install Promise-returning invoke after clearAllMocks (which preserves
    // implementation per Jest docs, but be defensive).
    electron.ipcRenderer.invoke.mockImplementation(() => Promise.resolve(undefined));
  });

  afterEach(() => {
    // Clean up globals so other test files aren't affected.
    delete global.window;
    delete global.document;
    delete global.localStorage;
    delete global.Node;
    delete global.confirm;
    delete global.alert;
    delete global.prompt;
    delete global.navigator;
  });

  test('loads without throwing', () => {
    installDomMock(1920);
    expect(() => {
      jest.isolateModules(() => {
        require('../app');
      });
    }).not.toThrow();
  });

  test('populates window.api with expected IPC-bridge methods', () => {
    const { windowMock } = installDomMock(1920);
    jest.isolateModules(() => {
      require('../app');
    });
    expect(windowMock.api).toBeDefined();
    expect(typeof windowMock.api.fetchServers).toBe('function');
    expect(typeof windowMock.api.createTempmail).toBe('function');
    expect(typeof windowMock.api.apiLogin).toBe('function');
    expect(typeof windowMock.api.checkSession).toBe('function');
    expect(typeof windowMock.api.exportDiag).toBe('function');
    expect(typeof windowMock.api.getOptimizationStatus).toBe('function');
  });

  test('window.api.fetchServers delegates to ipcRenderer.invoke("servers:fetch", region)', async () => {
    const { windowMock } = installDomMock(1920);
    jest.isolateModules(() => {
      require('../app');
    });
    // Set the resolved value AFTER app.js load so initI18n's invoke calls
    // don't consume it.
    electron.ipcRenderer.invoke.mockResolvedValueOnce([{ id: 's1', number: 1 }]);
    const result = await windowMock.api.fetchServers('br');
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('servers:fetch', 'br');
    expect(result).toEqual([{ id: 's1', number: 1 }]);
  });

  test('window.api.getOptimizationStatus invokes optimization:get-status channel', async () => {
    const { windowMock } = installDomMock(1920);
    jest.isolateModules(() => {
      require('../app');
    });
    electron.ipcRenderer.invoke.mockResolvedValueOnce({ preset: 'balanced' });
    const status = await windowMock.api.getOptimizationStatus();
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('optimization:get-status');
    expect(status).toEqual({ preset: 'balanced' });
  });

  test('registers ipcRenderer.on for key UI channels', () => {
    installDomMock(1920);
    jest.isolateModules(() => {
      require('../app');
    });
    const channels = electron.ipcRenderer.on.mock.calls.map(c => c[0]);
    expect(channels).toContain('profiles:updated');
    expect(channels).toContain('events:update');
    expect(channels).toContain('profile:toast');
    expect(channels).toContain('auto-login:status');
    expect(channels).toContain('game-window:status');
  });

  test('sends manager:ready IPC at init', () => {
    installDomMock(1920);
    jest.isolateModules(() => {
      require('../app');
    });
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('manager:ready');
  });

  test('dynamic scale: width=1920 → <html> font-size 16px', () => {
    const { documentElement } = installDomMock(1920);
    jest.isolateModules(() => {
      require('../app');
    });
    expect(documentElement.style.fontSize).toBe('16px');
  });

  test('dynamic scale: width=2560 → <html> font-size 18px', () => {
    const { documentElement } = installDomMock(2560);
    jest.isolateModules(() => {
      require('../app');
    });
    expect(documentElement.style.fontSize).toBe('18px');
  });

  test('dynamic scale: width=800 (below 1366 breakpoint) → <html> font-size 14px', () => {
    const { documentElement } = installDomMock(800);
    jest.isolateModules(() => {
      require('../app');
    });
    expect(documentElement.style.fontSize).toBe('14px');
  });

  test('window.api.createTempmail delegates to tempmail:create channel', async () => {
    const { windowMock } = installDomMock(1920);
    electron.ipcRenderer.invoke.mockResolvedValueOnce({ ok: true });
    jest.isolateModules(() => {
      require('../app');
    });
    const opts = { name: 'test', server: 'S1', region: 'br' };
    await windowMock.api.createTempmail(opts);
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('tempmail:create', opts);
  });
});
