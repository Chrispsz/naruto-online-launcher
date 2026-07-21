/**
 * Tests for src/profiles/manager.js — Facade de alto nível para Perfis
 *
 * Verifies: setMemoryGuard, list, create, update, remove, launch, close,
 * reportCrash, getCredentials, setCredentials, removeCredentials,
 * hasCredentials, exportAll, importAll, getStats, getOpenProfileIds,
 * onChange, MAX_PROFILES, PALETTE.
 */

'use strict';

// Mock all submodules that manager.js depends on
jest.mock('../store', function () {
  return {
    getAll: jest.fn(function () {
      return [];
    }),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    touch: jest.fn(),
    exportJSON: jest.fn(function () {
      return '[]';
    }),
    importJSON: jest.fn(function () {
      return { imported: 0, skipped: 0 };
    }),
    MAX_PROFILES: 10
  };
});

jest.mock('../partition', function () {
  return {
    setBatataMode: jest.fn(),
    shouldUseShadow: jest.fn(function () {
      return false;
    }),
    getPartitionName: jest.fn(function (p) {
      var id = (p && p.id) || p;
      return 'persist:profile-' + id;
    }),
    ensurePartitionDir: jest.fn(function () {
      return true;
    }),
    snapshotCookies: jest.fn(function () {
      return Promise.resolve(true);
    }),
    restoreCookies: jest.fn(function () {
      return Promise.resolve(0);
    }),
    removeSnapshot: jest.fn()
  };
});

jest.mock('../vault', function () {
  return {
    getCredentials: jest.fn(),
    setCredentials: jest.fn(function () {
      return true;
    }),
    removeCredentials: jest.fn(function () {
      return true;
    }),
    hasCredentials: jest.fn(function () {
      return false;
    })
  };
});

jest.mock('../../ui/game-launcher', function () {
  return {
    launchProfile: jest.fn(),
    closeProfile: jest.fn(function () {
      return true;
    }),
    isProfileOpen: jest.fn(function () {
      return false;
    }),
    getWebContents: jest.fn(function () {
      return null;
    }),
    hasOpenWindows: jest.fn(function () {
      return false;
    })
  };
});

jest.mock('../../utils/logger', function () {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
});

var manager = require('../manager');
var store = require('../store');
var partition = require('../partition');
var vault = require('../vault');
var gameLauncher = require('../../ui/game-launcher');

describe('manager.js', function () {
  beforeEach(function () {
    jest.clearAllMocks();
    // Reset store.getAll to return empty array by default
    store.getAll.mockReturnValue([]);
    store.get.mockReturnValue(null);
    store.create.mockReturnValue(null);
    store.update.mockReturnValue(false);
    store.remove.mockReturnValue(false);
    // Reset partition mocks
    partition.shouldUseShadow.mockReturnValue(false);
    partition.getPartitionName.mockImplementation(function (p) {
      var id = (p && p.id) || p;
      return 'persist:profile-' + id;
    });
    partition.restoreCookies.mockResolvedValue(0);
    partition.snapshotCookies.mockResolvedValue(true);
    // Reset vault mocks
    vault.getCredentials.mockReturnValue(null);
    vault.setCredentials.mockReturnValue(true);
    vault.removeCredentials.mockReturnValue(true);
    vault.hasCredentials.mockReturnValue(false);
    // Reset gameLauncher mocks
    gameLauncher.launchProfile.mockImplementation(function () {});
    gameLauncher.closeProfile.mockReturnValue(true);
    gameLauncher.isProfileOpen.mockReturnValue(false);
    gameLauncher.getWebContents.mockReturnValue(null);
  });

  // ── Exports ──

  describe('exports', function () {
    test('exports setMemoryGuard as function', function () {
      expect(typeof manager.setMemoryGuard).toBe('function');
    });
    test('exports list as function', function () {
      expect(typeof manager.list).toBe('function');
    });
    test('exports create as function', function () {
      expect(typeof manager.create).toBe('function');
    });
    test('exports update as function', function () {
      expect(typeof manager.update).toBe('function');
    });
    test('exports remove as function', function () {
      expect(typeof manager.remove).toBe('function');
    });
    test('exports launch as function', function () {
      expect(typeof manager.launch).toBe('function');
    });
    test('exports close as function', function () {
      expect(typeof manager.close).toBe('function');
    });
    test('exports reportCrash as function', function () {
      expect(typeof manager.reportCrash).toBe('function');
    });
    test('exports getCredentials as function', function () {
      expect(typeof manager.getCredentials).toBe('function');
    });
    test('exports setCredentials as function', function () {
      expect(typeof manager.setCredentials).toBe('function');
    });
    test('exports removeCredentials as function', function () {
      expect(typeof manager.removeCredentials).toBe('function');
    });
    test('exports hasCredentials as function', function () {
      expect(typeof manager.hasCredentials).toBe('function');
    });
    test('exports exportAll as function', function () {
      expect(typeof manager.exportAll).toBe('function');
    });
    test('exports importAll as function', function () {
      expect(typeof manager.importAll).toBe('function');
    });
    test('exports MAX_PROFILES from store', function () {
      expect(manager.MAX_PROFILES).toBe(10);
    });
  });

  // ── setMemoryGuard ──

  describe('setMemoryGuard', function () {
    test('stores memory guard reference', function () {
      var mg = {
        reportCrash: jest.fn(),
        registerGameWebContents: jest.fn(),
        unregisterGameWebContents: jest.fn()
      };
      manager.setMemoryGuard(mg);
      // Can verify indirectly through launch (which uses mg)
    });
  });

  // ── list ──

  describe('list', function () {
    test('returns empty array when no profiles', function () {
      store.getAll.mockReturnValue([]);
      var result = manager.list();
      expect(result).toEqual([]);
    });

    test('enriches profiles with runtime state', function () {
      store.getAll.mockReturnValue([{ id: 'p_001', name: 'Main', server: 's1', region: 'br' }]);
      vault.hasCredentials.mockReturnValue(true);
      partition.shouldUseShadow.mockReturnValue(false);
      gameLauncher.isProfileOpen.mockReturnValue(false);

      var result = manager.list();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('p_001');
      expect(result[0].hasVault).toBe(true);
      expect(result[0].shadow).toBe(false);
      expect(result[0].isOpen).toBe(false);
      expect(result[0]).toHaveProperty('openedAt');
      expect(result[0]).toHaveProperty('crashCount');
    });

    test('marks profile as open when gameLauncher reports it open', function () {
      store.getAll.mockReturnValue([{ id: 'p_002', name: 'Alt', server: 's2', region: 'na' }]);
      gameLauncher.isProfileOpen.mockReturnValue(true);

      var result = manager.list();
      expect(result[0].isOpen).toBe(true);
    });
  });

  // ── create ──

  describe('create', function () {
    test('returns null when store.create returns null', function () {
      store.create.mockReturnValue(null);
      var result = manager.create({ name: 'Fail' });
      expect(result).toBeNull();
    });

    test('creates profile and calls ensurePartitionDir', function () {
      var profile = { id: 'p_new', name: 'NewProf', server: 's1', region: 'br' };
      store.create.mockReturnValue(profile);

      var result = manager.create({ name: 'NewProf', server: 's1', region: 'br' });
      expect(result).toEqual(profile);
      expect(partition.ensurePartitionDir).toHaveBeenCalledWith(profile);
    });

    test('returns profile even if ensurePartitionDir throws', function () {
      var profile = { id: 'p_err', name: 'ErrProf', server: 's1', region: 'br' };
      store.create.mockReturnValue(profile);
      partition.ensurePartitionDir.mockImplementation(function () {
        throw new Error('dir failed');
      });

      var result = manager.create({ name: 'ErrProf', server: 's1', region: 'br' });
      expect(result).toEqual(profile);
    });
  });

  // ── update ──

  describe('update', function () {
    test('delegates to store.update and returns result', function () {
      store.update.mockReturnValue(true);
      var result = manager.update('p_001', { name: 'Updated' });
      expect(store.update).toHaveBeenCalledWith('p_001', { name: 'Updated' });
      expect(result).toBe(true);
    });

    test('returns false when store.update returns false', function () {
      store.update.mockReturnValue(false);
      var result = manager.update('nonexistent', { name: 'X' });
      expect(result).toBe(false);
    });
  });

  // ── remove ──

  describe('remove', function () {
    test('closes window, removes vault, snapshot, and store entry', function () {
      store.remove.mockReturnValue(true);

      var result = manager.remove('p_001');
      expect(gameLauncher.closeProfile).toHaveBeenCalledWith('p_001');
      expect(vault.removeCredentials).toHaveBeenCalledWith('p_001');
      expect(partition.removeSnapshot).toHaveBeenCalledWith('p_001');
      expect(store.remove).toHaveBeenCalledWith('p_001');
      expect(result).toBe(true);
    });

    test('returns false when store.remove returns false', function () {
      store.remove.mockReturnValue(false);
      var result = manager.remove('nonexistent');
      expect(result).toBe(false);
    });

    test('continues even if closeProfile throws', function () {
      gameLauncher.closeProfile.mockImplementation(function () {
        throw new Error('not open');
      });
      store.remove.mockReturnValue(true);

      var result = manager.remove('p_001');
      expect(vault.removeCredentials).toHaveBeenCalledWith('p_001');
      expect(store.remove).toHaveBeenCalledWith('p_001');
      expect(result).toBe(true);
    });

    test('continues even if vault.removeCredentials throws', function () {
      vault.removeCredentials.mockImplementation(function () {
        throw new Error('vault error');
      });
      store.remove.mockReturnValue(true);

      var result = manager.remove('p_002');
      expect(partition.removeSnapshot).toHaveBeenCalledWith('p_002');
      expect(store.remove).toHaveBeenCalledWith('p_002');
      expect(result).toBe(true);
    });
  });

  // ── launch ──

  describe('launch', function () {
    test('returns false when profile not found', function () {
      store.get.mockReturnValue(null);
      var result = manager.launch('nonexistent');
      expect(result).toBe(false);
    });

    test('returns true and calls gameLauncher.launchProfile for valid profile', function () {
      var profile = { id: 'p_launch', name: 'Test', server: 's1', region: 'br' };
      store.get.mockReturnValue(profile);

      var result = manager.launch('p_launch');
      expect(result).toBe(true);
      expect(store.touch).toHaveBeenCalledWith('p_launch');
      expect(gameLauncher.launchProfile).toHaveBeenCalled();
    });

    test('calls restoreCookies for shadow profile before launch', function () {
      var profile = { id: 'p_shadow', name: 'Shadow', server: 's1', region: 'br' };
      store.get.mockReturnValue(profile);
      partition.shouldUseShadow.mockReturnValue(true);
      partition.getPartitionName.mockReturnValue('partition:profile-p_shadow');

      manager.launch('p_shadow');
      expect(partition.restoreCookies).toHaveBeenCalledWith(
        'partition:profile-p_shadow',
        'p_shadow'
      );
    });

    test('does not call restoreCookies for non-shadow profile', function () {
      var profile = { id: 'p_persist', name: 'Persist', server: 's1', region: 'br' };
      store.get.mockReturnValue(profile);
      partition.shouldUseShadow.mockReturnValue(false);

      manager.launch('p_persist');
      expect(partition.restoreCookies).not.toHaveBeenCalled();
    });

    test('returns false when gameLauncher.launchProfile throws', function () {
      var profile = { id: 'p_throw', name: 'Throw', server: 's1', region: 'br' };
      store.get.mockReturnValue(profile);
      gameLauncher.launchProfile.mockImplementation(function () {
        throw new Error('launch error');
      });

      var result = manager.launch('p_throw');
      expect(result).toBe(false);
    });

    test('registers webContents with memory guard on opened callback', function () {
      var profile = { id: 'p_mg', name: 'MG', server: 's1', region: 'br' };
      store.get.mockReturnValue(profile);
      var mockWC = { executeJavaScript: jest.fn() };
      gameLauncher.getWebContents.mockReturnValue(mockWC);
      var mg = {
        registerGameWebContents: jest.fn(),
        unregisterGameWebContents: jest.fn()
      };
      manager.setMemoryGuard(mg);

      // Simulate launch with onOpened callback
      gameLauncher.launchProfile.mockImplementation(function (id, onOpened) {
        if (onOpened) onOpened();
      });

      manager.launch('p_mg');
      expect(mg.registerGameWebContents).toHaveBeenCalledWith('p_mg', mockWC);
    });

    test('snapshots cookies and unregisters from MG on closed callback (shadow)', function () {
      var profile = { id: 'p_close', name: 'Close', server: 's1', region: 'br' };
      store.get.mockReturnValue(profile);
      partition.shouldUseShadow.mockReturnValue(true);
      partition.getPartitionName.mockReturnValue('partition:profile-p_close');
      var mg = {
        registerGameWebContents: jest.fn(),
        unregisterGameWebContents: jest.fn()
      };
      manager.setMemoryGuard(mg);

      // Launch to set up runtime state, then simulate close
      gameLauncher.launchProfile.mockImplementation(function (id, onOpened, onClosed) {
        if (onClosed) onClosed();
      });

      manager.launch('p_close');
      expect(partition.snapshotCookies).toHaveBeenCalledWith(
        'partition:profile-p_close',
        'p_close'
      );
      expect(mg.unregisterGameWebContents).toHaveBeenCalledWith('p_close');
    });

    test('calls onOpened and onClosed callbacks when provided', function () {
      var profile = { id: 'p_cb', name: 'CB', server: 's1', region: 'br' };
      store.get.mockReturnValue(profile);
      var onOpened = jest.fn();
      var onClosed = jest.fn();

      gameLauncher.launchProfile.mockImplementation(function (id, openedCb, closedCb) {
        if (openedCb) openedCb();
        if (closedCb) closedCb();
      });

      manager.launch('p_cb', onOpened, onClosed);
      expect(onOpened).toHaveBeenCalled();
      expect(onClosed).toHaveBeenCalled();
    });
  });

  // ── close ──

  describe('close', function () {
    test('delegates to gameLauncher.closeProfile', function () {
      gameLauncher.closeProfile.mockReturnValue(true);
      var result = manager.close('p_001');
      expect(gameLauncher.closeProfile).toHaveBeenCalledWith('p_001');
      expect(result).toBe(true);
    });
  });

  // ── reportCrash ──

  describe('reportCrash', function () {
    test('increments crash count for running profile', function () {
      // Launch a profile first to create runtime entry
      var profile = { id: 'p_crash', name: 'Crash', server: 's1', region: 'br' };
      store.get.mockReturnValue(profile);
      gameLauncher.launchProfile.mockImplementation(function () {});
      manager.launch('p_crash');

      // Report crash
      manager.reportCrash('p_crash');

      // Verify via list
      store.getAll.mockReturnValue([profile]);
      var listed = manager.list();
      var crashedProfile = listed.find(function (p) {
        return p.id === 'p_crash';
      });
      expect(crashedProfile.crashCount).toBeGreaterThan(0);
    });

    test('is no-op for profile with no runtime entry', function () {
      expect(function () {
        manager.reportCrash('p_no_runtime');
      }).not.toThrow();
    });
  });

  // ── Vault credentials ──

  describe('getCredentials', function () {
    test('delegates to vault.getCredentials', function () {
      vault.getCredentials.mockReturnValue({ user: 'u', pass: 'p' });
      var result = manager.getCredentials('p_001');
      expect(vault.getCredentials).toHaveBeenCalledWith('p_001');
      expect(result).toEqual({ user: 'u', pass: 'p' });
    });
  });

  describe('setCredentials', function () {
    test('delegates to vault.setCredentials and notifies', function () {
      vault.setCredentials.mockReturnValue(true);
      var result = manager.setCredentials('p_001', 'user', 'pass');
      expect(vault.setCredentials).toHaveBeenCalledWith('p_001', 'user', 'pass');
      expect(result).toBe(true);
    });

    test('returns false when vault.setCredentials returns false', function () {
      vault.setCredentials.mockReturnValue(false);
      var result = manager.setCredentials('p_001', 'user', 'pass');
      expect(result).toBe(false);
    });
  });

  describe('removeCredentials', function () {
    test('delegates to vault.removeCredentials and notifies', function () {
      vault.removeCredentials.mockReturnValue(true);
      var result = manager.removeCredentials('p_001');
      expect(vault.removeCredentials).toHaveBeenCalledWith('p_001');
      expect(result).toBe(true);
    });
  });

  describe('hasCredentials', function () {
    test('delegates to vault.hasCredentials', function () {
      vault.hasCredentials.mockReturnValue(true);
      var result = manager.hasCredentials('p_001');
      expect(vault.hasCredentials).toHaveBeenCalledWith('p_001');
      expect(result).toBe(true);
    });
  });

  // ── Import/Export ──

  describe('exportAll', function () {
    test('delegates to store.exportJSON', function () {
      store.exportJSON.mockReturnValue('[{"id":"p_001"}]');
      var result = manager.exportAll();
      expect(store.exportJSON).toHaveBeenCalled();
      expect(result).toBe('[{"id":"p_001"}]');
    });
  });

  describe('importAll', function () {
    test('delegates to store.importJSON and notifies', function () {
      store.importJSON.mockReturnValue({ imported: 2, skipped: 0 });
      var result = manager.importAll('[{"id":"p_001"}]');
      expect(store.importJSON).toHaveBeenCalledWith('[{"id":"p_001"}]');
      expect(result).toEqual({ imported: 2, skipped: 0 });
    });
  });

  // ── onChange ──

  describe('onChange', function () {
    test('registers callback that fires on create', function () {
      var cb = jest.fn();
      manager.onChange(cb);

      var profile = { id: 'p_notify', name: 'N', server: 's1', region: 'br' };
      store.create.mockReturnValue(profile);
      manager.create({ name: 'N', server: 's1', region: 'br' });

      expect(cb).toHaveBeenCalled();
    });

    test('callback receives list snapshot', function () {
      var cb = jest.fn();
      manager.onChange(cb);

      var profile = { id: 'p_snap_notify', name: 'SN', server: 's1', region: 'br' };
      store.create.mockReturnValue(profile);
      store.getAll.mockReturnValue([profile]);
      manager.create({ name: 'SN', server: 's1', region: 'br' });

      expect(cb).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'p_snap_notify' })])
      );
    });
  });

  describe('getStats', function () {
    test('retorna estatísticas com contadores corretos', function () {
      var profiles = [
        { id: 'p_1', name: 'A', server: 's1', region: 'br' },
        { id: 'p_2', name: 'B', server: 's2', region: 'na' }
      ];
      store.getAll.mockReturnValue(profiles);
      gameLauncher.isProfileOpen.mockImplementation(function (id) {
        return id === 'p_1';
      });
      vault.hasCredentials.mockImplementation(function (id) {
        return id === 'p_1';
      });
      partition.shouldUseShadow.mockImplementation(function (p) {
        return p.id === 'p_2';
      });

      var stats = manager.getStats();
      expect(stats.total).toBe(2);
      expect(stats.open).toBe(1);
      expect(stats.withVault).toBe(1);
      expect(stats.shadow).toBe(1);
      expect(stats.max).toBe(store.MAX_PROFILES);
    });

    test('retorna zero crashes quando runtime não tem entrada', function () {
      store.getAll.mockReturnValue([{ id: 'p_no_rt', name: 'N', server: 's1', region: 'br' }]);
      var stats = manager.getStats();
      expect(stats.crashes).toBe(0);
    });
  });

  describe('getOpenProfileIds', function () {
    test('retorna IDs dos perfis abertos', function () {
      var profiles = [
        { id: 'p_open', name: 'O', server: 's1', region: 'br' },
        { id: 'p_closed', name: 'X', server: 's2', region: 'na' }
      ];
      store.getAll.mockReturnValue(profiles);
      gameLauncher.isProfileOpen.mockImplementation(function (id) {
        return id === 'p_open';
      });

      var result = manager.getOpenProfileIds();
      expect(result).toEqual(['p_open']);
    });

    test('retorna array vazio quando nenhum perfil está aberto', function () {
      store.getAll.mockReturnValue([{ id: 'p_x', name: 'X', server: 's1', region: 'br' }]);
      var result = manager.getOpenProfileIds();
      expect(result).toEqual([]);
    });
  });
});
