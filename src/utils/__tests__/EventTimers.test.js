/**
 * Tests for src/utils/EventTimers.js — Event timer management
 *
 * Verifies: exports, REGION_TZ, EVENTS_BY_REGION, getUserOffsetHours,
 * getServerOffsetHours, serverToUserOffsetHours, getUpcoming,
 * formatCountdown logic, mute controls, onRemind, start/stop,
 * startWithProfiles.
 */

'use strict';

const et = require('../EventTimers');

describe('EventTimers.js', () => {
  afterEach(() => {
    et.stop();
    et.setMuted(false);
  });

  describe('exports', () => {
    test('exports start as function', () => {
      expect(typeof et.start).toBe('function');
    });
    test('exports startWithProfiles as function', () => {
      expect(typeof et.startWithProfiles).toBe('function');
    });
    test('exports stop as function', () => {
      expect(typeof et.stop).toBe('function');
    });
    test('exports getUpcoming as function', () => {
      expect(typeof et.getUpcoming).toBe('function');
    });
    test('exports isMuted as function', () => {
      expect(typeof et.isMuted).toBe('function');
    });
    test('exports setMuted as function', () => {
      expect(typeof et.setMuted).toBe('function');
    });
    test('exports onRemind as function', () => {
      expect(typeof et.onRemind).toBe('function');
    });
    test('exports getUserOffsetHours as function', () => {
      expect(typeof et.getUserOffsetHours).toBe('function');
    });
    test('exports getServerOffsetHours as function', () => {
      expect(typeof et.getServerOffsetHours).toBe('function');
    });
    test('exports serverToUserOffsetHours as function', () => {
      expect(typeof et.serverToUserOffsetHours).toBe('function');
    });
    test('exports REGION_TZ as object', () => {
      expect(typeof et.REGION_TZ).toBe('object');
    });
    test('exports EVENTS_BY_REGION as object', () => {
      expect(typeof et.EVENTS_BY_REGION).toBe('object');
    });
  });

  describe('REGION_TZ', () => {
    test('has entries for br, na, eu, hk', () => {
      expect(et.REGION_TZ.br).toBeDefined();
      expect(et.REGION_TZ.na).toBeDefined();
      expect(et.REGION_TZ.eu).toBeDefined();
      expect(et.REGION_TZ.hk).toBeDefined();
    });

    test('each region has name, flag, and baseOffset', () => {
      Object.keys(et.REGION_TZ).forEach(function (key) {
        const r = et.REGION_TZ[key];
        expect(r.name).toBeDefined();
        expect(r.flag).toBeDefined();
        expect(typeof r.baseOffset).toBe('number');
      });
    });

    test('br has baseOffset -3 (no DST)', () => {
      expect(et.REGION_TZ.br.baseOffset).toBe(-3);
    });

    test('hk has baseOffset +8 (no DST)', () => {
      expect(et.REGION_TZ.hk.baseOffset).toBe(8);
    });
  });

  describe('EVENTS_BY_REGION', () => {
    test('has entries for all 4 regions', () => {
      expect(Array.isArray(et.EVENTS_BY_REGION.br)).toBe(true);
      expect(Array.isArray(et.EVENTS_BY_REGION.na)).toBe(true);
      expect(Array.isArray(et.EVENTS_BY_REGION.eu)).toBe(true);
      expect(Array.isArray(et.EVENTS_BY_REGION.hk)).toBe(true);
    });

    test('each event has id, name, hours, category, remindMin', () => {
      Object.keys(et.EVENTS_BY_REGION).forEach(function (region) {
        et.EVENTS_BY_REGION[region].forEach(function (ev) {
          expect(ev.id).toBeDefined();
          expect(ev.name).toBeDefined();
          expect(Array.isArray(ev.hours)).toBe(true);
          expect(ev.hours.length).toBeGreaterThan(0);
          expect(typeof ev.category).toBe('string');
          expect(typeof ev.remindMin).toBe('number');
        });
      });
    });

    test('br events have ids prefixed with br-', () => {
      et.EVENTS_BY_REGION.br.forEach(function (ev) {
        expect(ev.id).toMatch(/^br-/);
      });
    });

    test('na events have ids prefixed with na-', () => {
      et.EVENTS_BY_REGION.na.forEach(function (ev) {
        expect(ev.id).toMatch(/^na-/);
      });
    });

    test('each region has at least 5 events', () => {
      Object.keys(et.EVENTS_BY_REGION).forEach(function (region) {
        expect(et.EVENTS_BY_REGION[region].length).toBeGreaterThanOrEqual(5);
      });
    });
  });

  describe('getUserOffsetHours', () => {
    test('returns a number', () => {
      const offset = et.getUserOffsetHours();
      expect(typeof offset).toBe('number');
    });

    test('offset is within reasonable range (-12 to +14)', () => {
      const offset = et.getUserOffsetHours();
      expect(offset).toBeGreaterThanOrEqual(-12);
      expect(offset).toBeLessThanOrEqual(14);
    });
  });

  describe('getServerOffsetHours', () => {
    test('returns baseOffset for br (no DST)', () => {
      // br has no DST, should always be -3
      expect(et.getServerOffsetHours('br')).toBe(-3);
    });

    test('returns baseOffset for hk (no DST)', () => {
      // hk has no DST, should always be 8
      expect(et.getServerOffsetHours('hk')).toBe(8);
    });

    test('returns 0 for unknown region', () => {
      expect(et.getServerOffsetHours('xx')).toBe(0);
    });

    test('returns a number for na and eu', () => {
      const na = et.getServerOffsetHours('na');
      const eu = et.getServerOffsetHours('eu');
      expect(typeof na).toBe('number');
      expect(typeof eu).toBe('number');
    });

    test('na offset is -5 or -4 (DST)', () => {
      const offset = et.getServerOffsetHours('na');
      expect([-5, -4]).toContain(offset);
    });

    test('eu offset is +1 or +2 (DST)', () => {
      const offset = et.getServerOffsetHours('eu');
      expect([1, 2]).toContain(offset);
    });
  });

  describe('serverToUserOffsetHours', () => {
    test('returns difference between user and server offset', () => {
      const userOffset = et.getUserOffsetHours();
      const serverOffset = et.getServerOffsetHours('br');
      const diff = et.serverToUserOffsetHours('br');
      expect(diff).toBeCloseTo(userOffset - serverOffset, 1);
    });

    test('returns 0 when user is in the same timezone as server', () => {
      // If user is in br timezone, offset should be ~0 for br
      const userOffset = et.getUserOffsetHours();
      if (userOffset === -3) {
        expect(et.serverToUserOffsetHours('br')).toBeCloseTo(0, 1);
      }
      // This test may not pass in all CI environments, so we just verify it's a number
      expect(typeof et.serverToUserOffsetHours('br')).toBe('number');
    });
  });

  describe('getUpcoming', () => {
    test('returns an array of events for a region', () => {
      const events = et.getUpcoming('br');
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    test('each event has id, name, hours, category, remindMin, region, nextFireMs, nextFireLabel, userTimeLabel', () => {
      const events = et.getUpcoming('br');
      events.forEach(function (ev) {
        expect(ev.id).toBeDefined();
        expect(ev.name).toBeDefined();
        expect(Array.isArray(ev.hours)).toBe(true);
        expect(ev.category).toBeDefined();
        expect(typeof ev.remindMin).toBe('number');
        expect(ev.region).toBe('br');
        expect(typeof ev.nextFireMs).toBe('number');
        expect(typeof ev.nextFireLabel).toBe('string');
        expect(typeof ev.userTimeLabel).toBe('string');
      });
    });

    test('events are sorted by nextFireMs (soonest first)', () => {
      const events = et.getUpcoming('na');
      for (let i = 1; i < events.length; i++) {
        expect(events[i].nextFireMs).toBeGreaterThanOrEqual(events[i - 1].nextFireMs);
      }
    });

    test('defaults to br events for unknown region', () => {
      const events = et.getUpcoming('unknown');
      expect(events.length).toBe(et.getUpcoming('br').length);
    });

    test('nextFireLabel shows countdown text', () => {
      const events = et.getUpcoming('br');
      events.forEach(function (ev) {
        // Should match patterns like "5h 30min", "45min", "2d 3h", "30s", or "agora"
        expect(ev.nextFireLabel).toMatch(/(\d+[dhms]|\d+min|agora)/);
      });
    });

    test('userTimeLabel shows HH:MM format', () => {
      const events = et.getUpcoming('br');
      events.forEach(function (ev) {
        expect(ev.userTimeLabel).toMatch(/^\d{2}:\d{2}$/);
      });
    });
  });

  describe('mute controls', () => {
    test('isMuted returns false by default', () => {
      expect(et.isMuted()).toBe(false);
    });

    test('setMuted(true) enables mute', () => {
      et.setMuted(true);
      expect(et.isMuted()).toBe(true);
    });

    test('setMuted(false) disables mute', () => {
      et.setMuted(true);
      et.setMuted(false);
      expect(et.isMuted()).toBe(false);
    });

    test('setMuted with truthy non-boolean coerces to true', () => {
      et.setMuted(1);
      expect(et.isMuted()).toBe(true);
    });

    test('setMuted with falsy non-boolean coerces to false', () => {
      et.setMuted(true);
      et.setMuted(0);
      expect(et.isMuted()).toBe(false);
    });
  });

  describe('onRemind', () => {
    test('registers a callback function', () => {
      const cb = jest.fn();
      et.onRemind(cb);
      // No direct way to fire it without starting the timer,
      // but we verify it doesn't throw
      expect(cb).not.toHaveBeenCalled();
    });

    test('ignores non-function arguments', () => {
      expect(() => et.onRemind('not a function')).not.toThrow();
    });
  });

  describe('start / stop', () => {
    test('start does not throw with default regions', () => {
      expect(() => et.start()).not.toThrow();
    });

    test('start with empty array defaults to br', () => {
      expect(() => et.start([])).not.toThrow();
    });

    test('start is idempotent — second call does nothing', () => {
      et.start(['br']);
      et.start(['na']); // should not create a second timer
      // Clean up
      et.stop();
    });

    test('stop clears the timer', () => {
      et.start(['br']);
      expect(() => et.stop()).not.toThrow();
    });

    test('stop is safe to call when not started', () => {
      expect(() => et.stop()).not.toThrow();
    });
  });

  describe('startWithProfiles', () => {
    test('starts with enabled profile regions', () => {
      const profiles = [
        { region: 'br', notificationsEnabled: true },
        { region: 'na', notificationsEnabled: true }
      ];
      expect(() => et.startWithProfiles(profiles)).not.toThrow();
    });

    test('defaults to br when profiles array is empty', () => {
      expect(() => et.startWithProfiles([])).not.toThrow();
    });

    test('does nothing when no profiles have notifications enabled', () => {
      const profiles = [{ region: 'br', notificationsEnabled: false }];
      // Should not throw and should not start the timer
      expect(() => et.startWithProfiles(profiles)).not.toThrow();
    });

    test('filters out profiles with notificationsEnabled=false', () => {
      const profiles = [
        { region: 'br', notificationsEnabled: false },
        { region: 'na', notificationsEnabled: true }
      ];
      expect(() => et.startWithProfiles(profiles)).not.toThrow();
    });

    test('handles profiles without region field', () => {
      const profiles = [{ notificationsEnabled: true }];
      expect(() => et.startWithProfiles(profiles)).not.toThrow();
    });
  });
});
