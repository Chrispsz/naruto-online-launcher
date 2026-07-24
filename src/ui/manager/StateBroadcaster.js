/**
 * ui/manager/StateBroadcaster.js — State push to UI (Phase 3c split)
 *
 * Single Responsibility (SRP): push state snapshots (profiles, memory,
 * events) to the manager renderer via IPC, at intervals and in response to
 * changes. Does not create windows or register action handlers — that is the role of
 * ManagerWindow e IpcRouter.
 *
 * History: was part of the God Object controller.js. Split: this module handles
 * only state broadcast.
 */

'use strict';

const store = require('../../profiles/store');
const et = require('../../utils/EventTimers');
const vault = require('../../profiles/vault');
const partition = require('../../profiles/partition');
const ManagerWindow = require('./ManagerWindow');

// Anti-duplication guards for listeners (v3.6.2)
let _remindCb = null;
let _pushTimer = null;
let _storeChangeCb = null;
let _started = false;

function _activeRegions() {
  const seen = [];
  store.getAll().forEach(function (p) {
    if (p.region && seen.indexOf(p.region) === -1) seen.push(p.region);
  });
  return seen.length ? seen : ['br'];
}

function pushProfiles() {
  const list = store.getAll().map(function (p) {
    return Object.assign({}, p, {
      hasVault: vault.hasCredentials(p.id),
      shadow: partition.shouldUseShadow(p)
    });
  });
  ManagerWindow.send('profiles:updated', list);
}

function pushEvents(region) {
  const regions = region ? [region] : _activeRegions();
  const all = {};
  regions.forEach(function (r) {
    all[r] = et.getUpcoming(r);
  });
  ManagerWindow.send('events:update', { byRegion: all, userOffset: et.getUserOffsetHours() });
}

function pushAll() {
  pushProfiles();
  pushEvents();
}

/**
 * Registers state-change listeners (event remind, store changes)
 * and starts the periodic refresh timer (30s).
 * Idempotent — safe to call multiple times.
 */
function startAutoRefresh() {
  if (_started) return;
  _started = true;

  if (!_remindCb) {
    _remindCb = function () {
      pushEvents();
    };
    et.onRemind(_remindCb);
  }

  if (_pushTimer) clearInterval(_pushTimer);
  _pushTimer = setInterval(function () {
    pushEvents();
  }, 30000);
  if (_pushTimer.unref) _pushTimer.unref();

  if (!_storeChangeCb) {
    _storeChangeCb = function () {
      pushProfiles();
    };
    store.onChange(_storeChangeCb);
  }
}

function stopAutoRefresh() {
  if (_pushTimer) {
    clearInterval(_pushTimer);
    _pushTimer = null;
  }
  _started = false;
}

module.exports = {
  pushProfiles: pushProfiles,
  pushEvents: pushEvents,
  pushAll: pushAll,
  startAutoRefresh: startAutoRefresh,
  stopAutoRefresh: stopAutoRefresh
};
