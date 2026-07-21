/**
 * EventTimers — Event reminders with timezone math + bilingual names
 * v2.2.0 — v5.13.0 (bilingual events + days[] + end-notification)
 *
 * CHANGES (v5.13.0):
 *   - Each event has name_pt + name_en (rendered by launcher language)
 *   - Each event has `days`: array of weekday numbers (0=Sun..6=Sat). Empty = daily.
 *   - Each event has `durationMin` (how long the event lasts)
 *   - Notification fires `remindMin` before start (configurable globally via setRemindMin)
 *   - When event ends, an "ended" notification fires (smarter: only the active badge
 *     on the Events nav item disappears; the start toast auto-dismisses)
 *
 * REGIÕES SUPORTADAS (4 clusters reais de servidores Naruto Online):
 *   br — America/Sao_Paulo (UTC-3, sem DST)
 *   na — America/New_York   (UTC-5/-4 DST)
 *   eu — Europe/Berlin      (UTC+1/+2 DST)
 *   hk — Asia/Hong_Kong     (UTC+8, sem DST)
 *
 * Validação: naruto.narutowebgame.com/{pt|en|zh}/serverlist — apenas 4 clusters.
 * Idiomas de/es/pl/fr foram removidos (não há servidores dedicados, eram
 * language variants do server EU). Launcher agora é EN+PT apenas.
 */

'use strict';

const { Notification } = require('electron');
const path = require('path');
const logger = require('../utils/logger');

// Offsets UTC aproximados por região (sem libs de TZ).
// DST é auto-detectado comparando o offset atual do Date com o offset base.
const REGION_TZ = {
  br: { name: 'Brasil', name_en: 'Brazil', flag: '🇧🇷', baseOffset: -3 }, // UTC-3, sem DST
  na: { name: 'América do Norte', name_en: 'North America', flag: '🇺🇸', baseOffset: -5 }, // UTC-5, DST -4
  eu: { name: 'Europa', name_en: 'Europe', flag: '🇪🇺', baseOffset: 1 }, // UTC+1, DST +2
  hk: { name: 'Hong Kong', name_en: 'Hong Kong', flag: '🇭🇰', baseOffset: 8 } // UTC+8, sem DST
};

// Catálogo de eventos por região (horários no fuso do SERVIDOR)
// SOURCE (validado 2025):
//   - https://narutooasis.fandom.com/wiki/Timed_Events
//   - Padrões confirmados pela comunidade
//
// ESTRUTURA de cada evento:
//   id            — identificador único
//   name_pt       — nome em português
//   name_en       — nome em inglês
//   days          — array de weekday (0=Dom, 1=Seg, ..., 6=Sáb). VAZIO = diário
//   hours         — array de horas (0-23) no fuso do SERVIDOR em que o evento inicia
//   durationMin   — duração em minutos (default 60)
//   category      — boss | arena | arena_guild | dungeon | escort | instance | social | reset
//   remindMin     — minutos antes do início para notificar (default 5; override global via setRemindMin)
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
  // ── Europe (EN) — 11 events ──
  eu: [
    { id: 'eu-boss-world', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], durationMin: 60, category: 'boss', remindMin: 5 },
    { id: 'eu-arena-3v3', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], durationMin: 60, category: 'arena', remindMin: 10 },
    { id: 'eu-dungeon', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [14, 21], durationMin: 90, category: 'dungeon', remindMin: 5 },
    { id: 'eu-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], durationMin: 60, category: 'escort', remindMin: 5 },
    { id: 'eu-instancia-ninja', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], durationMin: 60, category: 'instance', remindMin: 5 },
    { id: 'eu-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [6, 12, 18], durationMin: 45, category: 'instance', remindMin: 0 },
    { id: 'eu-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [20], durationMin: 120, category: 'social', remindMin: 30 },
    { id: 'eu-guild-arena', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [19], durationMin: 60, category: 'arena_guild', remindMin: 15 },
    { id: 'eu-bond-checkin', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], durationMin: 30, category: 'social', remindMin: 0 },
    { id: 'eu-desafio-diario', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], durationMin: 5, category: 'reset', remindMin: 0 },
    { id: 'eu-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], durationMin: 5, category: 'reset', remindMin: 0 }
  ],
  // ── Hong Kong (ZH) — 11 events ──
  hk: [
    { id: 'hk-boss-world', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], durationMin: 60, category: 'boss', remindMin: 5 },
    { id: 'hk-arena-3v3', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], durationMin: 60, category: 'arena', remindMin: 10 },
    { id: 'hk-dungeon', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [14, 21], durationMin: 90, category: 'dungeon', remindMin: 5 },
    { id: 'hk-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], durationMin: 60, category: 'escort', remindMin: 5 },
    { id: 'hk-instancia-ninja', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], durationMin: 60, category: 'instance', remindMin: 5 },
    { id: 'hk-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [6, 12, 18], durationMin: 45, category: 'instance', remindMin: 0 },
    { id: 'hk-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [20], durationMin: 120, category: 'social', remindMin: 30 },
    { id: 'hk-guild-arena', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [19], durationMin: 60, category: 'arena_guild', remindMin: 15 },
    { id: 'hk-bond-checkin', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], durationMin: 30, category: 'social', remindMin: 0 },
    { id: 'hk-desafio-diario', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], durationMin: 5, category: 'reset', remindMin: 0 },
    { id: 'hk-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], durationMin: 5, category: 'reset', remindMin: 0 }
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
 * Calcula o offset UTC ATUAL do usuário (incluindo DST local) em horas.
 */
function getUserOffsetHours() {
  const now = new Date();
  return -now.getTimezoneOffset() / 60;
}

/**
 * Calcula o offset UTC ATUAL de uma região de servidor.
 */
function getServerOffsetHours(region) {
  const r = REGION_TZ[region];
  if (!r) return 0;
  if (region === 'br' || region === 'hk') return r.baseOffset; // sem DST
  const now = new Date();
  const month = now.getUTCMonth(); // 0-11
  const inDST = region === 'na' ? month >= 2 && month <= 10 : month >= 2 && month <= 9;
  return r.baseOffset + (inDST ? 1 : 0);
}

function serverToUserOffsetHours(region) {
  return getUserOffsetHours() - getServerOffsetHours(region);
}

/**
 * Calcula o timestamp (ms) da próxima ocorrência de um evento no fuso do servidor,
 * convertido para o relógio local do usuário.
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
 * Lista os eventos de uma região com countdown até o próximo disparo.
 * @param {string} region
 * @param {string} [lang] — 'pt' or 'en' (defaults to current set language)
 * @returns {Array}
 */
function getUpcoming(region, lang) {
  const events = EVENTS_BY_REGION[region] || EVENTS_BY_REGION.br;
  const useLang = lang || _lang;
  return events
    .map(function (ev) {
      let soonest = Infinity;
      for (let i = 0; i < ev.hours.length; i++) {
        const occ = nextOccurrenceMs(region, ev.hours[i], ev.days);
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
        region: region,
        nextFireMs: ms,
        nextFireLabel: formatCountdown(ms),
        // User-local time when the event starts
        userTimeLabel: formatUserTime(soonest),
        // Server-local time (string HH:MM)
        serverTimeLabel: formatServerTime(soonest, region),
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
    const r = REGION_TZ[region] || {};
    const useLang = lang || _lang;
    const name = localizedEventName(event, useLang);
    const remind = _globalRemindMin !== null ? _globalRemindMin : event.remindMin;
    const title =
      remind > 0
        ? r.flag + ' ' + name + ' in ' + remind + 'min'
        : r.flag + ' ' + name + ' starting now';
    const body =
      useLang === 'pt'
        ? 'Começa às ' + event.hours.join('h e ') + 'h • ' + (event.durationMin || 60) + 'min'
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
    const r = REGION_TZ[region] || {};
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
    if (p.region && regions.indexOf(p.region) === -1) regions.push(p.region);
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
 * Inicia o loop. Monitora TODAS as regiões ativas (para perfis de regiões diferentes).
 * A cada 30s checa se algum lembrete deve disparar OU se algum evento ativo acabou de terminar.
 * @param {Array<string>} activeRegions — regiões dos perfis ativos
 */
function start(activeRegions) {
  if (_timer) return;
  const regions = Array.isArray(activeRegions) && activeRegions.length > 0 ? activeRegions : ['br'];
  logger.info('EventTimers: started — monitored regions: ' + regions.join(', '));

  // Estado: map region+eventId+occ → flags {reminded:bool, endFired:bool}
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
    // Cleanup old states — keeps map <500 entries
    if (fired.size > 500) {
      for (const [k, s] of fired.entries()) {
        if (s.endFired && !s.reminded) fired.delete(k);
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
