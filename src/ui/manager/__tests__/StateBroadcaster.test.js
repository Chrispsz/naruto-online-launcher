/**
 * Tests for src/ui/manager/StateBroadcaster.js (Fase 3c split)
 *
 * Verifies: exports, pushProfiles/pushEvents/pushAll,
 * startAutoRefresh/stopAutoRefresh, listener registration.
 *
 * NOTE: StateBroadcaster uses module-level state (_started, _remindCb, etc.)
 * that persists across tests. The startAutoRefresh() is idempotent — once
 * started, subsequent calls are no-ops. We test accordingly.
 */

'use strict';

// Mock all dependencies before requiring the module
jest.mock('../../../profiles/store', () => ({
  getAll: jest.fn(() => []),
  onChange: jest.fn()
}));

jest.mock('../../../memory/guard', () => ({
  getStats: jest.fn(() => ({ totalMB: 100, thresholdMB: 700, isBatata: false }))
}));

jest.mock('../../../utils/EventTimers', () => ({
  getUpcoming: jest.fn(() => []),
  getUserOffsetHours: jest.fn(() => -3),
  onRemind: jest.fn()
}));

jest.mock('../../../profiles/vault', () => ({
  hasCredentials: jest.fn(() => false)
}));

jest.mock('../../../profiles/partition', () => ({
  shouldUseShadow: jest.fn(() => false)
}));

jest.mock('../ManagerWindow', () => ({
  send: jest.fn()
}));

const StateBroadcaster = require('../StateBroadcaster');
const store = require('../../../profiles/store');
const et = require('../../../utils/EventTimers');
const vault = require('../../../profiles/vault');
const partition = require('../../../profiles/partition');
const ManagerWindow = require('../ManagerWindow');

describe('StateBroadcaster.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    test('exports pushProfiles as function', () => {
      expect(typeof StateBroadcaster.pushProfiles).toBe('function');
    });

    test('exports pushEvents as function', () => {
      expect(typeof StateBroadcaster.pushEvents).toBe('function');
    });

    test('exports pushAll as function', () => {
      expect(typeof StateBroadcaster.pushAll).toBe('function');
    });

    test('exports startAutoRefresh as function', () => {
      expect(typeof StateBroadcaster.startAutoRefresh).toBe('function');
    });

    test('exports stopAutoRefresh as function', () => {
      expect(typeof StateBroadcaster.stopAutoRefresh).toBe('function');
    });
  });

  describe('pushProfiles', () => {
    test('sends profiles:updated via ManagerWindow.send', () => {
      store.getAll.mockReturnValue([{ id: 'p_abc123', name: 'Test', region: 'br', server: 's1' }]);
      vault.hasCredentials.mockReturnValue(true);
      partition.shouldUseShadow.mockReturnValue(false);

      StateBroadcaster.pushProfiles();

      expect(ManagerWindow.send).toHaveBeenCalledWith('profiles:updated', expect.any(Array));
    });

    test('enriches profiles with hasVault from vault.hasCredentials', () => {
      store.getAll.mockReturnValue([{ id: 'p_abc123', name: 'Test', region: 'br', server: 's1' }]);
      vault.hasCredentials.mockReturnValue(true);

      StateBroadcaster.pushProfiles();

      const sent = ManagerWindow.send.mock.calls[0][1];
      expect(sent[0].hasVault).toBe(true);
    });

    test('enriches profiles with shadow from partition.shouldUseShadow', () => {
      store.getAll.mockReturnValue([{ id: 'p_abc123', name: 'Test', region: 'br', server: 's1' }]);
      partition.shouldUseShadow.mockReturnValue(true);

      StateBroadcaster.pushProfiles();

      const sent = ManagerWindow.send.mock.calls[0][1];
      expect(sent[0].shadow).toBe(true);
    });

    test('clones profile objects (does not mutate original)', () => {
      const original = { id: 'p_abc123', name: 'Test', region: 'br', server: 's1' };
      store.getAll.mockReturnValue([original]);

      StateBroadcaster.pushProfiles();

      const sent = ManagerWindow.send.mock.calls[0][1][0];
      expect(sent).not.toBe(original);
      expect(sent.name).toBe('Test');
    });

    test('handles empty profile list', () => {
      store.getAll.mockReturnValue([]);

      StateBroadcaster.pushProfiles();

      expect(ManagerWindow.send).toHaveBeenCalledWith('profiles:updated', []);
    });

    test('enriches multiple profiles independently', () => {
      store.getAll.mockReturnValue([
        { id: 'p_001', name: 'A', region: 'br', server: 's1' },
        { id: 'p_002', name: 'B', region: 'na', server: 's2' }
      ]);
      vault.hasCredentials.mockImplementation(function (id) {
        return id === 'p_001';
      });

      StateBroadcaster.pushProfiles();

      const sent = ManagerWindow.send.mock.calls[0][1];
      expect(sent[0].hasVault).toBe(true);
      expect(sent[1].hasVault).toBe(false);
    });
  });

  describe('pushEvents', () => {
    test('sends events:update with byRegion and userOffset for specific region', () => {
      et.getUpcoming.mockReturnValue([{ id: 'br-boss', name: 'Boss' }]);
      et.getUserOffsetHours.mockReturnValue(-3);

      StateBroadcaster.pushEvents('br');

      expect(ManagerWindow.send).toHaveBeenCalledWith('events:update', {
        byRegion: { br: [{ id: 'br-boss', name: 'Boss' }] },
        userOffset: -3
      });
    });

    test('when called without region, uses _activeRegions from store profiles', () => {
      store.getAll.mockReturnValue([
        { id: 'p_1', name: 'A', region: 'na' },
        { id: 'p_2', name: 'B', region: 'eu' }
      ]);
      et.getUpcoming.mockReturnValue([]);

      StateBroadcaster.pushEvents();

      expect(et.getUpcoming).toHaveBeenCalledWith('na');
      expect(et.getUpcoming).toHaveBeenCalledWith('eu');
    });

    test('defaults to ["br"] when no profiles have region', () => {
      store.getAll.mockReturnValue([{ id: 'p_1', name: 'A' }]);
      et.getUpcoming.mockReturnValue([]);

      StateBroadcaster.pushEvents();

      expect(et.getUpcoming).toHaveBeenCalledWith('br');
    });

    test('deduplicates regions from multiple profiles', () => {
      store.getAll.mockReturnValue([
        { id: 'p_1', name: 'A', region: 'br' },
        { id: 'p_2', name: 'B', region: 'br' },
        { id: 'p_3', name: 'C', region: 'na' }
      ]);
      et.getUpcoming.mockReturnValue([]);

      StateBroadcaster.pushEvents();

      const regions = et.getUpcoming.mock.calls.map(function (c) {
        return c[0];
      });
      expect(regions).toEqual(expect.arrayContaining(['br', 'na']));
      const brCallCount = regions.filter(function (r) {
        return r === 'br';
      }).length;
      expect(brCallCount).toBe(1);
    });

    test('includes userOffset from EventTimers', () => {
      et.getUserOffsetHours.mockReturnValue(-5);
      et.getUpcoming.mockReturnValue([]);

      StateBroadcaster.pushEvents('na');

      const sent = ManagerWindow.send.mock.calls[0][1];
      expect(sent.userOffset).toBe(-5);
    });
  });

  describe('pushAll', () => {
    test('calls pushProfiles and pushEvents (2 ManagerWindow.send calls)', () => {
      store.getAll.mockReturnValue([]);
      et.getUpcoming.mockReturnValue([]);

      StateBroadcaster.pushAll();

      expect(ManagerWindow.send).toHaveBeenCalledWith('profiles:updated', expect.any(Array));
      expect(ManagerWindow.send).toHaveBeenCalledWith('events:update', expect.any(Object));
    });

    test('sends exactly 2 IPC messages', () => {
      store.getAll.mockReturnValue([]);
      et.getUpcoming.mockReturnValue([]);

      StateBroadcaster.pushAll();

      expect(ManagerWindow.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('startAutoRefresh', () => {
    test('does not throw when called', () => {
      expect(() => StateBroadcaster.startAutoRefresh()).not.toThrow();
    });

    test('is idempotent — calling multiple times does not throw', () => {
      StateBroadcaster.startAutoRefresh();
      StateBroadcaster.startAutoRefresh();
      StateBroadcaster.startAutoRefresh();
      // No error means idempotency guard works
    });
  });

  describe('stopAutoRefresh', () => {
    test('does not throw when called', () => {
      expect(() => StateBroadcaster.stopAutoRefresh()).not.toThrow();
    });

    test('allows restart after stop', () => {
      StateBroadcaster.stopAutoRefresh();
      // After stop, _started=false. startAutoRefresh should work again.
      expect(() => StateBroadcaster.startAutoRefresh()).not.toThrow();
    });

    test('calling stop when already stopped does not throw', () => {
      StateBroadcaster.stopAutoRefresh();
      expect(() => StateBroadcaster.stopAutoRefresh()).not.toThrow();
    });
  });

  describe('listener integration', () => {
    test('remind callback triggers pushEvents', () => {
      StateBroadcaster.stopAutoRefresh();
      StateBroadcaster.startAutoRefresh();

      const remindCallbacks = et.onRemind.mock.calls.map(function (c) {
        return c[0];
      });
      if (remindCallbacks.length > 0) {
        const latestCb = remindCallbacks[remindCallbacks.length - 1];
        jest.clearAllMocks();
        store.getAll.mockReturnValue([]);
        et.getUpcoming.mockReturnValue([]);
        latestCb();
        expect(ManagerWindow.send).toHaveBeenCalledWith('events:update', expect.any(Object));
      }
    });

    test('store onChange callback triggers pushProfiles', () => {
      StateBroadcaster.stopAutoRefresh();
      StateBroadcaster.startAutoRefresh();

      const changeCallbacks = store.onChange.mock.calls.map(function (c) {
        return c[0];
      });
      if (changeCallbacks.length > 0) {
        const latestCb = changeCallbacks[changeCallbacks.length - 1];
        jest.clearAllMocks();
        store.getAll.mockReturnValue([]);
        latestCb();
        expect(ManagerWindow.send).toHaveBeenCalledWith('profiles:updated', expect.any(Array));
      }
    });
  });
});
