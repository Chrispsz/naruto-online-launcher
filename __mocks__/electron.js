/**
 * __mocks__/electron.js — Manual mock via Jest __mocks__ resolution
 *
 * Electron has no Node.js implementation — every call would throw.
 * This mock provides the full API surface used across the codebase.
 *
 * Uses global jest.fn() (available in __mocks__ context on Jest 29 + Node 24).
 * Prior approach: jest.mock() in setupFiles broke on Node 24 (hoisting issue).
 */

'use strict';

const fn = jest.fn();

const defaultSession = {
  clearCache: jest.fn(() => Promise.resolve()),
  clearStorageData: jest.fn(() => Promise.resolve()),
  cookies: {
    get: jest.fn(() => Promise.resolve([])),
    set: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve())
  },
  webRequest: {
    onBeforeRequest: jest.fn(),
    onCompleted: jest.fn(),
    onBeforeSendHeaders: jest.fn()
  },
  setPermissionRequestHandler: jest.fn(),
  setUserAgent: jest.fn(),
  protocol: { registerFileProtocol: jest.fn() }
};

module.exports = {
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
    relaunch: jest.fn(),
    getGPUFeatureStatus: jest.fn(() => ({}))
  },
  BrowserWindow: fn,
  Notification: fn,
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn()
  },
  ipcRenderer: { send: jest.fn(), on: jest.fn(), invoke: jest.fn() },
  dialog: {
    showMessageBox: jest.fn(),
    showMessageBoxSync: jest.fn(),
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showErrorBox: jest.fn()
  },
  session: {
    defaultSession: defaultSession,
    fromPartition: jest.fn(() => ({
      clearCache: jest.fn(() => Promise.resolve()),
      clearStorageData: jest.fn(() => Promise.resolve()),
      cookies: {
        get: jest.fn(() => Promise.resolve([])),
        set: jest.fn(() => Promise.resolve()),
        remove: jest.fn(() => Promise.resolve())
      },
      webRequest: {
        onBeforeRequest: jest.fn(),
        onCompleted: jest.fn(),
        onBeforeSendHeaders: jest.fn()
      },
      setPermissionRequestHandler: jest.fn(),
      setUserAgent: jest.fn(),
      protocol: { registerFileProtocol: jest.fn() }
    }))
  },
  webContents: { getAllWebContents: jest.fn(() => []) },
  Menu: { buildFromTemplate: jest.fn(), setApplicationMenu: jest.fn() },
  shell: { openExternal: jest.fn(), openPath: jest.fn(), showItemInFolder: jest.fn() },
  screen: {
    getPrimaryDisplay: jest.fn(() => ({ workAreaSize: { width: 1920, height: 1080 } })),
    getAllDisplays: jest.fn(() => [{ workAreaSize: { width: 1920, height: 1080 } }])
  },
  nativeImage: { createFromPath: jest.fn(), fromPath: jest.fn(), createEmpty: jest.fn() },
  clipboard: { writeText: jest.fn(), readText: jest.fn() },
  systemPreferences: { getMediaAccessStatus: jest.fn() }
};