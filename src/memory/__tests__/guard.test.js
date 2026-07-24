/**
 * Tests for src/memory/guard.js — alias re-export of MemoryGuard
 *
 * guard.js (GcDaemon removed in v1.1.2) is now a 1-line module:
 *     module.exports = require('./MemoryGuard');
 *
 * The full MemoryGuard test suite lives in MemoryGuard.test.js. This file
 * focuses on the alias contract:
 *   1. The alias re-exports the same object as MemoryGuard.
 *   2. Every documented public API key from the MemoryGuard header comment
 *      is present on the alias.
 *   3. State mutations through the alias are observable through MemoryGuard
 *      (proves they share module state, not a copy).
 */

'use strict';

// Mock partition to avoid side effects from setForceLowSpec (matches the
// pattern used by MemoryGuard.test.js).
jest.mock('../../profiles/partition', () => ({
  setLowSpecMode: jest.fn()
}));

const guard = require('../guard');
const MemoryGuard = require('../MemoryGuard');

describe('memory/guard.js (alias re-export)', () => {
  afterEach(() => {
    // Restore default low-spec state so tests don't bleed into each other.
    MemoryGuard.setForceLowSpec(false);
  });

  test('guard === MemoryGuard (same module object reference)', () => {
    // guard.js: `module.exports = require('./MemoryGuard')`
    expect(guard).toBe(MemoryGuard);
  });

  test('exports getStats as function', () => {
    expect(typeof guard.getStats).toBe('function');
  });

  test('exports isLowSpecMode as function', () => {
    expect(typeof guard.isLowSpecMode).toBe('function');
  });

  test('exports isMinimal as function', () => {
    expect(typeof guard.isMinimal).toBe('function');
  });

  test('exports getThreshold as function', () => {
    expect(typeof guard.getThreshold).toBe('function');
  });

  test('exports setForceLowSpec as function', () => {
    expect(typeof guard.setForceLowSpec).toBe('function');
  });

  test('exports reportCrash as function', () => {
    expect(typeof guard.reportCrash).toBe('function');
  });

  test('exports IS_LOW_SPEC as boolean', () => {
    expect(typeof guard.IS_LOW_SPEC).toBe('boolean');
  });

  test('exports IS_MINIMAL as boolean', () => {
    expect(typeof guard.IS_MINIMAL).toBe('boolean');
  });

  test('exports SYSTEM_RAM_GB as positive number', () => {
    expect(typeof guard.SYSTEM_RAM_GB).toBe('number');
    expect(guard.SYSTEM_RAM_GB).toBeGreaterThan(0);
  });

  test('state mutations through alias are visible through MemoryGuard (shared state)', () => {
    // Set via alias, read via MemoryGuard — proves they share module state.
    const before = MemoryGuard.getStats().crashCount;
    guard.reportCrash();
    expect(MemoryGuard.getStats().crashCount).toBe(before + 1);
  });

  test('setForceLowSpec via alias updates threshold visible via MemoryGuard', () => {
    guard.setForceLowSpec(true);
    // lowSpec threshold is 450MB (per MemoryGuard CONFIG).
    expect(MemoryGuard.getThreshold()).toBe(450);
    expect(MemoryGuard.isLowSpecMode()).toBe(true);
  });
});
