/**
 * ui/manager/StateBroadcaster.js — Push de estado para a UI (Fase 3c split)
 *
 * Responsabilidade ÚNICA (SRP): empurrar snapshots de estado (perfis, memória,
 * eventos) para o renderer do manager via IPC, em intervalos e em resposta a
 * mudanças. Não cria janelas nem registra handlers de ação — isso é papel do
 * ManagerWindow e IpcRouter.
 *
 * Histórico: era parte do God Object controller.js. Split: este módulo cuida
 * só do broadcast de estado.
 */

'use strict';

const store = require('../../profiles/store');
const mg = require('../../memory/guard');
const et = require('../../utils/EventTimers');
const vault = require('../../profiles/vault');
const partition = require('../../profiles/partition');
const ManagerWindow = require('./ManagerWindow');

// Guards anti-duplicação de listeners (v3.6.2)
let _memCb = null,
  _gcCb = null,
  _remindCb = null;
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

function pushMemory() {
  ManagerWindow.send('memory:update', mg.getStats());
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
  pushMemory();
  pushEvents();
}

/**
 * Registra listeners de mudança de estado (memory guard, GC, event remind,
 * store changes) e inicia o timer de refresh periódico (30s).
 * Idempotente — seguro chamar múltiplas vezes.
 */
function startAutoRefresh() {
  if (_started) return;
  _started = true;

  if (!_memCb) {
    _memCb = function () {
      pushMemory();
    };
    mg.onMemoryUpdate(_memCb);
  }
  if (!_gcCb) {
    _gcCb = function () {
      pushMemory();
    };
    mg.onGC(_gcCb);
  }
  if (!_remindCb) {
    _remindCb = function () {
      pushEvents();
    };
    et.onRemind(_remindCb);
  }

  if (_pushTimer) clearInterval(_pushTimer);
  _pushTimer = setInterval(function () {
    pushEvents();
    pushMemory();
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
  pushMemory: pushMemory,
  pushEvents: pushEvents,
  pushAll: pushAll,
  startAutoRefresh: startAutoRefresh,
  stopAutoRefresh: stopAutoRefresh
};
