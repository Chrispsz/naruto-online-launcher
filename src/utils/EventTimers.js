/**
 * EventTimers — Event reminders with timezone math + bilingual names
 * v2.3.0 — v1.1.0 (6-cluster model + bilingual events + days[] + end-notification)
 *
 * CHANGES (v1.1.0):
 *   - 6 server clusters: br/na/de/es/pl/fr (replaced old 4-cluster br/na/eu/hk)
 *   - eu schedule moved to de/es/pl/fr (all are European clusters, UTC+1/+2 DST)
 *   - hk removed (zh cluster DNS-dead since 2024; legacy profiles migrate hk→na)
 *   - Each event has name_pt + name_en (rendered by launcher language)
 *   - Each event has `days`: array of weekday numbers (0=Sun..6=Sat). Empty = daily.
 *   - Each event has `durationMin` (how long the event lasts)
 *   - Notification fires `remindMin` before start (configurable globally via setRemindMin)
 *   - When event ends, an "ended" notification fires (smarter: only the active badge
 *     on the Events nav item disappears; the start toast auto-dismisses)
 *
 * SUPPORTED REGIONS (6 real Naruto Online server clusters):
 *   br — America/Sao_Paulo (UTC-3, sem DST)
 *   na — America/New_York   (UTC-5/-4 DST)
 *   de — Europe/Berlin      (UTC+1/+2 DST)
 *   es — Europe/Madrid      (UTC+1/+2 DST)
 *   pl — Europe/Warsaw      (UTC+1/+2 DST)
 *   fr — Europe/Paris       (UTC+1/+2 DST)
 *
 * Validation: naruto.narutowebgame.com/{pt|en|de|es|pl|fr}/serverlist — 6 clusters.
 * Legacy codes eu/hk/pt/en are migrated by regions.js (eu→na, hk→na, pt→br, en→na).
 */

'use strict';

const { Notification } = require('electron');
const path = require('path');
const logger = require('../utils/logger');
const { normalizeRegion } = require('../config/regions');

// Approximate UTC offsets by region (without TZ libs).
// DST is auto-detected by comparing the current Date offset with the base offset.
// v1.1.1: flag field uses [XX] text tag (not emoji) — native OS notifications
// can't render SVG and Windows doesn't render flag emoji. Text tag works everywhere.
const REGION_TZ = {
  br: { name: 'Brasil', name_en: 'Brazil', flag: '[BR]', baseOffset: -3 }, // UTC-3, sem DST
  na: { name: 'América do Norte', name_en: 'North America', flag: '[NA]', baseOffset: -5 }, // UTC-5, DST -4
  de: { name: 'Deutschland', name_en: 'Germany', flag: '[DE]', baseOffset: 1 }, // UTC+1, DST +2
  es: { name: 'España', name_en: 'Spain', flag: '[ES]', baseOffset: 1 }, // UTC+1, DST +2
  pl: { name: 'Polska', name_en: 'Poland', flag: '[PL]', baseOffset: 1 }, // UTC+1, DST +2
  fr: { name: 'France', name_en: 'France', flag: '[FR]', baseOffset: 1 } // UTC+1, DST +2
};

// Event catalog by region (times in SERVER timezone)
// SOURCE (validated 2025):
//   - https://narutooasis.fandom.com/wiki/Timed_Events
//   - Patterns confirmed by the community
//
// STRUCTURE of each event:
//   id            — unique identifier
//   name_pt       — name in Portuguese
//   name_en       — name in English
//   days          — weekday array (0=Sun, 1=Mon, ..., 6=Sat). EMPTY = daily
//   hours         — array of hours (0-23) in the SERVER timezone when the event starts
//   durationMin   — duration in minutes (default 60)
//   category      — boss | arena | arena_guild | dungeon | escort | instance | social | reset
//   remindMin     — minutes before start to notify (default 5; override global via setRemindMin)
const EVENTS_BY_REGION = {
  // ── Brasil (PT) — 11 events ──
  br: [
    { id: 'br-boss-mundial', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], durationMin: 60, category: 'boss', remindMin: 5 },
    { id: 'br-arena-3v3', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], durationMin: 60, category: 'arena', remindMin: 10 },
    { id: 'br-dungeon-team', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [14, 21], durationMin: 90, category: 'dungeon', remindMin: 5 },
    { id: 'br-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], durationMin: 60, category: 'escort', remindMin: 5 },
    { id: 'br-instancia-ninja', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], durationMin: 60, category: 'instance', remindMin: 5 },
    { id: 'br-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [6, 12, 18], durationMin: 45, category: 'instance', remindMin: 0 },
    { id: 'br-guerra-cla', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [20], durationMin: 120, category: 'social', remindMin: 30 },
    { id: 'br-arena-guild', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [19], durationMin: 60, category: 'arena_guild', remindMin: 15 },
    { id: 'br-bond-checkin', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], durationMin: 30, category: 'social', remindMin: 0 },
    { id: 'br-desafio-diario', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], durationMin: 5, category: 'reset', remindMin: 0 },
    { id: 'br-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], durationMin: 5, category: 'reset', remindMin: 0 }
  ],
  // ── North America (EN) — 11 events ──
  na: [
    { id: 'na-boss-world', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [11, 19], durationMin: 60, category: 'boss', remindMin: 5 },
    { id: 'na-arena-3v3', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [17], durationMin: 60, category: 'arena', remindMin: 10 },
    { id: 'na-dungeon', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [13, 20], durationMin: 90, category: 'dungeon', remindMin: 5 },
    { id: 'na-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [10, 18], durationMin: 60, category: 'escort', remindMin: 5 },
    { id: 'na-instancia-ninja', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [9, 21], durationMin: 60, category: 'instance', remindMin: 5 },
    { id: 'na-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [5, 11, 17], durationMin: 45, category: 'instance', remindMin: 0 },
    { id: 'na-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [19], durationMin: 120, category: 'social', remindMin: 30 },
    { id: 'na-guild-arena', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [18], durationMin: 60, category: 'arena_guild', remindMin: 15 },
    { id: 'na-bond-checkin', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], durationMin: 30, category: 'social', remindMin: 0 },
    { id: 'na-desafio-diario', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], durationMin: 5, category: 'reset', remindMin: 0 },
    { id: 'na-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], durationMin: 5, category: 'reset', remindMin: 0 }
  ],
  // ── Deutschland (DE) — 11 events (European schedule, UTC+1/+2 DST) ──
  de: [
    { id: 'de-boss-world', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], durationMin: 60, category: 'boss', remindMin: 5 },
    { id: 'de-arena-3v3', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], durationMin: 60, category: 'arena', remindMin: 10 },
    { id: 'de-dungeon', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [14, 21], durationMin: 90, category: 'dungeon', remindMin: 5 },
    { id: 'de-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], durationMin: 60, category: 'escort', remindMin: 5 },
    { id: 'de-instancia-ninja', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], durationMin: 60, category: 'instance', remindMin: 5 },
    { id: 'de-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [6, 12, 18], durationMin: 45, category: 'instance', remindMin: 0 },
    { id: 'de-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [20], durationMin: 120, category: 'social', remindMin: 30 },
    { id: 'de-guild-arena', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [19], durationMin: 60, category: 'arena_guild', remindMin: 15 },
    { id: 'de-bond-checkin', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], durationMin: 30, category: 'social', remindMin: 0 },
    { id: 'de-desafio-diario', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], durationMin: 5, category: 'reset', remindMin: 0 },
    { id: 'de-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], durationMin: 5, category: 'reset', remindMin: 0 }
  ],
  // ── España (ES) — 11 events (European schedule) ──
  es: [
    { id: 'es-boss-world', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], durationMin: 60, category: 'boss', remindMin: 5 },
    { id: 'es-arena-3v3', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], durationMin: 60, category: 'arena', remindMin: 10 },
    { id: 'es-dungeon', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [14, 21], durationMin: 90, category: 'dungeon', remindMin: 5 },
    { id: 'es-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], durationMin: 60, category: 'escort', remindMin: 5 },
    { id: 'es-instancia-ninja', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], durationMin: 60, category: 'instance', remindMin: 5 },
    { id: 'es-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [6, 12, 18], durationMin: 45, category: 'instance', remindMin: 0 },
    { id: 'es-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [20], durationMin: 120, category: 'social', remindMin: 30 },
    { id: 'es-guild-arena', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [19], durationMin: 60, category: 'arena_guild', remindMin: 15 },
    { id: 'es-bond-checkin', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], durationMin: 30, category: 'social', remindMin: 0 },
    { id: 'es-desafio-diario', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], durationMin: 5, category: 'reset', remindMin: 0 },
    { id: 'es-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], durationMin: 5, category: 'reset', remindMin: 0 }
  ],
  // ── Polska (PL) — 11 events (European schedule) ──
  pl: [
    { id: 'pl-boss-world', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], durationMin: 60, category: 'boss', remindMin: 5 },
    { id: 'pl-arena-3v3', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], durationMin: 60, category: 'arena', remindMin: 10 },
    { id: 'pl-dungeon', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [14, 21], durationMin: 90, category: 'dungeon', remindMin: 5 },
    { id: 'pl-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], durationMin: 60, category: 'escort', remindMin: 5 },
    { id: 'pl-instancia-ninja', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], durationMin: 60, category: 'instance', remindMin: 5 },
    { id: 'pl-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [6, 12, 18], durationMin: 45, category: 'instance', remindMin: 0 },
    { id: 'pl-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [20], durationMin: 120, category: 'social', remindMin: 30 },
    { id: 'pl-guild-arena', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [19], durationMin: 60, category: 'arena_guild', remindMin: 15 },
    { id: 'pl-bond-checkin', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], durationMin: 30, category: 'social', remindMin: 0 },
    { id: 'pl-desafio-diario', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], durationMin: 5, category: 'reset', remindMin: 0 },
    { id: 'pl-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], durationMin: 5, category: 'reset', remindMin: 0 }
  ],
  // ── France (FR) — 11 events (European schedule) ──
  fr: [
    { id: 'fr-boss-world', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], durationMin: 60, category: 'boss', remindMin: 5 },
    { id: 'fr-arena-3v3', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], durationMin: 60, category: 'arena', remindMin: 10 },
    { id: 'fr-dungeon', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [14, 21], durationMin: 90, category: 'dungeon', remindMin: 5 },
    { id: 'fr-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], durationMin: 60, category: 'escort', remindMin: 5 },
    { id: 'fr-instancia-ninja', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], durationMin: 60, category: 'instance', remindMin: 5 },
    { id: 'fr-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [6, 12, 18], durationMin: 45, category: 'instance', remindMin: 0 },
    { id: 'fr-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [20], durationMin: 120, category: 'social', remindMin: 30 },
    { id: 'fr-guild-arena', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [19], durationMin: 60, category: 'arena_guild', remindMin: 15 },
    { id: 'fr-bond-checkin', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], durationMin: 30, category: 'social', remindMin: 0 },
    { id: 'fr-desafio-diario', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], durationMin: 5, category: 'reset', remindMin: 0 },
    { id: 'fr-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], durationMin: 5, category: 'reset', remindMin: 0 }
  ]
};

// Backwards-compat: backfill `name` (= name_en) on each event so old code that
// reads event.name directly (instead of getUpcoming()) still works. New code
// should prefer getUpcoming() which returns name based on current language.
Object.keys(EVENTS_BY_REGION).forEach(function (region) {
  EVENTS_BY_REGION[region].forEach(function (ev) {
    if (!ev.name) ev.name = ev.name_en || ev.name_pt;
  });
});

let _muted = false;
let _timer = null;
let _remindListeners = [];
let _endListeners = [];
let _globalRemindMin = null; // override; null = use per-event remindMin
let _lang = 'en'; // 'en' or 'pt' — controls notification language

/**
 * Calculates the user's CURRENT UTC offset (including local DST) in hours.
 */
function getUserOffsetHours() {
  const now = new Date();
  return -now.getTimezoneOffset() / 60;
}

/**
 * Calculates the CURRENT UTC offset of a server region.
 * Legacy codes (eu/hk/pt/en) are normalized to a current cluster first.
 */
function getServerOffsetHours(region) {
  const norm = normalizeRegion(region);
  const r = REGION_TZ[norm];
  if (!r) return 0;
  if (norm === 'br') return r.baseOffset; // sem DST
  const now = new Date();
  const month = now.getUTCMonth(); // 0-11
  const inDST = norm === 'na' ? month >= 2 && month <= 10 : month >= 2 && month <= 9;
  return r.baseOffset + (inDST ? 1 : 0);
}

function serverToUserOffsetHours(region) {
  return getUserOffsetHours() - getServerOffsetHours(region);
}

/**
 * Calculates the timestamp (ms) of the next occurrence of an event in the server timezone,
 * converted to the user's local clock.
 * Respeita `days` (dias da semana permitidos); vazio = qualquer dia.
 * @param {string} region
 * @param {number} serverHour 0-23
 * @param {number[]} [days] — weekday numbers (0=Sun..6=Sat). Empty/missing = any day.
 * @returns {number} timestamp ms
 */
function nextOccurrenceMs(region, serverHour, days) {
  const serverOffset = getServerOffsetHours(region);
  const utcHour = serverHour - serverOffset;
  const now = new Date();
  const candidate = new Date();
  candidate.setUTCHours(utcHour, 0, 0, 0);
  // Walk forward day-by-day up to 8 days until we find an allowed weekday (or any if days is empty)
  const allowedDays = Array.isArray(days) && days.length > 0 ? days : null;
  for (let i = 0; i < 9; i++) {
    if (candidate.getTime() > now.getTime()) {
      if (!allowedDays || allowedDays.indexOf(candidate.getUTCDay()) !== -1) {
        return candidate.getTime();
      }
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.getTime();
}

/**
 * Lists events for a region with countdown to next trigger.
 * @param {string} region
 * @param {string} [lang] — 'pt' or 'en' (defaults to current set language)
 * @returns {Array}
 */
function getUpcoming(region, lang) {
  // Normalize legacy region codes (eu/hk/pt/en) to current clusters.
  const norm = normalizeRegion(region);
  const events = EVENTS_BY_REGION[norm] || EVENTS_BY_REGION.br;
  const useLang = lang || _lang;
  return events
    .map(function (ev) {
      let soonest = Infinity;
      for (let i = 0; i < ev.hours.length; i++) {
        const occ = nextOccurrenceMs(norm, ev.hours[i], ev.days);
        if (occ < soonest) soonest = occ;
      }
      const remind = _globalRemindMin !== null ? _globalRemindMin : ev.remindMin;
      const fireAt = soonest - remind * 60 * 1000;
      const ms = fireAt - Date.now();
      const durationMin = ev.durationMin || 60;
      return {
        id: ev.id,
        name: useLang === 'pt' ? ev.name_pt : ev.name_en,
        name_pt: ev.name_pt,
        name_en: ev.name_en,
        days: ev.days || [],
        daily: !ev.days || ev.days.length === 0,
        hours: ev.hours,
        category: ev.category,
        remindMin: remind,
        durationMin: durationMin,
        region: norm,
        nextFireMs: ms,
        nextFireLabel: formatCountdown(ms),
        // User-local time when the event starts
        userTimeLabel: formatUserTime(soonest),
        // Server-local time (string HH:MM)
        serverTimeLabel: formatServerTime(soonest, norm),
        // When the event actually starts (without remind offset)
        startsAtMs: soonest,
        // When the event ends (startsAtMs + durationMin)
        endsAtMs: soonest + durationMin * 60000
      };
    })
    .sort(function (a, b) {
      return a.nextFireMs - b.nextFireMs;
    });
}

function formatCountdown(ms) {
  if (ms < 0) return 'agora';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  if (h > 0) return h + 'h ' + m + 'min';
  if (m > 0) return m + 'min';
  return Math.floor(ms / 1000) + 's';
}

/**
 * Format a timestamp as HH:MM in the USER's local timezone.
 */
function formatUserTime(ms) {
  var d = new Date(ms);
  var h = d.getHours();
  var m = d.getMinutes();
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Format a timestamp as HH:MM in the SERVER's timezone for the given region.
 */
function formatServerTime(ms, region) {
  var meta = REGION_TZ[region] || REGION_TZ.br;
  var d = new Date(ms);
  var h = (((d.getUTCHours() + meta.baseOffset) % 24) + 24) % 24;
  var m = d.getUTCMinutes();
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function isMuted() {
  return _muted;
}
function setMuted(m) {
  _muted = !!m;
  logger.info('EventTimers: notifications ' + (_muted ? 'MUTED' : 'active'));
}

/**
 * Set the global reminder override (minutes before event start).
 * Pass null to use per-event remindMin.
 * @param {number|null} min
 */
function setRemindMin(min) {
  _globalRemindMin = typeof min === 'number' && min >= 0 ? min : null;
}

/**
 * Set the language for event names in notifications and getUpcoming() default.
 * @param {string} lang — 'en' or 'pt'
 */
function setLang(lang) {
  if (lang === 'pt' || lang === 'en') _lang = lang;
}

function onRemind(cb) {
  if (typeof cb === 'function') _remindListeners.push(cb);
}

function onEnd(cb) {
  if (typeof cb === 'function') _endListeners.push(cb);
}

function localizedEventName(ev, lang) {
  return lang === 'pt' ? ev.name_pt : ev.name_en;
}

function showNotification(event, region, lang) {
  if (_muted) return;
  if (!Notification.isSupported()) return;
  try {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    const norm = normalizeRegion(region);
    const r = REGION_TZ[norm] || {};
    const useLang = lang || _lang;
    const name = localizedEventName(event, useLang);
    const remind = _globalRemindMin !== null ? _globalRemindMin : event.remindMin;
    const title =
      remind > 0
        ? r.flag + ' ' + name + ' in ' + remind + 'min'
        : r.flag + ' ' + name + ' starting now';
    const body =
      useLang === 'pt'
        ? 'Starts at ' + event.hours.join('h and ') + 'h • ' + (event.durationMin || 60) + 'min'
        : 'Starts at ' + event.hours.join('h & ') + 'h • ' + (event.durationMin || 60) + 'min';
    const n = new Notification({ title: title, body: body, icon: iconPath, silent: false });
    n.show();
  } catch (e) {
    logger.debug('EventTimers: notification failed: ' + e.message);
  }
  _remindListeners.forEach(function (cb) {
    try {
      cb({ event: event, region: region });
    } catch (_) {
      /* ignore */
    }
  });
}

function showEndNotification(event, region, lang) {
  if (_muted) return;
  if (!Notification.isSupported()) return;
  try {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    const norm = normalizeRegion(region);
    const r = REGION_TZ[norm] || {};
    const useLang = lang || _lang;
    const name = localizedEventName(event, useLang);
    const n = new Notification({
      title: r.flag + ' ' + name + ' — ended',
      body: useLang === 'pt' ? 'O evento foi encerrado.' : 'The event has ended.',
      icon: iconPath,
      silent: true
    });
    n.show();
  } catch (e) {
    logger.debug('EventTimers: end-notification failed: ' + e.message);
  }
  _endListeners.forEach(function (cb) {
    try {
      cb({ event: event, region: region });
    } catch (_) {
      /* ignore */
    }
  });
}

function startWithProfiles(profiles) {
  if (_timer) return;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return start(['br']);
  }
  const enabledProfiles = profiles.filter(function (p) {
    return p && p.notificationsEnabled !== false;
  });
  if (enabledProfiles.length === 0) {
    logger.info('EventTimers: no profiles with notifications enabled — idle daemon');
    return;
  }
  const regions = [];
  enabledProfiles.forEach(function (p) {
    if (p.region) {
      // Normalize legacy codes (eu→na, hk→na, pt→br, en→na) so old profiles
      // still get event notifications under their migrated cluster.
      const norm = normalizeRegion(p.region);
      if (regions.indexOf(norm) === -1) regions.push(norm);
    }
  });
  if (regions.length === 0) regions.push('br');
  logger.info(
    'EventTimers: started (v3.4) — ' +
      enabledProfiles.length +
      '/' +
      profiles.length +
      ' profile(s) with notifications, regions: ' +
      regions.join(', ')
  );
  start(regions);
}

/**
 * Starts the loop. Monitors ALL active regions (for profiles in different regions).
 * A cada 30s checa se algum lembrete deve disparar OU se algum evento ativo acabou de terminar.
 * @param {Array<string>} activeRegions — regions of active profiles
 */
function start(activeRegions) {
  if (_timer) return;
  const regions = Array.isArray(activeRegions) && activeRegions.length > 0 ? activeRegions : ['br'];
  logger.info('EventTimers: started — monitored regions: ' + regions.join(', '));

  // State: map region+eventId+occ → flags {reminded:bool, endFired:bool}
  const fired = new Map();

  _timer = setInterval(function () {
    const now = Date.now();
    regions.forEach(function (region) {
      const events = EVENTS_BY_REGION[region] || [];
      events.forEach(function (ev) {
        ev.hours.forEach(function (hour) {
          const occ = nextOccurrenceMs(region, hour, ev.days);
          const remind = _globalRemindMin !== null ? _globalRemindMin : ev.remindMin;
          const fireAt = occ - remind * 60 * 1000;
          const endAt = occ + (ev.durationMin || 60) * 60000;
          const key = region + ':' + ev.id + ':' + occ;
          let state = fired.get(key);
          if (!state) {
            state = { reminded: false, endFired: false };
            fired.set(key, state);
          }
          // Fire reminder if we're in the 0-60s window after fireAt and haven't yet
          if (!state.reminded && now >= fireAt && now < fireAt + 60000) {
            state.reminded = true;
            showNotification(ev, region, _lang);
          }
          // Fire end notification if event just ended (within 0-60s of endAt) and we reminded its start
          if (
            state.reminded &&
            !state.endFired &&
            now >= endAt &&
            now < endAt + 60000
          ) {
            state.endFired = true;
            showEndNotification(ev, region, _lang);
          }
        });
      });
    });
    // Cleanup old states — keeps map bounded.
    // (1) Delete entries for events that have already ended.
    // (2) Delete entries whose occurrence was >3h ago (missed end window).
    if (fired.size > 200) {
      var cutoff = now - 3 * 60 * 60 * 1000;
      for (const [k, s] of fired.entries()) {
        if (s.endFired) {
          fired.delete(k);
        } else {
          // key ends with ':' + occ timestamp — extract and compare
          var lastColon = k.lastIndexOf(':');
          if (lastColon > 0) {
            var occTs = Number(k.slice(lastColon + 1));
            if (!isNaN(occTs) && occTs < cutoff) fired.delete(k);
          }
        }
      }
    }
  }, 30000);

  if (_timer.unref) _timer.unref();
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = {
  start: start,
  startWithProfiles: startWithProfiles,
  stop: stop,
  getUpcoming: getUpcoming,
  isMuted: isMuted,
  setMuted: setMuted,
  setRemindMin: setRemindMin,
  setLang: setLang,
  onRemind: onRemind,
  onEnd: onEnd,
  REGION_TZ: REGION_TZ,
  EVENTS_BY_REGION: EVENTS_BY_REGION,
  getUserOffsetHours: getUserOffsetHours,
  getServerOffsetHours: getServerOffsetHours,
  serverToUserOffsetHours: serverToUserOffsetHours,
  nextOccurrenceMs: nextOccurrenceMs,
  formatUserTime: formatUserTime,
  formatServerTime: formatServerTime
};
