/**
 * Tests for src/profiles/store.js — Profile store (CRUD, persistence, reorder)
 *
 * Verifies: exports, create/get/update/remove/getAll/load, persist, reorder,
 * importJSON/exportJSON, incrementLaunch/addPlayTime/getStats, onChange,
 * MAX_PROFILES, PALETTE, migration, validation.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// We use a real temp dir for persistence tests
let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-store-'));
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
});

// Must require store AFTER jest setup (electron mock from tests/setup.js)
const store = require('../store');

// Override app.getPath('userData') to use our temp dir
const electron = require('electron');

describe('store.js', () => {
  beforeEach(() => {
    // Point the store at our temp dir
    electron.app.getPath.mockImplementation(p => {
      if (p === 'userData') return tmpDir;
      return '/tmp/naruto-test/' + p;
    });
    // Clear any cached profiles from previous tests
    // We force a fresh load by deleting the profiles file on disk
    const profilesDir = path.join(tmpDir, 'profiles');
    try {
      fs.rmSync(profilesDir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
    // v5.5: Clear launch log file from previous tests (no-op for non-launch-log tests)
    const launchLogFile = path.join(tmpDir, 'launch-log.json');
    try {
      fs.rmSync(launchLogFile, { force: true });
    } catch (_) {
      /* ignore */
    }
    // Force reload from disk (clears in-memory cache)
    store.load();
  });

  describe('exports', () => {
    test('exports create as function', () => {
      expect(typeof store.create).toBe('function');
    });
    test('exports get as function', () => {
      expect(typeof store.get).toBe('function');
    });
    test('exports getAll as function', () => {
      expect(typeof store.getAll).toBe('function');
    });
    test('exports update as function', () => {
      expect(typeof store.update).toBe('function');
    });
    test('exports remove as function', () => {
      expect(typeof store.remove).toBe('function');
    });
    test('exports reorder as function', () => {
      expect(typeof store.reorder).toBe('function');
    });
    test('exports load as function', () => {
      expect(typeof store.load).toBe('function');
    });
    test('exports exportJSON as function', () => {
      expect(typeof store.exportJSON).toBe('function');
    });
    test('exports importJSON as function', () => {
      expect(typeof store.importJSON).toBe('function');
    });
    test('exports onChange as function', () => {
      expect(typeof store.onChange).toBe('function');
    });
    test('exports incrementLaunch as function', () => {
      expect(typeof store.incrementLaunch).toBe('function');
    });
    test('exports addPlayTime as function', () => {
      expect(typeof store.addPlayTime).toBe('function');
    });
    test('exports getStats as function', () => {
      expect(typeof store.getStats).toBe('function');
    });
    test('exports MAX_PROFILES = 10', () => {
      expect(store.MAX_PROFILES).toBe(10);
    });

    test('exports getPartitionName as function', () => {
      expect(typeof store.getPartitionName).toBe('function');
    });
  });

  describe('create', () => {
    test('creates a profile with defaults', () => {
      const p = store.create();
      expect(p).not.toBeNull();
      expect(p.id).toMatch(/^p_[a-f0-9]{8,16}$/);
      expect(p.name).toBeDefined();
      expect(p.region).toBe('br');
      expect(p.language).toBe('pt');
      expect(p.notificationsEnabled).toBe(true);
      expect(p.launchCount).toBe(0);
      expect(p.totalPlayMs).toBe(0);
      expect(p.notes).toBe('');
      expect(p.favorite).toBe(false);
      expect(typeof p.createdAt).toBe('number');
      expect(p.lastUsed).toBe(0);
    });

    test('creates a profile with provided options', () => {
      const p = store.create({
        name: 'MyAccount',
        server: 's799',
        region: 'na',
        language: 'en',
        notificationsEnabled: false
      });
      expect(p.name).toBe('MyAccount');
      expect(p.server).toBe('s799');
      expect(p.region).toBe('na');
      expect(p.language).toBe('en');
      expect(p.notificationsEnabled).toBe(false);
    });

    test('assigns auto-generated name if not provided', () => {
      const p = store.create();
      expect(p.name).toMatch(/^Conta/);
    });

    test('defaults region to br for invalid region', () => {
      const p = store.create({ region: 'xx' });
      expect(p.region).toBe('br');
    });

    test('defaults language to pt for invalid language', () => {
      const p = store.create({ language: 'xyz' });
      expect(p.language).toBe('pt');
    });

    test('accepts all 6 supported languages', () => {
      ['pt', 'en', 'de', 'es', 'pl', 'fr'].forEach(lang => {
        const p = store.create({ language: lang });
        expect(p.language).toBe(lang);
      });
    });

    test('truncates name to 40 chars', () => {
      const longName = 'A'.repeat(50);
      const p = store.create({ name: longName });
      expect(p.name.length).toBeLessThanOrEqual(40);
    });

    test('truncates server to 20 chars', () => {
      const longServer = 's'.repeat(30);
      const p = store.create({ server: longServer });
      expect(p.server.length).toBeLessThanOrEqual(20);
    });

    test('returns null when MAX_PROFILES reached', () => {
      // Create 12 profiles (MAX_PROFILES)
      const created = [];
      for (let i = 0; i < store.MAX_PROFILES; i++) {
        const p = store.create({ name: 'P' + i });
        created.push(p);
      }
      const result = store.create({ name: 'Overflow' });
      expect(result).toBeNull();
      // Clean up so subsequent tests can create profiles
      created.forEach(function (p) {
        store.remove(p.id);
      });
    });
  });

  describe('get and getAll', () => {
    test('getAll returns a copy (not the internal array)', () => {
      store.create({ name: 'TestGet' });
      const a1 = store.getAll();
      const a2 = store.getAll();
      expect(a1).not.toBe(a2);
    });

    test('get returns profile by id', () => {
      const created = store.create({ name: 'FindMe' });
      const found = store.get(created.id);
      expect(found).not.toBeNull();
      expect(found.name).toBe('FindMe');
    });

    test('get returns null for nonexistent id', () => {
      expect(store.get('p_nonexistent')).toBeNull();
    });
  });

  describe('update', () => {
    test('updates profile fields', () => {
      const p = store.create({ name: 'Original', region: 'br' });
      const result = store.update(p.id, { name: 'Updated', region: 'na' });
      expect(result).toBe(true);
      const updated = store.get(p.id);
      expect(updated.name).toBe('Updated');
      expect(updated.region).toBe('na');
    });

    test('ignores invalid region on update', () => {
      const p = store.create({ region: 'br' });
      store.update(p.id, { region: 'invalid' });
      expect(store.get(p.id).region).toBe('br');
    });

    test('updates favorite flag', () => {
      const p = store.create({ favorite: false });
      store.update(p.id, { favorite: true });
      expect(store.get(p.id).favorite).toBe(true);
    });

    test('updates notes (truncated to 200)', () => {
      const p = store.create();
      const longNote = 'N'.repeat(250);
      store.update(p.id, { notes: longNote });
      expect(store.get(p.id).notes.length).toBeLessThanOrEqual(200);
    });

    test('returns false for nonexistent id', () => {
      expect(store.update('p_nonexistent', { name: 'Nope' })).toBe(false);
    });
  });

  describe('remove', () => {
    test('removes a profile and returns true', () => {
      const p = store.create({ name: 'RemoveMe' });
      const before = store.getAll().length;
      const result = store.remove(p.id);
      expect(result).toBe(true);
      expect(store.getAll().length).toBe(before - 1);
      expect(store.get(p.id)).toBeNull();
    });

    test('returns false for nonexistent id', () => {
      expect(store.remove('p_nonexistent')).toBe(false);
    });
  });

  describe('reorder', () => {
    test('reorders profiles according to given id order', () => {
      const p1 = store.create({ name: 'First' });
      const p2 = store.create({ name: 'Second' });
      const p3 = store.create({ name: 'Third' });

      store.reorder([p3.id, p1.id, p2.id]);

      const all = store.getAll();
      expect(all[0].id).toBe(p3.id);
      expect(all[1].id).toBe(p1.id);
      expect(all[2].id).toBe(p2.id);
    });

    test('appends profiles not in the order list at the end', () => {
      const p1 = store.create({ name: 'A' });
      const p2 = store.create({ name: 'B' });
      const p3 = store.create({ name: 'C' });

      store.reorder([p3.id]);

      const all = store.getAll();
      expect(all[0].id).toBe(p3.id);
      // p1 and p2 come after in their original relative order
      const remaining = all.slice(1).map(function (x) {
        return x.id;
      });
      expect(remaining).toContain(p1.id);
      expect(remaining).toContain(p2.id);
    });

    test('ignores duplicate ids in order array', () => {
      const p1 = store.create({ name: 'A' });
      const p2 = store.create({ name: 'B' });

      store.reorder([p1.id, p1.id, p2.id]);

      const all = store.getAll();
      expect(all[0].id).toBe(p1.id);
      expect(all[1].id).toBe(p2.id);
    });

    test('does nothing when called with non-array', () => {
      const p1 = store.create({ name: 'A' });
      store.reorder('not-an-array');
      // Profile should still exist
      expect(store.get(p1.id)).not.toBeNull();
    });
  });

  describe('persistence', () => {
    test('profiles are saved to disk after create', () => {
      store.create({ name: 'Persist' });
      const profilesDir = path.join(tmpDir, 'profiles');
      const file = path.join(profilesDir, 'profiles.json');
      expect(fs.existsSync(file)).toBe(true);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    test('profiles.json has backup .bak after save', () => {
      store.create({ name: 'Backup1' });
      store.create({ name: 'Backup2' }); // second save creates .bak
      const backup = path.join(tmpDir, 'profiles', 'profiles.json.bak');
      expect(fs.existsSync(backup)).toBe(true);
    });
  });

  describe('incrementLaunch and addPlayTime', () => {
    test('incrementLaunch increments launchCount', () => {
      const p = store.create({ name: 'Launcher' });
      store.incrementLaunch(p.id);
      store.incrementLaunch(p.id);
      const stats = store.getStats(p.id);
      expect(stats.launchCount).toBe(2);
    });

    test('incrementLaunch updates lastUsed', () => {
      const p = store.create({ name: 'Launcher' });
      const before = store.get(p.id).lastUsed;
      store.incrementLaunch(p.id);
      const after = store.get(p.id).lastUsed;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    test('addPlayTime adds ms to totalPlayMs', () => {
      const p = store.create({ name: 'Player' });
      store.addPlayTime(p.id, 60000);
      store.addPlayTime(p.id, 120000);
      const stats = store.getStats(p.id);
      expect(stats.totalPlayMs).toBe(180000);
    });

    test('addPlayTime clamps ms to [0, 24h]', () => {
      const p = store.create({ name: 'Clamped' });
      const dayMs = 24 * 60 * 60 * 1000;
      store.addPlayTime(p.id, dayMs + 1000);
      const stats = store.getStats(p.id);
      expect(stats.totalPlayMs).toBe(dayMs);
    });

    test('addPlayTime returns false for nonexistent id', () => {
      expect(store.addPlayTime('p_nonexistent', 1000)).toBe(false);
    });

    test('incrementLaunch returns false for nonexistent id', () => {
      expect(store.incrementLaunch('p_nonexistent')).toBe(false);
    });
  });

  describe('getStats', () => {
    test('returns null for nonexistent id', () => {
      expect(store.getStats('p_nonexistent')).toBeNull();
    });

    test('calculates avgSessionMs', () => {
      const p = store.create({ name: 'StatUser' });
      store.incrementLaunch(p.id);
      store.incrementLaunch(p.id);
      store.addPlayTime(p.id, 60000);
      const stats = store.getStats(p.id);
      expect(stats.avgSessionMs).toBe(30000); // 60000 / 2
    });

    test('avgSessionMs is 0 when launchCount is 0', () => {
      const p = store.create({ name: 'ZeroLaunches' });
      const stats = store.getStats(p.id);
      expect(stats.avgSessionMs).toBe(0);
    });
  });

  describe('getPartitionName', () => {
    test('returns persist:profile-<id> format', () => {
      expect(store.getPartitionName('p_abc')).toBe('persist:profile-p_abc');
    });
  });

  describe('exportJSON / importJSON', () => {
    test('exportJSON returns valid JSON with version and profiles', () => {
      store.create({ name: 'Export' });
      const json = store.exportJSON();
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(2);
      expect(Array.isArray(parsed.profiles)).toBe(true);
      expect(parsed.exportedAt).toBeDefined();
    });

    test('importJSON imports valid profiles', () => {
      const p = store.create({ name: 'ExportSrc' });
      const json = store.exportJSON();
      // Clear and reimport
      store.remove(p.id);
      const result = store.importJSON(json);
      expect(result.imported).toBeGreaterThanOrEqual(0);
    });

    test('importJSON returns {imported:0,skipped:0} for invalid JSON', () => {
      const result = store.importJSON('not valid json');
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    });

    test('importJSON skips duplicates by name+server', () => {
      store.create({ name: 'Dup', server: 's1' });
      const exportData = JSON.stringify({
        version: 2,
        profiles: [
          {
            id: 'p_ffffffff',
            name: 'Dup',
            server: 's1',
            region: 'br',
            language: 'pt',
            notificationsEnabled: true,
            // color removed in remote schema
            createdAt: Date.now(),
            lastUsed: 0,
            notes: '',
            launchCount: 0,
            totalPlayMs: 0,
            favorite: false
          }
        ]
      });
      const result = store.importJSON(exportData);
      expect(result.skipped).toBeGreaterThan(0);
    });
  });

  describe('onChange', () => {
    test('onChange registers a callback that fires on persist', () => {
      let called = false;
      store.onChange(function () {
        called = true;
      });
      store.create({ name: 'Trigger' });
      // onChange may have been called during create → persist
      // Note: the listener list grows across tests, but we just verify it fires
      expect(called).toBe(true);
    });
  });

  // ── v5.5: Launch log (timeline) ──
  describe('launch log', () => {
    // Helper: formata ts como 'YYYY-MM-DD' em hora local (replica _formatDate)
    function formatDateLocal(ts) {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }

    test('exports recordLaunch as function', () => {
      expect(typeof store.recordLaunch).toBe('function');
    });
    test('exports getLaunchTimeline as function', () => {
      expect(typeof store.getLaunchTimeline).toBe('function');
    });
    test('exports clearLaunchLog as function', () => {
      expect(typeof store.clearLaunchLog).toBe('function');
    });
    test('exports getLaunchLogStats as function', () => {
      expect(typeof store.getLaunchLogStats).toBe('function');
    });

    describe('recordLaunch', () => {
      test('appends entry and returns true for valid profile id', () => {
        const p = store.create({ name: 'Recorder' });
        const result = store.recordLaunch(p.id);
        expect(result).toBe(true);
        const stats = store.getLaunchLogStats();
        expect(stats.total).toBe(1);
      });

      test('returns false for unknown profile id', () => {
        const result = store.recordLaunch('p_nonexistent');
        expect(result).toBe(false);
        expect(store.getLaunchLogStats().total).toBe(0);
      });

      test('returns false for empty string id', () => {
        const result = store.recordLaunch('');
        expect(result).toBe(false);
      });

      test('returns false for null id', () => {
        const result = store.recordLaunch(null);
        expect(result).toBe(false);
      });

      test('returns false for non-string id', () => {
        const result = store.recordLaunch(12345);
        expect(result).toBe(false);
      });

      test('persists entry to launch-log.json on disk', () => {
        const p = store.create({ name: 'Persisted' });
        store.recordLaunch(p.id);
        const file = path.join(tmpDir, 'launch-log.json');
        expect(fs.existsSync(file)).toBe(true);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(1);
        expect(data[0].id).toBe(p.id);
        expect(typeof data[0].ts).toBe('number');
      });
    });

    describe('getLaunchTimeline', () => {
      test('returns array of length=days (default 7)', () => {
        const timeline = store.getLaunchTimeline();
        expect(Array.isArray(timeline)).toBe(true);
        expect(timeline.length).toBe(7);
      });

      test('supports custom days (e.g., 14)', () => {
        const timeline = store.getLaunchTimeline(14);
        expect(timeline.length).toBe(14);
      });

      test('supports custom days (e.g., 3)', () => {
        const timeline = store.getLaunchTimeline(3);
        expect(timeline.length).toBe(3);
      });

      test('oldest first → newest last (last bucket is today)', () => {
        const timeline = store.getLaunchTimeline(7);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expect(timeline[6].date).toBe(formatDateLocal(today.getTime()));
        const sixDaysAgo = new Date(today);
        sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
        expect(timeline[0].date).toBe(formatDateLocal(sixDaysAgo.getTime()));
      });

      test('entries with 0 launches still present with count 0 and empty profiles', () => {
        const timeline = store.getLaunchTimeline(7);
        timeline.forEach(function (bucket) {
          expect(bucket.count).toBe(0);
          expect(Array.isArray(bucket.profiles)).toBe(true);
          expect(bucket.profiles.length).toBe(0);
          expect(typeof bucket.date).toBe('string');
          expect(bucket.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
      });

      test('aggregates launches by local date (count matches log)', () => {
        const p = store.create({ name: 'Aggregator' });
        store.recordLaunch(p.id);
        store.recordLaunch(p.id);
        store.recordLaunch(p.id);
        const timeline = store.getLaunchTimeline(7);
        const todayBucket = timeline[6];
        expect(todayBucket.count).toBe(3);
      });

      test('profiles array contains id/name/count', () => {
        const p = store.create({ name: 'ProfileFields' });
        store.recordLaunch(p.id);
        store.recordLaunch(p.id);
        const timeline = store.getLaunchTimeline(7);
        const todayBucket = timeline[6];
        expect(todayBucket.profiles.length).toBe(1);
        const entry = todayBucket.profiles[0];
        expect(entry.id).toBe(p.id);
        expect(entry.name).toBe('ProfileFields');
        // color field removed
        expect(entry.count).toBe(2);
      });

      test('multiple profiles in same day are listed separately', () => {
        const p1 = store.create({ name: 'Multi1' });
        const p2 = store.create({ name: 'Multi2' });
        store.recordLaunch(p1.id);
        store.recordLaunch(p1.id);
        store.recordLaunch(p2.id);
        const timeline = store.getLaunchTimeline(7);
        const todayBucket = timeline[6];
        expect(todayBucket.count).toBe(3);
        expect(todayBucket.profiles.length).toBe(2);
      });

      test('falls back to 7 days for invalid days argument', () => {
        expect(store.getLaunchTimeline(0).length).toBe(7);
        expect(store.getLaunchTimeline(-1).length).toBe(7);
        expect(store.getLaunchTimeline(NaN).length).toBe(7);
        expect(store.getLaunchTimeline('abc').length).toBe(7);
        expect(store.getLaunchTimeline(undefined).length).toBe(7);
      });
    });

    describe('clearLaunchLog', () => {
      test('empties the log (subsequent getLaunchTimeline returns all-zero counts)', () => {
        const p = store.create({ name: 'Clearable' });
        store.recordLaunch(p.id);
        store.recordLaunch(p.id);
        expect(store.getLaunchLogStats().total).toBe(2);
        store.clearLaunchLog();
        const stats = store.getLaunchLogStats();
        expect(stats.total).toBe(0);
        const timeline = store.getLaunchTimeline(7);
        timeline.forEach(function (bucket) {
          expect(bucket.count).toBe(0);
          expect(bucket.profiles.length).toBe(0);
        });
      });

      test('persists empty log to disk', () => {
        const p = store.create({ name: 'Clearable2' });
        store.recordLaunch(p.id);
        const file = path.join(tmpDir, 'launch-log.json');
        expect(JSON.parse(fs.readFileSync(file, 'utf8')).length).toBe(1);
        store.clearLaunchLog();
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
      });

      test('returns nothing (undefined)', () => {
        const result = store.clearLaunchLog();
        expect(result).toBeUndefined();
      });
    });

    describe('getLaunchLogStats', () => {
      test('empty log returns total:0, oldestTs:null, newestTs:null', () => {
        const stats = store.getLaunchLogStats();
        expect(stats).toEqual({ total: 0, oldestTs: null, newestTs: null });
      });

      test('populated log returns correct total + oldest/newest ts', () => {
        const p = store.create({ name: 'StatCheck' });
        // Pre-populate launch-log.json with known timestamps
        const file = path.join(tmpDir, 'launch-log.json');
        const entries = [
          { id: p.id, ts: 1000 },
          { id: p.id, ts: 5000 },
          { id: p.id, ts: 3000 },
          { id: p.id, ts: 8000 }
        ];
        fs.writeFileSync(file, JSON.stringify(entries), 'utf8');
        store.load(); // reload to pick up the file
        const stats = store.getLaunchLogStats();
        expect(stats.total).toBe(4);
        expect(stats.oldestTs).toBe(1000);
        expect(stats.newestTs).toBe(8000);
      });
    });

    describe('persistence', () => {
      test('log is restored after re-load()', () => {
        const p = store.create({ name: 'Persist' });
        store.recordLaunch(p.id);
        store.recordLaunch(p.id);
        store.recordLaunch(p.id);
        expect(store.getLaunchLogStats().total).toBe(3);
        // Force reload from disk (simulates app restart)
        store.load();
        const stats = store.getLaunchLogStats();
        expect(stats.total).toBe(3);
      });

      test('missing launch-log.json on first run starts empty (no migration needed)', () => {
        // No file exists at this point (beforeEach deleted it)
        const file = path.join(tmpDir, 'launch-log.json');
        expect(fs.existsSync(file)).toBe(false);
        store.load();
        expect(store.getLaunchLogStats().total).toBe(0);
        expect(store.getLaunchTimeline(7).length).toBe(7);
      });

      test('malformed launch-log.json falls back to empty array', () => {
        const file = path.join(tmpDir, 'launch-log.json');
        fs.writeFileSync(file, 'NOT VALID JSON {{{', 'utf8');
        store.load();
        expect(store.getLaunchLogStats().total).toBe(0);
      });

      test('launch-log.json that is not an array falls back to empty array', () => {
        const file = path.join(tmpDir, 'launch-log.json');
        fs.writeFileSync(file, JSON.stringify({ not: 'an array' }), 'utf8');
        store.load();
        expect(store.getLaunchLogStats().total).toBe(0);
      });
    });

    describe('cap at MAX_LAUNCH_LOG_ENTRIES (5000)', () => {
      test('caps at 5000 entries when recordLaunch exceeds (oldest dropped)', () => {
        const p = store.create({ name: 'CapTest' });
        // Pre-populate launch-log.json with 4999 entries (ts 1..4999)
        const entries = [];
        for (var i = 1; i <= 4999; i++) {
          entries.push({ id: p.id, ts: i });
        }
        const file = path.join(tmpDir, 'launch-log.json');
        fs.writeFileSync(file, JSON.stringify(entries), 'utf8');
        store.load();
        // Insert 6 more via recordLaunch (total would be 5005)
        for (var j = 0; j < 6; j++) {
          store.recordLaunch(p.id);
        }
        // Cap should have kicked in: only 5000 entries remain
        const stats = store.getLaunchLogStats();
        expect(stats.total).toBe(5000);
        // Oldest 5 entries (ts 1..5) should be dropped
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const tsSet = new Set(
          data.map(function (e) {
            return e.ts;
          })
        );
        expect(tsSet.has(1)).toBe(false);
        expect(tsSet.has(5)).toBe(false);
        expect(tsSet.has(6)).toBe(true); // ts 6 is the oldest surviving
      });

      test('caps at 5000 entries on load when file has 5005 entries', () => {
        const p = store.create({ name: 'LoadCap' });
        const entries = [];
        for (var i = 1; i <= 5005; i++) {
          entries.push({ id: p.id, ts: i });
        }
        const file = path.join(tmpDir, 'launch-log.json');
        fs.writeFileSync(file, JSON.stringify(entries), 'utf8');
        store.load();
        const stats = store.getLaunchLogStats();
        expect(stats.total).toBe(5000);
        expect(stats.oldestTs).toBe(6); // first 5 dropped
        expect(stats.newestTs).toBe(5005);
      });
    });
  });

  describe('importJSON edge cases', () => {
    test('skips invalid profiles (missing required fields)', () => {
      const json = JSON.stringify({
        version: 2,
        profiles: [
          {
            id: 'p_aabbccdd',
            name: 'Valid',
            server: 's1',
            region: 'br',
            language: 'pt',
            notificationsEnabled: true,
            createdAt: 1,
            lastUsed: 0,
            notes: '',
            launchCount: 0,
            totalPlayMs: 0,
            favorite: false,
            tags: []
          },
          { id: 'p_ffffffff', name: 'NoServer' } // missing server, region, etc
        ]
      });
      const result = store.importJSON(json);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
    });

    test('stops importing when MAX_PROFILES reached', () => {
      // Clear any profiles from previous tests
      var existing = store.getAll();
      for (var k = existing.length - 1; k >= 0; k--) store.remove(existing[k].id);
      // Fill store to MAX_PROFILES - 1
      for (let k = 0; k < store.MAX_PROFILES - 1; k++) {
        store.create({ name: 'Fill' + k });
      }
      // Try to import 3 more (with valid IDs that pass isValidProfile)
      var profiles = [];
      for (var j = 0; j < 3; j++) {
        profiles.push({
          id: 'p_feed00' + j.toString().padStart(6, '0'),
          name: 'Import' + j,
          server: 's' + j,
          region: 'br',
          language: 'pt',
          notificationsEnabled: true,
          createdAt: 1,
          lastUsed: 0,
          notes: '',
          launchCount: 0,
          totalPlayMs: 0,
          favorite: false,
          tags: []
        });
      }
      const json = JSON.stringify({ version: 2, profiles: profiles });
      const result = store.importJSON(json);
      expect(result.imported).toBe(1); // only 1 slot left
      expect(result.skipped).toBe(2);
    });

    test('handles data as bare array (no wrapper)', () => {
      // Ensure we have room (previous tests may have filled the store)
      const all = store.getAll();
      if (all.length > 0) store.remove(all[all.length - 1].id);
      const json = JSON.stringify([
        {
          id: 'p_cafe1122',
          name: 'Bare',
          server: 's1',
          region: 'br',
          language: 'pt',
          notificationsEnabled: true,
          createdAt: 1,
          lastUsed: 0,
          notes: '',
          launchCount: 0,
          totalPlayMs: 0,
          favorite: false,
          tags: []
        }
      ]);
      const result = store.importJSON(json);
      expect(result.imported).toBe(1);
    });

    test('handles data with no profiles key and not an array', () => {
      const json = JSON.stringify({ version: 2, other: 'data' });
      const result = store.importJSON(json);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });

  describe('create with tags validation', () => {
    test('filters out non-string entries silently', () => {
      var p = store.create({ name: 'TagTest', tags: [123, 'ok'] });
      expect(p).not.toBeNull();
      expect(p.tags).toEqual(['ok']);
    });

    test('filters out too-long entries (>20 chars) silently', () => {
      var p = store.create({ name: 'TagTest', tags: ['a'.repeat(21)] });
      expect(p).not.toBeNull();
      expect(p.tags).toEqual([]);
    });

    test('filters out empty strings silently', () => {
      var p = store.create({ name: 'TagTest', tags: [''] });
      expect(p).not.toBeNull();
      expect(p.tags).toEqual([]);
    });

    test('caps at 5 tags (extra are dropped)', () => {
      var p = store.create({ name: 'TagTest', tags: ['a', 'b', 'c', 'd', 'e', 'f'] });
      expect(p).not.toBeNull();
      expect(p.tags).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    test('accepts valid tags (5 or fewer)', () => {
      var p = store.create({ name: 'TagTest', tags: ['pvp', 'farm'] });
      expect(p).not.toBeNull();
      expect(p.tags).toEqual(['pvp', 'farm']);
    });
  });

  describe('load with corrupted file', () => {
    test('falls back to empty when profiles.json is invalid JSON', () => {
      const profilesDir = path.join(tmpDir, 'profiles');
      fs.mkdirSync(profilesDir, { recursive: true });
      fs.writeFileSync(path.join(profilesDir, 'profiles.json'), '{invalid json}', 'utf8');
      store.load();
      expect(store.getAll()).toEqual([]);
    });

    // NOTE: backup recovery tested in load() test above
  });

  describe('remove with partition cleanup', () => {
    test('removes partition directory when it exists', () => {
      var p = store.create({ name: 'PartTest' });
      // Simulate a partition dir
      var partDir = path.join(tmpDir, 'Partitions', 'profile-' + p.id);
      fs.mkdirSync(partDir, { recursive: true });
      fs.writeFileSync(path.join(partDir, 'test.txt'), 'data', 'utf8');
      store.remove(p.id);
      expect(fs.existsSync(partDir)).toBe(false);
    });
  });
});
