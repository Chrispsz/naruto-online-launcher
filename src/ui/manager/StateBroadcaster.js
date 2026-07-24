/**
 * ui/manager/StateBroadcaster.js — Push de estado para a UI (Fase 3c split)
 *
 * Single Responsibility (SRP): push state snapshots (profiles, memory,
 * eventos) para o renderer do manager via IPC, em intervalos e em resposta a
 * mudanças. Não cria janelas nem registra handlers de ação — isso é papel do
 * ManagerWindow e IpcRouter.
 *
 * Histórico: era parte do God Object controller.js. Split: este módulo cuida
 * só do broadcast de estado.
 */

'use strict';

const store = require('../../profiles/store');
const et = require('../../utils/EventTimers');
const vault = require('../../profiles/vault');
const partition = require('../../profiles/partition');
const ManagerWindow = require('./ManagerWindow');

// Guards anti-duplicação de listeners (v3.6.2)
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
 * Registra listeners de mudança de estado (event remind, store changes)
 * e inicia o timer de refresh periódico (30s).
 * Idempotente — seguro chamar múltiplas vezes.
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
