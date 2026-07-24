/**
 * ProfileStore — Armazenamento robusto de perfis (Multi-conta)
 * v2.1.0
 *
 * FILOSOFIA (reavaliada):
 *   O usuário NÃO quer "8 contas simultâneas" por padrão. Ele quer PERFIS:
 *   clica num perfil → abre o jogo com os cookies salvos → joga. Simples.
 *
 *   Multi-conta em tempo real (várias janelas abertas) é recurso SECUNDÁRIO
 *   de power-user, acessível via "Abrir adicional", não o fluxo padrão.
 *
 *   Cada perfil guarda: id, nome (ex: "chris"), servidor (ex: "s799"),
 *   região (BR/NA/EU/HK), cor de identificação, e cookies persistidos
 *   automaticamente pela session partition do Chromium.
 *
 * ROBUSTEZ (correção do que o usuário pediu):
 *   - Atomic write: escreve em .tmp, renomeia. Nunca corrompe se cair luz.
 *   - Backup .bak antes de cada save. Recuperação automática se JSON quebrar.
 *   - Schema validation: cada perfil é validado; inválidos são descartados.
 *   - Limite 1MB no arquivo (saneamento contra corrupção silenciosa).
 *   - Try/catch em TODAS as operações síncronas de I/O.
 *   - Máximo 12 perfis (elevado conforme requisito, mas default é 1 janela ativa).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const logger = require('../utils/logger');
const { isValidRegion, normalizeRegion, isCurrentRegion } = require('../config/regions');

const PROFILES_DIR = 'profiles';
const PROFILES_FILE = 'profiles.json';
const BACKUP_FILE = 'profiles.json.bak';
const MAX_PROFILES = 10;
const MAX_FILE_BYTES = 1024 * 1024; // 1MB sane limit

// Launch log (timeline) — persisted separado de profiles.json para
// não interferir em migrações de schema de perfis. Limite de 5000 entradas
// previne crescimento ilimitado (~6 meses de uso intensivo).
const LAUNCH_LOG_FILE = 'launch-log.json';
const MAX_LAUNCH_LOG_ENTRIES = 5000;

// Schema validator — nunca confiar em dados lidos do disco
// v3.4: adicionado language (pt/en) e notificationsEnabled (boolean) por perfil
// v4.5: adicionado notes (string, max 200), launchCount (number), totalPlayMs (number)
function isValidProfile(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.id !== 'string' || !/^p_[a-f0-9]{8,16}$/.test(p.id)) return false;
  if (typeof p.name !== 'string' || p.name.length === 0 || p.name.length > 40) return false;
  if (typeof p.server !== 'string' || p.server.length > 20) return false;
  // v1.1.0: accept 6 current clusters (br/na/de/es/pl/fr) + 4 legacy codes
  // (eu/hk/pt/en) which are auto-migrated to current clusters on load via
  // normalizeRegion(). isValidRegion accepts both current + legacy.
  if (!isValidRegion(p.region)) return false;
  // v3.4: language opcional (default 'pt' para retrocompatibilidade)
  // v4.0.1 FIX: sync with settings.js — i18n supports 6 languages
  if (p.language !== undefined && !['pt', 'en', 'de', 'es', 'pl', 'fr'].includes(p.language))
    return false;
  // v3.4: notificationsEnabled opcional (default true para retrocompatibilidade)
  if (p.notificationsEnabled !== undefined && typeof p.notificationsEnabled !== 'boolean')
    return false;
  if (typeof p.createdAt !== 'number' || p.createdAt < 0) return false;
  if (typeof p.lastUsed !== 'number' || p.lastUsed < 0) return false;
  // v4.5: notes opcional (string, max 200 chars)
  if (p.notes !== undefined && (typeof p.notes !== 'string' || p.notes.length > 200)) return false;
  // v4.5: launchCount opcional (number, >= 0)
  if (
    p.launchCount !== undefined &&
    (typeof p.launchCount !== 'number' || p.launchCount < 0 || !isFinite(p.launchCount))
  )
    return false;
  // v4.5: totalPlayMs opcional (number, >= 0)
  if (
    p.totalPlayMs !== undefined &&
    (typeof p.totalPlayMs !== 'number' || p.totalPlayMs < 0 || !isFinite(p.totalPlayMs))
  )
    return false;
  // v4.6: favorite opcional (boolean)
  if (p.favorite !== undefined && typeof p.favorite !== 'boolean') return false;
  // tags opcional (array de strings, max 5 tags, cada max 20 chars)
  if (p.tags !== undefined) {
    if (!Array.isArray(p.tags)) return false;
    if (p.tags.length > 5) return false;
    for (var i = 0; i < p.tags.length; i++) {
      if (typeof p.tags[i] !== 'string' || p.tags[i].length > 20 || p.tags[i].length === 0)
        return false;
    }
  }
  return true;
}

// Migração automática de perfis v1 (sem language/notificationsEnabled) para v2
// v4.5: Migração v3 (sem notes/launchCount/totalPlayMs) para v3
function _migrateProfile(p) {
  if (!p) return p;
  if (p.language === undefined) p.language = 'pt';
  if (p.notificationsEnabled === undefined) p.notificationsEnabled = true;
  // v4.5: novos campos com defaults seguros
  if (p.notes === undefined) p.notes = '';
  if (p.launchCount === undefined) p.launchCount = 0;
  if (p.totalPlayMs === undefined) p.totalPlayMs = 0;
  // v4.6: favorite flag (default false)
  if (p.favorite === undefined) p.favorite = false;
  // tags (default empty array)
  if (p.tags === undefined) p.tags = [];
  return p;
}

let _profiles = null; // cache em memória
let _listeners = [];
let _launchLog = null; // cache em memória do log de lançamentos

function getDir() {
  return path.join(app.getPath('userData'), PROFILES_DIR);
}

function getFile() {
  return path.join(getDir(), PROFILES_FILE);
}

function getBackupFile() {
  return path.join(getDir(), BACKUP_FILE);
}

function ensureDir() {
  try {
    const dir = getDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    logger.error('ProfileStore: failed to create directory: ' + e.message);
  }
}

/**
 * Carrega perfis do disco com recuperação automática de backup.
 * Sempre retorna um array válido (possivelmente vazio).
 * @returns {Array}
 */
function load() {
  ensureDir();

  // carrega launch log sempre (independente do estado de profiles.json,
  // para que o cache _launchLog não fique stale entre loads)
  _loadLaunchLog();

  const file = getFile();
  const backup = getBackupFile();

  // Tenta arquivo principal
  let parsed = null;
  try {
    if (fs.existsSync(file)) {
      const stat = fs.statSync(file);
      if (stat.size > MAX_FILE_BYTES) {
        logger.warn('ProfileStore: file too large (' + stat.size + ' bytes), discarding');
        throw new Error('oversized');
      }
      const raw = fs.readFileSync(file, 'utf8');
      parsed = JSON.parse(raw);
    }
  } catch (e) {
    logger.error('ProfileStore: main JSON corrupted: ' + e.message);
    // Tenta backup
    try {
      if (fs.existsSync(backup)) {
        logger.warn('ProfileStore: recovering from .bak backup');
        const rawBak = fs.readFileSync(backup, 'utf8');
        parsed = JSON.parse(rawBak);
      }
    } catch (e2) {
      logger.error('ProfileStore: backup also corrupted: ' + e2.message);
      parsed = null;
    }
  }

  if (!Array.isArray(parsed)) {
    _profiles = [];
    return _profiles;
  }

  // Valida cada perfil; descarta inválidos silenciosamente
  _profiles = parsed.filter(isValidProfile);
  if (_profiles.length !== parsed.length) {
    logger.warn(
      'ProfileStore: ' +
        (parsed.length - _profiles.length) +
        ' perfil(is) inválido(s) descartado(s)'
    );
  }
  // v3.4: migra perfis v1 (sem language/notificationsEnabled) para v2
  // v1.1.0: migra region codes legacy (eu/hk/pt/en) para clusters atuais
  let migrated = 0;
  let regionMigrated = 0;
  _profiles.forEach(function (p) {
    const before = JSON.stringify({ l: p.language, n: p.notificationsEnabled, r: p.region });
    _migrateProfile(p);
    // Normalize legacy region codes (eu→na, hk→na, pt→br, en→na)
    if (p.region && !isCurrentRegion(p.region)) {
      const oldRegion = p.region;
      p.region = normalizeRegion(p.region);
      if (oldRegion !== p.region) regionMigrated++;
    }
    const after = JSON.stringify({ l: p.language, n: p.notificationsEnabled, r: p.region });
    if (before !== after) migrated++;
  });
  if (regionMigrated > 0) {
    logger.info(
      'ProfileStore: ' +
        regionMigrated +
        ' perfil(is) com região legacy migrada para cluster atual'
    );
  }
  if (migrated > 0) {
    logger.info(
      'ProfileStore: ' +
        migrated +
        ' perfil(is) migrado(s) para schema atual (language + notificationsEnabled + region)'
    );
    _saveToDisk(_profiles);
  } else if (_profiles.length !== parsed.length) {
    _saveToDisk(_profiles);
  }

  logger.info('ProfileStore: ' + _profiles.length + ' profile(s) loaded');
  return _profiles;
}

/**
 * Salva perfis no disco de forma atômica com backup.
 * NUNCA lança — captura todas as exceções.
 * @param {Array} profiles
 * @returns {boolean} true se salvou com sucesso
 */
function _saveToDisk(profiles) {
  ensureDir();
  const file = getFile();
  const backup = getBackupFile();
  const tmp = file + '.tmp';

  try {
    const json = JSON.stringify(profiles, null, 2);

    // Limite de tamanho antes de escrever
    if (Buffer.byteLength(json, 'utf8') > MAX_FILE_BYTES) {
      logger.error('ProfileStore: refusing to save — JSON exceeds 1MB');
      return false;
    }

    // Backup do atual antes de sobrescrever
    try {
      if (fs.existsSync(file)) {
        fs.copyFileSync(file, backup);
      }
    } catch (e) {
      logger.warn('ProfileStore: failed to create backup: ' + e.message);
    }

    // Atomic write: tmp → rename
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    logger.error('ProfileStore: failed to save: ' + e.message);
    // Tenta limpar tmp órfão
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
    return false;
  }
}

/**
 * Persiste o cache atual + notifica listeners.
 */
function persist() {
  if (_profiles === null) return;
  const ok = _saveToDisk(_profiles);
  if (ok) {
    _listeners.forEach(function (cb) {
      try {
        cb(_profiles);
      } catch (_) {
        /* ignore listener errors */
      }
    });
  }
}

function getAll() {
  if (_profiles === null) load();
  return _profiles.slice();
}

function get(id) {
  if (_profiles === null) load();
  return (
    _profiles.find(function (p) {
      return p.id === id;
    }) || null
  );
}

function create(opts) {
  if (_profiles === null) load();
  if (_profiles.length >= MAX_PROFILES) {
    logger.warn('ProfileStore: limit of ' + MAX_PROFILES + ' profiles reached');
    return null;
  }
  opts = opts || {};
  const profile = {
    id: 'p_' + crypto.randomBytes(6).toString('hex'),
    name:
      String(opts.name || 'Conta ' + (_profiles.length + 1))
        .slice(0, 40)
        .trim() || 'Conta',
    server: String(opts.server || '')
      .slice(0, 20)
      .trim(),
    region: isValidRegion(opts.region) ? normalizeRegion(opts.region) : 'br',
    // v4.0.1 FIX: sync with settings.js — i18n supports 6 languages
    language: ['pt', 'en', 'de', 'es', 'pl', 'fr'].includes(opts.language) ? opts.language : 'pt',
    notificationsEnabled:
      typeof opts.notificationsEnabled === 'boolean' ? opts.notificationsEnabled : true,
    // v4.5: novos campos
    notes: typeof opts.notes === 'string' ? opts.notes.slice(0, 200) : '',
    launchCount: 0,
    totalPlayMs: 0,
    // v4.6: favorite flag
    favorite: typeof opts.favorite === 'boolean' ? opts.favorite : false,
    // tags (array of strings, max 5, each max 20 chars)
    tags: Array.isArray(opts.tags)
      ? opts.tags
          .filter(function (t) {
            return typeof t === 'string' && t.length > 0 && t.length <= 20;
          })
          .slice(0, 5)
      : [],
    createdAt: Date.now(),
    lastUsed: 0
  };
  _profiles.push(profile);
  persist();
  logger.info(
    'ProfileStore: perfil criado — ' +
      profile.name +
      (profile.server ? ' (' + profile.server + ')' : '') +
      ' [' +
      profile.region +
      '/' +
      profile.language +
      ']'
  );
  return profile;
}

function update(id, updates) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (!p) return false;
  if (typeof updates.name === 'string') p.name = updates.name.slice(0, 40).trim() || p.name;
  if (typeof updates.server === 'string') p.server = updates.server.slice(0, 20).trim();
  if (isValidRegion(updates.region)) p.region = normalizeRegion(updates.region);
  // v4.0.1 FIX: sync with settings.js — i18n supports 6 languages
  if (['pt', 'en', 'de', 'es', 'pl', 'fr'].includes(updates.language))
    p.language = updates.language;
  if (typeof updates.notificationsEnabled === 'boolean')
    p.notificationsEnabled = updates.notificationsEnabled;
  // v4.5: notes (string, max 200)
  if (typeof updates.notes === 'string') p.notes = updates.notes.slice(0, 200);
  // v4.6: favorite (boolean)
  if (typeof updates.favorite === 'boolean') p.favorite = updates.favorite;
  // tags (array of strings, max 5, each max 20 chars)
  if (Array.isArray(updates.tags)) {
    p.tags = updates.tags
      .filter(function (t) {
        return typeof t === 'string' && t.length > 0 && t.length <= 20;
      })
      .slice(0, 5);
  }
  persist();
  return true;
}

function remove(id) {
  if (_profiles === null) load();
  const idx = _profiles.findIndex(function (x) {
    return x.id === id;
  });
  if (idx === -1) return false;
  _profiles.splice(idx, 1);
  persist();

  // Wipe da partition (cookies/cache do perfil removido)
  try {
    const partDir = path.join(app.getPath('userData'), 'Partitions', 'profile-' + id);
    if (fs.existsSync(partDir)) {
      _rmrf(partDir);
      logger.info('ProfileStore: partition data removed for ' + id);
    }
  } catch (e) {
    logger.warn('ProfileStore: failed to remove partition: ' + e.message);
  }
  return true;
}

/**
 * Reorder profiles to match the given array of IDs.
 * IDs not found are ignored; profiles not in the list keep their relative order.
 * @param {string[]} order - Array of profile IDs in desired order
 */
function reorder(order) {
  if (_profiles === null) load();
  if (!Array.isArray(order)) return;
  var reordered = [];
  var seen = new Set();
  // First, place profiles in the specified order
  order.forEach(function (id) {
    var p = _profiles.find(function (x) {
      return x.id === id;
    });
    if (p && !seen.has(id)) {
      reordered.push(p);
      seen.add(id);
    }
  });
  // Then append any profiles not in the order list
  _profiles.forEach(function (p) {
    if (!seen.has(p.id)) reordered.push(p);
  });
  _profiles = reordered;
  persist();
}

function touch(id) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (p) {
    p.lastUsed = Date.now();
    persist();
  }
}

/**
 * v4.5: Incrementa contador de lançamentos do perfil.
 * @param {string} id
 * @returns {boolean}
 */
function incrementLaunch(id) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (!p) return false;
  p.launchCount = (p.launchCount || 0) + 1;
  p.lastUsed = Date.now();
  persist();
  return true;
}

/**
 * v4.5: Adiciona tempo de jogo (ms) ao total acumulado do perfil.
 * @param {string} id
 * @param {number} ms - milissegundos a adicionar (clampado em [0, 24h])
 * @returns {boolean}
 */
function addPlayTime(id, ms) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (!p) return false;
  // Sanity check: 0 <= ms <= 24h (evita overflow por bug de timer)
  const clamped = Math.max(0, Math.min(24 * 60 * 60 * 1000, Number(ms) || 0));
  p.totalPlayMs = (p.totalPlayMs || 0) + clamped;
  persist();
  return true;
}

/**
 * v4.5: Retorna estatísticas de uso de um perfil.
 * @param {string} id
 * @returns {{launchCount:number, totalPlayMs:number, lastUsed:number, avgSessionMs:number}|null}
 */
function getStats(id) {
  if (_profiles === null) load();
  const p = _profiles.find(function (x) {
    return x.id === id;
  });
  if (!p) return null;
  const launches = p.launchCount || 0;
  const totalMs = p.totalPlayMs || 0;
  return {
    launchCount: launches,
    totalPlayMs: totalMs,
    lastUsed: p.lastUsed || 0,
    avgSessionMs: launches > 0 ? Math.round(totalMs / launches) : 0
  };
}

/**
 * Exporta todos os perfis como JSON string (para portabilidade Win↔Linux).
 * Não inclui cookies (são por partition em disco) — apenas metadados.
 * @returns {string}
 */
function exportJSON() {
  if (_profiles === null) load();
  return JSON.stringify(
    {
      version: 2,
      exportedAt: Date.now(),
      profiles: _profiles
    },
    null,
    2
  );
}

/**
 * Importa perfis de um JSON string (merge: preserva existentes por nome+server).
 * @param {string} jsonStr
 * @returns {{imported: number, skipped: number}}
 */
function importJSON(jsonStr) {
  if (_profiles === null) load();
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    logger.error('ProfileStore: invalid import JSON: ' + e.message);
    return { imported: 0, skipped: 0 };
  }
  const incoming = Array.isArray(data.profiles) ? data.profiles : Array.isArray(data) ? data : [];
  let imported = 0,
    skipped = 0;
  incoming.forEach(function (p) {
    if (!isValidProfile(p)) {
      skipped++;
      return;
    }
    if (_profiles.length >= MAX_PROFILES) {
      skipped++;
      return;
    }
    // Dedup por nome+server
    const dup = _profiles.find(function (x) {
      return x.name === p.name && x.server === p.server;
    });
    if (dup) {
      skipped++;
      return;
    }
    // Novo ID (evita colisão com existentes)
    const fresh = Object.assign({}, p, {
      id: 'p_' + crypto.randomBytes(6).toString('hex'),
      createdAt: Date.now(),
      lastUsed: 0
    });
    _profiles.push(fresh);
    imported++;
  });
  persist();
  logger.info('ProfileStore: imported ' + imported + ', skipped ' + skipped);
  return { imported: imported, skipped: skipped };
}

function onChange(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

// Helper recursivo para remover diretório
function _rmrf(p) {
  if (fs.existsSync(p)) {
    fs.readdirSync(p).forEach(function (entry) {
      const cur = path.join(p, entry);
      if (fs.lstatSync(cur).isDirectory()) _rmrf(cur);
      else fs.unlinkSync(cur);
    });
    fs.rmdirSync(p);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Launch log (timeline) — log de lançamentos para gráfico de 7 dias
// Persistido em userData/launch-log.json (arquivo separado de profiles.json).
// Cada entrada: { id: profileId, ts: number }. Cap em MAX_LAUNCH_LOG_ENTRIES.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Retorna o caminho do arquivo de launch log.
 * @returns {string}
 */
function getLaunchLogFile() {
  return path.join(app.getPath('userData'), LAUNCH_LOG_FILE);
}

/**
 * Formata um timestamp como 'YYYY-MM-DD' usando hora LOCAL (não UTC).
 * @param {number} ts
 * @returns {string}
 */
function _formatDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * Carrega o launch log do disco. Arquivo ausente → array vazio.
 * JSON malformado → array vazio + warning. Faz cap em MAX_LAUNCH_LOG_ENTRIES.
 * NUNCA lança — captura todas as exceções.
 * @returns {Array}
 */
function _loadLaunchLog() {
  const file = getLaunchLogFile();
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Valida cada entrada; descarta inválidas silenciosamente
        _launchLog = parsed.filter(function (e) {
          return e && typeof e.id === 'string' && typeof e.ts === 'number' && isFinite(e.ts);
        });
        if (_launchLog.length !== parsed.length) {
          logger.warn(
            'LaunchLog: ' +
              (parsed.length - _launchLog.length) +
              ' entrada(s) inválida(s) descartada(s)'
          );
        }
      } else {
        logger.warn('LaunchLog: file is not an array — starting empty');
        _launchLog = [];
      }
    } else {
      // Backward-compat: primeira execução, arquivo não existe → começa vazio
      _launchLog = [];
    }
  } catch (e) {
    logger.warn('LaunchLog: corrupted file (' + e.message + ') — starting empty');
    _launchLog = [];
  }
  // Cap defensivo (normalmente o cap já acontece em recordLaunch)
  if (_launchLog.length > MAX_LAUNCH_LOG_ENTRIES) {
    _launchLog = _launchLog.slice(_launchLog.length - MAX_LAUNCH_LOG_ENTRIES);
  }
  return _launchLog;
}

/**
 * Persiste o launch log no disco (atomic write: tmp → rename). NUNCA lança.
 */
function _persistLaunchLog() {
  if (_launchLog === null) return;
  const file = getLaunchLogFile();
  const tmp = file + '.tmp';
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(_launchLog);
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    logger.error('LaunchLog: failed to save: ' + e.message);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * v5.5: Registra um lançamento no log. No-op se o perfil não existir.
 * @param {string} profileId
 * @returns {boolean} true se registrou, false caso contrário (id inválido ou perfil inexistente)
 */
function recordLaunch(profileId) {
  if (_profiles === null) load();
  if (_launchLog === null) _loadLaunchLog();
  if (typeof profileId !== 'string' || profileId.length === 0) return false;
  const p = _profiles.find(function (x) {
    return x.id === profileId;
  });
  if (!p) return false;
  _launchLog.push({ id: profileId, ts: Date.now() });
  // Cap em MAX_LAUNCH_LOG_ENTRIES (drop oldest)
  if (_launchLog.length > MAX_LAUNCH_LOG_ENTRIES) {
    _launchLog = _launchLog.slice(_launchLog.length - MAX_LAUNCH_LOG_ENTRIES);
  }
  _persistLaunchLog();
  return true;
}

/**
 * v5.5: Retorna timeline de lançamentos dos últimos `days` dias.
 * Array de tamanho `days`, oldest first → newest last.
 * Cada entrada: { date: 'YYYY-MM-DD', count: number, profiles: [{id, name, count}] }
 * Entradas sem lançamentos aparecem com count 0 e profiles vazio.
 * @param {number} [days=7]
 * @returns {Array}
 */
function getLaunchTimeline(days) {
  if (_launchLog === null) _loadLaunchLog();
  if (_profiles === null) load();
  if (typeof days !== 'number' || !isFinite(days) || days <= 0) days = 7;
  days = Math.floor(days);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Constrói buckets: índice 0 = (days-1) dias atrás, índice (days-1) = hoje
  const buckets = [];
  const dateToIdx = {};
  for (var i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = _formatDate(d.getTime());
    const idx = buckets.length;
    buckets.push({ date: dateStr, count: 0, profiles: [], _byId: {} });
    dateToIdx[dateStr] = idx;
  }

  // Agrega launch log por data local
  _launchLog.forEach(function (entry) {
    const dateStr = _formatDate(entry.ts);
    const idx = dateToIdx[dateStr];
    if (idx === undefined) return; // fora da janela de dias
    const b = buckets[idx];
    b.count++;
    const p = _profiles.find(function (x) {
      return x.id === entry.id;
    });
    if (!p) return; // perfil deletado — não conta no profiles array
    if (!b._byId[entry.id]) {
      b._byId[entry.id] = { id: entry.id, name: p.name, count: 0 };
      b.profiles.push(b._byId[entry.id]);
    }
    b._byId[entry.id].count++;
  });

  // Remove helper interno antes de retornar
  buckets.forEach(function (b) {
    delete b._byId;
  });
  return buckets;
}

/**
 * v5.5: Limpa todo o launch log (zera e persiste).
 */
function clearLaunchLog() {
  if (_launchLog === null) _loadLaunchLog();
  _launchLog = [];
  _persistLaunchLog();
}

/**
 * v5.5: Retorna estatísticas do launch log.
 * @returns {{total:number, oldestTs:number|null, newestTs:number|null}}
 */
function getLaunchLogStats() {
  if (_launchLog === null) _loadLaunchLog();
  if (_launchLog.length === 0) {
    return { total: 0, oldestTs: null, newestTs: null };
  }
  let oldest = _launchLog[0].ts;
  let newest = _launchLog[0].ts;
  for (var i = 1; i < _launchLog.length; i++) {
    if (_launchLog[i].ts < oldest) oldest = _launchLog[i].ts;
    if (_launchLog[i].ts > newest) newest = _launchLog[i].ts;
  }
  return { total: _launchLog.length, oldestTs: oldest, newestTs: newest };
}

module.exports = {
  load: load,
  getAll: getAll,
  get: get,
  create: create,
  update: update,
  remove: remove,
  reorder: reorder,
  touch: touch,
  exportJSON: exportJSON,
  importJSON: importJSON,
  onChange: onChange,
  // v4.5: stats methods
  incrementLaunch: incrementLaunch,
  addPlayTime: addPlayTime,
  getStats: getStats,
  getPartitionName: function (id) {
    return 'persist:profile-' + id;
  },
  MAX_PROFILES: MAX_PROFILES,
  // launch log (timeline)
  recordLaunch: recordLaunch,
  getLaunchTimeline: getLaunchTimeline,
  clearLaunchLog: clearLaunchLog,
  getLaunchLogStats: getLaunchLogStats
};
