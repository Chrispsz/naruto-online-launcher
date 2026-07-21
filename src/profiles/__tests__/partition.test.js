/**
 * Tests for src/profiles/partition.js — Shadow Partition manager
 *
 * Verifies: setBatataMode, shouldUseShadow, getPartitionName,
 * snapshotCookies, restoreCookies, removeSnapshot, ensurePartitionDir,
 * AUTH_DOMAINS.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const electron = require('electron');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

let tmpDir;

beforeAll(function () {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-partition-'));
});

afterAll(function () {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
});

const partition = require('../partition');

describe('partition.js', function () {
  beforeEach(function () {
    jest.clearAllMocks();
    // Point userData to our temp dir so snapshots & partition dirs go there
    electron.app.getPath.mockImplementation(function (p) {
      if (p === 'userData') return tmpDir;
      return '/tmp/naruto-test/' + p;
    });
    // Reset batata mode before each test
    partition.setBatataMode(false);
  });

  // ── Exports ──

  describe('exports', function () {
    test('exports setBatataMode as function', function () {
      expect(typeof partition.setBatataMode).toBe('function');
    });
    test('exports shouldUseShadow as function', function () {
      expect(typeof partition.shouldUseShadow).toBe('function');
    });
    test('exports getPartitionName as function', function () {
      expect(typeof partition.getPartitionName).toBe('function');
    });
    test('exports snapshotCookies as function', function () {
      expect(typeof partition.snapshotCookies).toBe('function');
    });
    test('exports restoreCookies as function', function () {
      expect(typeof partition.restoreCookies).toBe('function');
    });
    test('exports removeSnapshot as function', function () {
      expect(typeof partition.removeSnapshot).toBe('function');
    });
    test('exports ensurePartitionDir as function', function () {
      expect(typeof partition.ensurePartitionDir).toBe('function');
    });
    test('exports AUTH_DOMAINS as array', function () {
      expect(Array.isArray(partition.AUTH_DOMAINS)).toBe(true);
    });
  });

  // ── AUTH_DOMAINS ──

  describe('AUTH_DOMAINS', function () {
    test('contains oasgames.com domain', function () {
      expect(partition.AUTH_DOMAINS).toContain('oasgames.com');
    });
    test('contains naruto.oasgames.com domain', function () {
      expect(partition.AUTH_DOMAINS).toContain('naruto.oasgames.com');
    });
    test('has exactly 2 entries', function () {
      expect(partition.AUTH_DOMAINS.length).toBe(2);
    });
  });

  // ── setBatataMode / shouldUseShadow ──

  describe('setBatataMode', function () {
    test('enables shadow mode when called with true', function () {
      partition.setBatataMode(true);
      expect(partition.shouldUseShadow(null)).toBe(true);
    });
    test('disables shadow mode when called with false', function () {
      partition.setBatataMode(true);
      partition.setBatataMode(false);
      expect(partition.shouldUseShadow(null)).toBe(false);
    });
    test('coerces truthy value 1 to boolean true', function () {
      partition.setBatataMode(1);
      expect(partition.shouldUseShadow(null)).toBe(true);
    });
    test('coerces falsy value 0 to boolean false', function () {
      partition.setBatataMode(0);
      expect(partition.shouldUseShadow(null)).toBe(false);
    });
  });

  describe('shouldUseShadow', function () {
    test('returns false by default (no batata, no profile.shadow)', function () {
      expect(partition.shouldUseShadow(null)).toBe(false);
    });
    test('returns true when profile.shadow is true', function () {
      expect(partition.shouldUseShadow({ shadow: true, id: 'p1' })).toBe(true);
    });
    test('returns false when profile.shadow is false', function () {
      expect(partition.shouldUseShadow({ shadow: false, id: 'p1' })).toBe(false);
    });
    test('returns true when batata mode is on even without profile', function () {
      partition.setBatataMode(true);
      expect(partition.shouldUseShadow(null)).toBe(true);
    });
    test('profile.shadow=true overrides batata mode off', function () {
      partition.setBatataMode(false);
      expect(partition.shouldUseShadow({ shadow: true, id: 'p1' })).toBe(true);
    });
  });

  // ── getPartitionName ──

  describe('getPartitionName', function () {
    test('returns persist partition for non-shadow profile object', function () {
      var result = partition.getPartitionName({ id: 'p_001' });
      expect(result).toBe('persist:profile-p_001');
    });
    test('returns shadow partition for profile with shadow=true', function () {
      var result = partition.getPartitionName({ id: 'p_001', shadow: true });
      expect(result).toBe('partition:profile-p_001');
    });
    test('accepts string id directly', function () {
      var result = partition.getPartitionName('p_002');
      expect(result).toBe('persist:profile-p_002');
    });
    test('returns shadow partition when batata mode is on', function () {
      partition.setBatataMode(true);
      var result = partition.getPartitionName({ id: 'p_003' });
      expect(result).toBe('partition:profile-p_003');
    });
  });

  // ── ensurePartitionDir ──

  describe('ensurePartitionDir', function () {
    test('returns true for shadow profile (no-op, no dir created)', function () {
      var result = partition.ensurePartitionDir({ id: 'p_sh', shadow: true });
      expect(result).toBe(true);
      // Dir should NOT exist for shadow profiles
      var dir = path.join(tmpDir, 'Partitions', 'profile-p_sh');
      expect(fs.existsSync(dir)).toBe(false);
    });
    test('creates partition dir for persist profile', function () {
      var result = partition.ensurePartitionDir({ id: 'p_ens1' });
      expect(result).toBe(true);
      var dir = path.join(tmpDir, 'Partitions', 'profile-p_ens1');
      expect(fs.existsSync(dir)).toBe(true);
    });
    test('returns true when dir already exists', function () {
      var dir = path.join(tmpDir, 'Partitions', 'profile-p_ens2');
      fs.mkdirSync(dir, { recursive: true });
      var result = partition.ensurePartitionDir({ id: 'p_ens2' });
      expect(result).toBe(true);
    });
    test('accepts string id directly', function () {
      var result = partition.ensurePartitionDir('p_ens3');
      expect(result).toBe(true);
      var dir = path.join(tmpDir, 'Partitions', 'profile-p_ens3');
      expect(fs.existsSync(dir)).toBe(true);
    });
    test('returns true for profile object with no id (id coerces to truthy empty object)', function () {
      // {} has no .id, so id = ({} && undefined) || {} = {} which is truthy
      var result = partition.ensurePartitionDir({});
      expect(result).toBe(true);
    });
    test('returns false for null (no id)', function () {
      var result = partition.ensurePartitionDir(null);
      expect(result).toBe(false);
    });
    test('returns false for undefined (no id)', function () {
      var result = partition.ensurePartitionDir(undefined);
      expect(result).toBe(false);
    });
  });

  // ── snapshotCookies / restoreCookies / removeSnapshot ──

  describe('snapshotCookies', function () {
    test('returns true on successful snapshot of auth cookies', async function () {
      var mockCookies = [{ domain: '.oasgames.com', name: 'session', value: 'abc123' }];
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.resolve(mockCookies);
          })
        }
      });

      var result = await partition.snapshotCookies('persist:profile-p_snap1', 'p_snap1');
      expect(result).toBe(true);
      // Clean up
      partition.removeSnapshot('p_snap1');
    });

    test('filters only auth domain cookies (ignores others)', async function () {
      var allCookies = [
        { domain: '.oasgames.com', name: 'session', value: 'abc', secure: true },
        { domain: '.google.com', name: 'analytics', value: 'xyz' },
        { domain: '.naruto.oasgames.com', name: 'token', value: 'def' }
      ];
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.resolve(allCookies);
          })
        }
      });

      await partition.snapshotCookies('persist:profile-p_snap2', 'p_snap2');

      // Restore and count — only auth cookies should be restored
      var setCalls = [];
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          set: jest.fn(function (c) {
            setCalls.push(c);
            return Promise.resolve();
          })
        }
      });
      var count = await partition.restoreCookies('persist:profile-p_snap2', 'p_snap2');
      expect(count).toBe(2); // oasgames.com + naruto.oasgames.com
      // Clean up
      partition.removeSnapshot('p_snap2');
    });

    test('returns false when session.fromPartition throws', async function () {
      electron.session.fromPartition.mockImplementation(function () {
        throw new Error('no session');
      });

      var result = await partition.snapshotCookies('persist:profile-p_snap3', 'p_snap3');
      expect(result).toBe(false);
    });

    test('returns false when cookies.get rejects', async function () {
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.reject(new Error('cookie error'));
          })
        }
      });

      var result = await partition.snapshotCookies('persist:profile-p_snap4', 'p_snap4');
      expect(result).toBe(false);
    });
  });

  describe('restoreCookies', function () {
    test('returns 0 when no snapshot exists for profile', async function () {
      var result = await partition.restoreCookies('persist:profile-p_nosnap', 'p_nosnap_x');
      expect(result).toBe(0);
    });

    test('restores cookies from a previous snapshot', async function () {
      // Create snapshot first
      var authCookies = [
        { domain: '.oasgames.com', name: 'sid', value: 'v1', secure: true },
        { domain: '.naruto.oasgames.com', name: 'tok', value: 'v2', secure: false }
      ];
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.resolve(authCookies);
          })
        }
      });
      await partition.snapshotCookies('persist:profile-p_rest1', 'p_rest1');

      // Now restore
      var setCalls = [];
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          set: jest.fn(function (c) {
            setCalls.push(c);
            return Promise.resolve();
          })
        }
      });

      var count = await partition.restoreCookies('persist:profile-p_rest1', 'p_rest1');
      expect(count).toBe(2);
      // Verify cookie.set was called with correct URL derivation
      // Secure cookie → https://oasgames.com (leading dot stripped)
      expect(setCalls[0].url).toBe('https://oasgames.com');
      // Non-secure cookie → http://naruto.oasgames.com
      expect(setCalls[1].url).toBe('http://naruto.oasgames.com');
      // Clean up
      partition.removeSnapshot('p_rest1');
    });

    test('continues restoring if individual cookie.set fails', async function () {
      // Create snapshot with 2 cookies
      var authCookies = [
        { domain: '.oasgames.com', name: 'good', value: 'v', secure: true },
        { domain: '.oasgames.com', name: 'bad', value: 'x', secure: true }
      ];
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.resolve(authCookies);
          })
        }
      });
      await partition.snapshotCookies('persist:profile-p_rest2', 'p_rest2');

      // Restore: first cookie succeeds, second fails
      var callIndex = 0;
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          set: jest.fn(function () {
            callIndex++;
            if (callIndex === 2) return Promise.reject(new Error('bad cookie'));
            return Promise.resolve();
          })
        }
      });

      var count = await partition.restoreCookies('persist:profile-p_rest2', 'p_rest2');
      expect(count).toBe(1); // Only first cookie restored
      // Clean up
      partition.removeSnapshot('p_rest2');
    });

    test('returns 0 when session.fromPartition throws', async function () {
      // Ensure snapshots are loaded first
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.resolve([]);
          })
        }
      });
      await partition.snapshotCookies('persist:profile-p_rest3', 'p_rest3');

      // Now make fromPartition throw on restore
      electron.session.fromPartition.mockImplementation(function () {
        throw new Error('session gone');
      });

      var count = await partition.restoreCookies('persist:profile-p_rest3', 'p_rest3');
      expect(count).toBe(0);
      // Clean up
      partition.removeSnapshot('p_rest3');
    });
  });

  describe('removeSnapshot', function () {
    test('removes snapshot and prevents restore', async function () {
      // Create a snapshot
      var authCookies = [{ domain: '.oasgames.com', name: 's', value: 'v', secure: true }];
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.resolve(authCookies);
          })
        }
      });
      await partition.snapshotCookies('persist:profile-p_rem1', 'p_rem1');

      // Remove it
      partition.removeSnapshot('p_rem1');

      // Verify it's gone
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          set: jest.fn(function () {
            return Promise.resolve();
          })
        }
      });
      var count = await partition.restoreCookies('persist:profile-p_rem1', 'p_rem1');
      expect(count).toBe(0);
    });

    test('is no-op when no snapshot exists for profile', function () {
      expect(function () {
        partition.removeSnapshot('p_nonexistent_xyz');
      }).not.toThrow();
    });

    test('does not affect other profile snapshots', async function () {
      // Create snapshots for two profiles
      var makeCookies = function (name) {
        return [{ domain: '.oasgames.com', name: name, value: 'v', secure: true }];
      };
      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.resolve(makeCookies('cookie_a'));
          })
        }
      });
      await partition.snapshotCookies('persist:profile-p_rem_a', 'p_rem_a');

      electron.session.fromPartition.mockReturnValue({
        cookies: {
          get: jest.fn(function () {
            return Promise.resolve(makeCookies('cookie_b'));
          })
        }
      });
      await partition.snapshotCookies('persist:profile-p_rem_b', 'p_rem_b');

      // Remove only one
      partition.removeSnapshot('p_rem_a');

      // Verify the other still exists
      var setFn = jest.fn(function () {
        return Promise.resolve();
      });
      electron.session.fromPartition.mockReturnValue({
        cookies: { set: setFn }
      });
      var count = await partition.restoreCookies('persist:profile-p_rem_b', 'p_rem_b');
      expect(count).toBe(1);
      // Clean up
      partition.removeSnapshot('p_rem_b');
    });
  });
});
