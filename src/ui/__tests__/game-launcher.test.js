/**
 * Tests for src/ui/game-launcher.js — thin facade that re-exports app/Launcher
 *
 * Verifies the facade preserves the historical public API by delegating every
 * call to ../app/Launcher. The facade exists only for backwards compatibility
 * (controller.js, manager.js, main.js still import from ui/game-launcher).
 *
 * Strategy: jest.mock('../app/Launcher') with a known stub object, then assert
 * that game-launcher.exports === stub. Also verify individual keys survive.
 */

'use strict';

// Path is relative to src/ui/__tests__/game-launcher.test.js → ../app/Launcher.
// Variable name MUST be prefixed with `mock` (case-insensitive) — Jest allows
// out-of-scope refs in jest.mock() factories only for variables so prefixed.
const mockLauncher = {
  launchProfile: jest.fn(),
  focusProfile: jest.fn(),
  closeProfile: jest.fn(),
  isProfileOpen: jest.fn(),
  getWebContents: jest.fn(),
  hasOpenWindows: jest.fn(),
  getGameUrl: jest.fn()
};

jest.mock('../../app/Launcher', () => mockLauncher);

const gameLauncher = require('../game-launcher');

describe('ui/game-launcher.js (facade)', () => {
  test('module is the same object as app/Launcher (re-export)', () => {
    // game-launcher.js: `module.exports = require('../app/Launcher')`
    expect(gameLauncher).toBe(mockLauncher);
  });

  test('exports launchProfile as function', () => {
    expect(typeof gameLauncher.launchProfile).toBe('function');
  });

  test('exports closeProfile as function', () => {
    expect(typeof gameLauncher.closeProfile).toBe('function');
  });

  test('exports isProfileOpen as function', () => {
    expect(typeof gameLauncher.isProfileOpen).toBe('function');
  });

  test('exports hasOpenWindows as function', () => {
    expect(typeof gameLauncher.hasOpenWindows).toBe('function');
  });

  test('exports getGameUrl as function', () => {
    expect(typeof gameLauncher.getGameUrl).toBe('function');
  });

  test('delegates launchProfile calls to underlying Launcher', () => {
    gameLauncher.launchProfile('p_001');
    expect(mockLauncher.launchProfile).toHaveBeenCalledWith('p_001');
  });

  test('delegates hasOpenWindows calls to underlying Launcher', () => {
    mockLauncher.hasOpenWindows.mockReturnValueOnce(true);
    expect(gameLauncher.hasOpenWindows()).toBe(true);
    expect(mockLauncher.hasOpenWindows).toHaveBeenCalled();
  });

  test('delegates closeProfile calls to underlying Launcher', () => {
    gameLauncher.closeProfile('p_002');
    expect(mockLauncher.closeProfile).toHaveBeenCalledWith('p_002');
  });
});
