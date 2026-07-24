/**
 * Tests for src/ui/controller.js — thin facade that composes ManagerWindow,
 * StateBroadcaster and IpcRouter.
 *
 * Verifies the facade:
 *   1. Re-exports the 6 historical API methods (createManagerWindow,
 *      getManagerWindow, showManager, hideManager, registerIpcHandlers,
 *      launchProfile).
 *   2. createManagerWindow() calls ManagerWindow.createManagerWindow with
 *      { onReady: StateBroadcaster.pushAll }.
 *   3. showManager() calls ManagerWindow.showManager(StateBroadcaster.pushAll).
 *   4. getManagerWindow / hideManager / registerIpcHandlers / launchProfile
 *      are aliased directly from the underlying modules.
 */

'use strict';

const mockManagerWindow = {
  createManagerWindow: jest.fn(),
  getManagerWindow: jest.fn(),
  showManager: jest.fn(),
  hideManager: jest.fn(),
  send: jest.fn()
};

const mockStateBroadcaster = {
  pushAll: jest.fn()
};

const mockIpcRouter = {
  registerIpcHandlers: jest.fn(),
  launchProfile: jest.fn()
};

jest.mock('../manager/ManagerWindow', () => mockManagerWindow);
jest.mock('../manager/StateBroadcaster', () => mockStateBroadcaster);
jest.mock('../manager/IpcRouter', () => mockIpcRouter);

const controller = require('../controller');

describe('ui/controller.js (facade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    test('exports createManagerWindow as function', () => {
      expect(typeof controller.createManagerWindow).toBe('function');
    });

    test('exports getManagerWindow as function', () => {
      // Direct alias of ManagerWindow.getManagerWindow
      expect(typeof controller.getManagerWindow).toBe('function');
    });

    test('exports showManager as function', () => {
      expect(typeof controller.showManager).toBe('function');
    });

    test('exports hideManager as function', () => {
      expect(typeof controller.hideManager).toBe('function');
    });

    test('exports registerIpcHandlers as function', () => {
      expect(typeof controller.registerIpcHandlers).toBe('function');
    });

    test('exports launchProfile as function', () => {
      expect(typeof controller.launchProfile).toBe('function');
    });
  });

  describe('createManagerWindow delegation', () => {
    test('calls ManagerWindow.createManagerWindow with onReady=pushAll', () => {
      controller.createManagerWindow();
      expect(mockManagerWindow.createManagerWindow).toHaveBeenCalledTimes(1);
      expect(mockManagerWindow.createManagerWindow).toHaveBeenCalledWith({
        onReady: mockStateBroadcaster.pushAll
      });
    });

    test('forwards the BrowserWindow return value from ManagerWindow', () => {
      const fakeWin = { id: 1, isDestroyed: () => false };
      mockManagerWindow.createManagerWindow.mockReturnValueOnce(fakeWin);
      expect(controller.createManagerWindow()).toBe(fakeWin);
    });
  });

  describe('showManager delegation', () => {
    test('calls ManagerWindow.showManager with StateBroadcaster.pushAll', () => {
      controller.showManager();
      expect(mockManagerWindow.showManager).toHaveBeenCalledTimes(1);
      expect(mockManagerWindow.showManager).toHaveBeenCalledWith(
        mockStateBroadcaster.pushAll
      );
    });
  });

  describe('aliased exports', () => {
    test('getManagerWindow is ManagerWindow.getManagerWindow (same ref)', () => {
      expect(controller.getManagerWindow).toBe(mockManagerWindow.getManagerWindow);
    });

    test('hideManager is ManagerWindow.hideManager (same ref)', () => {
      expect(controller.hideManager).toBe(mockManagerWindow.hideManager);
    });

    test('registerIpcHandlers is IpcRouter.registerIpcHandlers (same ref)', () => {
      expect(controller.registerIpcHandlers).toBe(mockIpcRouter.registerIpcHandlers);
    });

    test('launchProfile is IpcRouter.launchProfile (same ref)', () => {
      expect(controller.launchProfile).toBe(mockIpcRouter.launchProfile);
    });
  });
});
