/**
 * Tests for src/ui/manager/ManagerWindow.js — Lifecycle da BrowserWindow do manager
 *
 * Verifies: createManagerWindow, getManagerWindow, showManager, hideManager, send.
 * All depend on electron BrowserWindow — needs thorough mocking.
 *
 * NOTE: ManagerWindow stores the window reference in a module-level variable.
 * afterEach resets it by triggering the 'closed' event handler, following the
 * same pattern as Launcher.test.js.
 */

'use strict';

var electron = require('electron');

// Mock game-launcher (lazy-required inside close handler)
jest.mock('../../game-launcher', function () {
  return {
    hasOpenWindows: jest.fn(function () {
      return false;
    })
  };
});

jest.mock('../../../utils/logger', function () {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
});

var ManagerWindow = require('../ManagerWindow');
var gameLauncher = require('../../game-launcher');

// Helper: create a mock BrowserWindow instance
function createMockWindow() {
  return {
    loadFile: jest.fn(),
    once: jest.fn(),
    on: jest.fn(),
    isDestroyed: jest.fn(function () {
      return false;
    }),
    focus: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    webContents: {
      send: jest.fn()
    }
  };
}

describe('ManagerWindow.js', function () {
  var mockWindow;

  beforeEach(function () {
    jest.clearAllMocks();
    mockWindow = createMockWindow();
    // Make BrowserWindow constructor return our mock
    electron.BrowserWindow.mockImplementation(function (opts) {
      mockWindow._lastOpts = opts;
      return mockWindow;
    });
    // Reset gameLauncher default
    gameLauncher.hasOpenWindows.mockReturnValue(false);
  });

  afterEach(function () {
    // Reset the stored window by triggering its closed event handler
    // This must happen before the next beforeEach's clearAllMocks
    var win = ManagerWindow.getManagerWindow();
    if (win && win.on && win.on.mock) {
      win.on.mock.calls.forEach(function (call) {
        if (call[0] === 'closed') call[1]();
      });
    }
  });

  // ── Exports ──

  describe('exports', function () {
    test('exports createManagerWindow as function', function () {
      expect(typeof ManagerWindow.createManagerWindow).toBe('function');
    });
    test('exports getManagerWindow as function', function () {
      expect(typeof ManagerWindow.getManagerWindow).toBe('function');
    });
    test('exports showManager as function', function () {
      expect(typeof ManagerWindow.showManager).toBe('function');
    });
    test('exports hideManager as function', function () {
      expect(typeof ManagerWindow.hideManager).toBe('function');
    });
    test('exports send as function', function () {
      expect(typeof ManagerWindow.send).toBe('function');
    });
  });

  // ── createManagerWindow ──

  describe('createManagerWindow', function () {
    test('creates a new BrowserWindow and returns it', function () {
      var win = ManagerWindow.createManagerWindow();
      expect(electron.BrowserWindow).toHaveBeenCalled();
      expect(win).toBeDefined();
      expect(win).toBe(mockWindow);
    });

    test('passes expected options to BrowserWindow', function () {
      ManagerWindow.createManagerWindow();
      expect(mockWindow._lastOpts).toBeDefined();
      var opts = mockWindow._lastOpts;
      expect(opts.width).toBe(1000);
      expect(opts.height).toBe(760);
      expect(opts.title).toBe('Shinobi Launcher');
      expect(opts.show).toBe(false);
      expect(opts.autoHideMenuBar).toBe(true);
      expect(opts.webPreferences.nodeIntegration).toBe(true);
      expect(opts.webPreferences.contextIsolation).toBe(false);
    });

    test('calls loadFile on the window', function () {
      ManagerWindow.createManagerWindow();
      expect(mockWindow.loadFile).toHaveBeenCalled();
      var loadArg = mockWindow.loadFile.mock.calls[0][0];
      expect(loadArg).toContain('index.html');
    });

    test('registers ready-to-show event listener', function () {
      ManagerWindow.createManagerWindow();
      expect(mockWindow.once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
    });

    test('shows window and calls onReady on ready-to-show', function () {
      var onReady = jest.fn();
      ManagerWindow.createManagerWindow({ onReady: onReady });

      // Find the ready-to-show handler
      var readyHandler = null;
      mockWindow.once.mock.calls.forEach(function (call) {
        if (call[0] === 'ready-to-show') readyHandler = call[1];
      });
      expect(readyHandler).not.toBeNull();

      // Invoke it
      readyHandler();
      expect(mockWindow.show).toHaveBeenCalled();
      expect(onReady).toHaveBeenCalled();
    });

    test('onReady error is caught silently', function () {
      var onReady = jest.fn(function () {
        throw new Error('ready error');
      });
      ManagerWindow.createManagerWindow({ onReady: onReady });

      var readyHandler = null;
      mockWindow.once.mock.calls.forEach(function (call) {
        if (call[0] === 'ready-to-show') readyHandler = call[1];
      });

      // Should not throw
      expect(function () {
        readyHandler();
      }).not.toThrow();
    });

    test('registers close event listener', function () {
      ManagerWindow.createManagerWindow();
      var hasClose = mockWindow.on.mock.calls.some(function (call) {
        return call[0] === 'close';
      });
      expect(hasClose).toBe(true);
    });

    test('registers closed event listener that nullifies window', function () {
      ManagerWindow.createManagerWindow();
      var closedHandler = null;
      mockWindow.on.mock.calls.forEach(function (call) {
        if (call[0] === 'closed') closedHandler = call[1];
      });
      expect(closedHandler).not.toBeNull();

      // Simulate closed event
      closedHandler();
      expect(ManagerWindow.getManagerWindow()).toBeNull();
    });

    test('close handler hides window and prevents default when game is running', function () {
      gameLauncher.hasOpenWindows.mockReturnValue(true);
      ManagerWindow.createManagerWindow();

      var closeHandler = null;
      mockWindow.on.mock.calls.forEach(function (call) {
        if (call[0] === 'close') closeHandler = call[1];
      });

      var event = { preventDefault: jest.fn() };
      closeHandler(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockWindow.hide).toHaveBeenCalled();
    });

    test('close handler does not preventDefault when no game windows open', function () {
      gameLauncher.hasOpenWindows.mockReturnValue(false);
      ManagerWindow.createManagerWindow();

      var closeHandler = null;
      mockWindow.on.mock.calls.forEach(function (call) {
        if (call[0] === 'close') closeHandler = call[1];
      });

      var event = { preventDefault: jest.fn() };
      closeHandler(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(mockWindow.hide).not.toHaveBeenCalled();
    });

    test('focuses existing window if not destroyed instead of creating new one', function () {
      // Create first window
      ManagerWindow.createManagerWindow();
      var firstCallCount = electron.BrowserWindow.mock.calls.length;

      // Try to create again — should focus existing
      ManagerWindow.createManagerWindow();
      expect(mockWindow.focus).toHaveBeenCalled();
      // No new BrowserWindow created
      expect(electron.BrowserWindow.mock.calls.length).toBe(firstCallCount);
    });
  });

  // ── getManagerWindow ──

  describe('getManagerWindow', function () {
    test('returns the window after creation', function () {
      ManagerWindow.createManagerWindow();
      expect(ManagerWindow.getManagerWindow()).toBe(mockWindow);
    });

    test('returns null after closed event', function () {
      ManagerWindow.createManagerWindow();
      var closedHandler = null;
      mockWindow.on.mock.calls.forEach(function (call) {
        if (call[0] === 'closed') closedHandler = call[1];
      });
      closedHandler();
      expect(ManagerWindow.getManagerWindow()).toBeNull();
    });
  });

  // ── showManager ──

  describe('showManager', function () {
    test('shows and focuses existing window', function () {
      ManagerWindow.createManagerWindow();
      ManagerWindow.showManager();
      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
    });

    test('calls onShown callback when window exists', function () {
      ManagerWindow.createManagerWindow();
      var onShown = jest.fn();
      ManagerWindow.showManager(onShown);
      expect(onShown).toHaveBeenCalled();
    });

    test('creates new window if none exists', function () {
      // No window — getManagerWindow returns null after afterEach reset
      var prevCallCount = electron.BrowserWindow.mock.calls.length;
      ManagerWindow.showManager();
      expect(electron.BrowserWindow.mock.calls.length).toBeGreaterThan(prevCallCount);
    });
  });

  // ── hideManager ──

  describe('hideManager', function () {
    test('hides existing window', function () {
      ManagerWindow.createManagerWindow();
      ManagerWindow.hideManager();
      expect(mockWindow.hide).toHaveBeenCalled();
    });

    test('is no-op when window is null', function () {
      // No window exists after afterEach reset
      expect(function () {
        ManagerWindow.hideManager();
      }).not.toThrow();
    });

    test('is no-op when window is destroyed', function () {
      ManagerWindow.createManagerWindow();
      mockWindow.isDestroyed.mockReturnValue(true);
      mockWindow.hide.mockClear();
      ManagerWindow.hideManager();
      expect(mockWindow.hide).not.toHaveBeenCalled();
    });
  });

  // ── send ──

  describe('send', function () {
    test('sends IPC message to window webContents', function () {
      ManagerWindow.createManagerWindow();
      ManagerWindow.send('test-channel', { data: 'hello' });
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('test-channel', { data: 'hello' });
    });

    test('is no-op when window is null', function () {
      // No window exists after afterEach reset
      expect(function () {
        ManagerWindow.send('ch', 'data');
      }).not.toThrow();
    });

    test('is no-op when window is destroyed', function () {
      ManagerWindow.createManagerWindow();
      mockWindow.isDestroyed.mockReturnValue(true);
      ManagerWindow.send('ch', 'data');
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });

    test('silently catches errors from webContents.send', function () {
      ManagerWindow.createManagerWindow();
      mockWindow.webContents.send.mockImplementation(function () {
        throw new Error('send error');
      });
      expect(function () {
        ManagerWindow.send('ch', 'data');
      }).not.toThrow();
    });
  });
});
