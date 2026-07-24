/**
 * Tests for src/preload.js — Electron preload bridge
 *
 * Verifies the contextBridge.exposeInMainWorld calls:
 *   - window.__SHINOBI_DEBUG__ = { enabled: DEBUG, isDebug: () => DEBUG }
 *   - window.narutoLauncher = { getVersion, isDebug }
 *
 * Preload reads DEBUG once from process.env.SHINOBI_DEBUG via main/debug.js.
 * The default __mocks__/electron.js does NOT include contextBridge, so we
 * inject one before requiring preload.js.
 */

'use strict';

const electron = require('electron');

// The default __mocks__/electron.js doesn't include contextBridge — inject it.
// (ipcRenderer is already present in the mock.)
electron.contextBridge = { exposeInMainWorld: jest.fn() };

describe('src/preload.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Re-inject after resetModules (the require cache reload doesn't recreate
    // our manual injection; the auto-mock from __mocks__/electron.js is used).
    const fresh = require('electron');
    fresh.contextBridge = { exposeInMainWorld: jest.fn() };
    fresh.ipcRenderer = { invoke: jest.fn(), send: jest.fn(), on: jest.fn() };
  });

  test('loads without throwing', () => {
    expect(() => require('../preload')).not.toThrow();
  });

  test('exposes __SHINOBI_DEBUG__ in the main world', () => {
    const { contextBridge } = require('electron');
    require('../preload');
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      '__SHINOBI_DEBUG__',
      expect.objectContaining({
        enabled: expect.any(Boolean),
        isDebug: expect.any(Function)
      })
    );
  });

  test('__SHINOBI_DEBUG__.enabled reflects DEBUG (false by default in tests)', () => {
    delete process.env.SHINOBI_DEBUG;
    const { contextBridge } = require('electron');
    require('../preload');
    const call = contextBridge.exposeInMainWorld.mock.calls.find(
      c => c[0] === '__SHINOBI_DEBUG__'
    );
    expect(call[1].enabled).toBe(false);
    expect(call[1].isDebug()).toBe(false);
  });

  test('exposes narutoLauncher in the main world', () => {
    const { contextBridge } = require('electron');
    require('../preload');
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'narutoLauncher',
      expect.objectContaining({
        getVersion: expect.any(Function),
        isDebug: expect.any(Function)
      })
    );
  });

  test('narutoLauncher.getVersion() invokes launcher:get-version channel', async () => {
    const { contextBridge, ipcRenderer } = require('electron');
    ipcRenderer.invoke.mockResolvedValueOnce('9.9.9');
    require('../preload');
    const api = contextBridge.exposeInMainWorld.mock.calls.find(
      c => c[0] === 'narutoLauncher'
    )[1];
    const v = await api.getVersion();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('launcher:get-version');
    expect(v).toBe('9.9.9');
  });

  test('narutoLauncher.isDebug() returns the DEBUG flag (false by default)', () => {
    delete process.env.SHINOBI_DEBUG;
    const { contextBridge } = require('electron');
    require('../preload');
    const api = contextBridge.exposeInMainWorld.mock.calls.find(
      c => c[0] === 'narutoLauncher'
    )[1];
    expect(api.isDebug()).toBe(false);
  });

  test('DEBUG=true when SHINOBI_DEBUG=1 is set before preload loads', () => {
    process.env.SHINOBI_DEBUG = '1';
    try {
      const { contextBridge } = require('electron');
      require('../preload');
      const dbg = contextBridge.exposeInMainWorld.mock.calls.find(
        c => c[0] === '__SHINOBI_DEBUG__'
      )[1];
      expect(dbg.enabled).toBe(true);
      expect(dbg.isDebug()).toBe(true);
    } finally {
      delete process.env.SHINOBI_DEBUG;
    }
  });

  test('exposes exactly 2 keys (__SHINOBI_DEBUG__ and narutoLauncher)', () => {
    const { contextBridge } = require('electron');
    require('../preload');
    const names = contextBridge.exposeInMainWorld.mock.calls.map(c => c[0]);
    expect(names).toContain('__SHINOBI_DEBUG__');
    expect(names).toContain('narutoLauncher');
    expect(names).toHaveLength(2);
  });
});
