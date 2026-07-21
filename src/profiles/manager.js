/**
 * profiles/manager.js — Facade de alto nível para Perfis + Partitions + Vault
 * v3.1.0 — "ProfileManager"
 *
 * FILOSOFIA:
 *   O controller da UI não deveria conhecer a topologia interna
 *   de store.js + partition.js + vault.js + game-launcher.js. Este módulo é a
 *   ÚNICA superfície pública para operações de perfil: criar, listar, lançar,
 *   fechar, deletar, isolar, credenciais, snapshot/restore de cookies.
 *
 * RESPONSABILIDADES:
 *   - CRUD de perfis (delega a store.js, mas enriquece com estado runtime:
 *     isOpen, hasVault, shadow, lastWindow).
 *   - Lançamento de janelas isoladas por `session.fromPartition('persist:profile-<id>')`.
 *     Pepper Flash é injetado via app.commandLine (global, uma vez no boot) —
 *     NÃO por janela. Cada BrowserWindow com `plugins:true` herda o Flash.
 *   - Coordenação com partition.js para shadow partitions (Modo Batata):
 *     restoreCookies() antes de loadURL, snapshotCookies() no fechamento.
 *   - Coordenação com vault.js para auto-login: se o perfil tem credenciais,
 *     game-launcher injeta no formulário após did-finish-load.
 *   - Registro de webContents no MemoryGuard (para injeção periódica de
 *     window.gc() a cada 10min em cada webview ativa).
 *   - Tratamento de crash: render-process-gone de uma partition NÃO derruba
 *     as outras. Cada janela é independente.
 *
 * CONTRATO IPC:
 *   O controller.js registra handlers que chamam estes métodos. O renderer
 *   nunca chama store/partition/vault diretamente.
 *
 * ISOLAMENTO RÍGIDO (requisito do usuário):
 *   Se o jogador abrir o perfil Main e o Fake ao mesmo tempo, cada um recebe
 *   uma BrowserWindow + session.fromPartition INDEPENDENTE. O Pepper Flash de
 *   uma janela NÃO interfere no da outra porque cada session tem seu próprio
 *   plugin host. Se uma cair, a outra continua rodando lisa.
 */

'use strict';

const logger = require('../utils/logger');
const store = require('./store');
const partition = require('./partition');
const vault = require('./vault');
const gameLauncher = require('../ui/game-launcher');

// ── Estado runtime ──
// Map: profileId -> { openedAt, lastSeenMb, crashCount }
const _runtime = new Map();

let _memoryGuard = null; // injetado via setMemoryGuard()
let _listeners = [];

/**
 * Injeta a referência do MemoryGuard (quebra a dependência circular).
 * Deve ser chamado no boot, antes de qualquer launchProfile().
 * @param {Object} mg
 */
function setMemoryGuard(mg) {
  _memoryGuard = mg;
  logger.info('ProfileManager: MemoryGuard vinculado');
}

/**
 * Lista perfis enriquecidos com estado runtime (isOpen, hasVault, shadow).
 * @returns {Array<Object>}
 */
function list() {
  return store.getAll().map(function (p) {
    const rt = _runtime.get(p.id) || {};
    return Object.assign({}, p, {
      hasVault: vault.hasCredentials(p.id),
      shadow: partition.shouldUseShadow(p),
      isOpen: gameLauncher.isProfileOpen(p.id),
      openedAt: rt.openedAt || 0,
      crashCount: rt.crashCount || 0
    });
  });
}

/**
 * Cria um novo perfil. Garante que a partition dir existe (persist) para que
 * bunshin/clone não falhe em perfis nunca lançados.
 * @param {{name:string, server:string, region:string}} opts
 * @returns {Object|null} perfil criado
 */
function create(opts) {
  const p = store.create(opts);
  if (!p) return null;
  // Eager create da partition dir (persist) — evita "user-data-dir não existe"
  // em bunshin/clone de perfil recém-criado.
  try {
    partition.ensurePartitionDir(p);
  } catch (e) {
    logger.debug('ProfileManager: ensurePartitionDir falhou (ok em shadow): ' + e.message);
  }
  _notify();
  return p;
}

/**
 * Atualiza metadados do perfil.
 * @param {string} id
 * @param {Object} updates
 * @returns {boolean}
 */
function update(id, updates) {
  const ok = store.update(id, updates);
  if (ok) _notify();
  return ok;
}

/**
 * Deleta um perfil COMPLETAMENTE: fecha janela, remove partition, vault,
 * snapshot de cookies e entrada no store.
 * @param {string} id
 * @returns {boolean}
 */
function remove(id) {
  // 1. Fecha a janela se aberta
  try {
    gameLauncher.closeProfile(id);
  } catch (_) {
    /* ignore */
  }

  // 2. Remove vault
  try {
    vault.removeCredentials(id);
  } catch (_) {
    /* ignore */
  }

  // 3. Remove snapshot de cookies (shadow mode)
  try {
    partition.removeSnapshot(id);
  } catch (_) {
    /* ignore */
  }

  // 4. Remove do store (store.remove também wipe a partition dir em disco)
  const ok = store.remove(id);

  // 5. Limpa estado runtime
  _runtime.delete(id);

  if (ok) _notify();
  return ok;
}

/**
 * Lança o jogo para um perfil. Orquestra:
 *   1. restoreCookies() se shadow partition (restaura auth cookies salvos).
 *   2. gameLauncher.launchProfile() — cria BrowserWindow isolada.
 *   3. Registra webContents no MemoryGuard (para injeção de window.gc()).
 *   4. Trata crash: render-process-gone NÃO derruba outras janelas.
 *   5. Snapshot de cookies no fechamento (se shadow).
 *
 * @param {string} profileId
 * @param {Function} [onOpened]  — chamado quando a janela abre
 * @param {Function} [onClosed]  — chamado quando a janela fecha
 * @returns {boolean} true se o lançamento foi despachado
 */
function launch(profileId, onOpened, onClosed) {
  const profile = store.get(profileId);
  if (!profile) {
    logger.error('ProfileManager: perfil não encontrado — ' + profileId);
    return false;
  }

  // Marca último uso
  store.touch(profileId);

  // Estado runtime
  const rt = _runtime.get(profileId) || { crashCount: 0 };
  rt.openedAt = Date.now();
  _runtime.set(profileId, rt);

  // Pré-restore de cookies (apenas shadow partitions)
  const partName = partition.getPartitionName(profile);
  if (partition.shouldUseShadow(profile)) {
    partition.restoreCookies(partName, profileId).catch(function (e) {
      logger.debug('ProfileManager: restoreCookies falhou (ok): ' + e.message);
    });
  }

  // Despacha para o game-launcher com wrappers que adicionam GC + crash handler
  try {
    gameLauncher.launchProfile(
      profileId,
      function onOpenedInternal() {
        // Registra webContents no MemoryGuard para injeção periódica de window.gc()
        if (_memoryGuard && typeof _memoryGuard.registerGameWebContents === 'function') {
          try {
            const wc = gameLauncher.getWebContents(profileId);
            if (wc) _memoryGuard.registerGameWebContents(profileId, wc);
          } catch (e) {
            logger.debug('ProfileManager: registerGameWebContents falhou: ' + e.message);
          }
        }
        if (onOpened) onOpened();
      },
      function onClosedInternal() {
        // Snapshot de cookies antes de fechar (apenas shadow)
        if (partition.shouldUseShadow(profile)) {
          partition.snapshotCookies(partName, profileId).catch(function () {
            /* ignore */
          });
        }
        // Desregistra webContents do MemoryGuard
        if (_memoryGuard && typeof _memoryGuard.unregisterGameWebContents === 'function') {
          _memoryGuard.unregisterGameWebContents(profileId);
        }
        _runtime.delete(profileId);
        if (onClosed) onClosed();
      }
    );
    return true;
  } catch (e) {
    logger.error('ProfileManager: launch falhou — ' + e.message);
    return false;
  }
}

/**
 * Fecha a janela de um perfil (sem deletar o perfil).
 * @param {string} profileId
 * @returns {boolean}
 */
function close(profileId) {
  return gameLauncher.closeProfile(profileId);
}

/**
 * Marca que uma janela de jogo sofreu crash (chamado pelo game-launcher em
 * render-process-gone). Não derruba outras janelas — isolamento rígido.
 * @param {string} profileId
 */
function reportCrash(profileId) {
  const rt = _runtime.get(profileId);
  if (rt) {
    rt.crashCount = (rt.crashCount || 0) + 1;
    rt.lastCrashAt = Date.now();
    logger.warn(
      'ProfileManager: crash reportado em ' + profileId + ' (total: ' + rt.crashCount + ')'
    );
  }
}

// ── Vault (credenciais) ──

/**
 * Retorna credenciais descriptografadas (para o renderer validar/injetar).
 * @param {string} profileId
 * @returns {{user:string, pass:string}|null}
 */
function getCredentials(profileId) {
  return vault.getCredentials(profileId);
}

/**
 * Salva credenciais criptografadas (AES-256-GCM machine-bound).
 * @param {string} profileId
 * @param {string} user
 * @param {string} pass
 * @returns {boolean}
 */
function setCredentials(profileId, user, pass) {
  const ok = vault.setCredentials(profileId, user, pass);
  if (ok) _notify();
  return ok;
}

/**
 * Remove credenciais.
 * @param {string} profileId
 * @returns {boolean}
 */
function removeCredentials(profileId) {
  const ok = vault.removeCredentials(profileId);
  if (ok) _notify();
  return ok;
}

/**
 * Verifica se o perfil tem credenciais salvas.
 * @param {string} profileId
 * @returns {boolean}
 */
function hasCredentials(profileId) {
  return vault.hasCredentials(profileId);
}

// ── Import/Export ──

/**
 * Export all profiles as a JSON string.
 * @returns {string} JSON array of profiles
 */
function exportAll() {
  return store.exportJSON();
}

/**
 * Import profiles from a JSON string (replaces existing profiles).
 * @param {string} jsonStr - JSON array of profile objects
 * @returns {{imported: number}} import result
 */
function importAll(jsonStr) {
  const result = store.importJSON(jsonStr);
  _notify();
  return result;
}

// ── Estado runtime / observabilidade ──

/**
 * Retorna estatísticas do gerenciador (para o dashboard).
 * @returns {{total:number, open:number, withVault:number, shadow:number, crashes:number}}
 */
function getStats() {
  let open = 0,
    withVault = 0,
    shadow = 0,
    crashes = 0;
  const all = store.getAll();
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (gameLauncher.isProfileOpen(p.id)) open++;
    if (vault.hasCredentials(p.id)) withVault++;
    if (partition.shouldUseShadow(p)) shadow++;
    const rt = _runtime.get(p.id);
    if (rt && rt.crashCount) crashes += rt.crashCount;
  }
  return {
    total: all.length,
    open: open,
    withVault: withVault,
    shadow: shadow,
    crashes: crashes,
    max: store.MAX_PROFILES
  };
}

/**
 * Lista IDs dos perfis atualmente abertos (para o MemoryGuard iterar).
 * @returns {Array<string>}
 */
function getOpenProfileIds() {
  return store
    .getAll()
    .filter(function (p) {
      return gameLauncher.isProfileOpen(p.id);
    })
    .map(function (p) {
      return p.id;
    });
}

/**
 * Registra listener para mudanças (UI atualiza via push).
 * @param {Function} cb
 */
function onChange(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

function _notify() {
  const snapshot = list();
  _listeners.forEach(function (cb) {
    try {
      cb(snapshot);
    } catch (_) {
      /* ignore */
    }
  });
}

module.exports = {
  // Lifecycle
  setMemoryGuard: setMemoryGuard,
  // CRUD
  list: list,
  create: create,
  update: update,
  remove: remove,
  // Launch
  launch: launch,
  close: close,
  reportCrash: reportCrash,
  // Vault
  getCredentials: getCredentials,
  setCredentials: setCredentials,
  removeCredentials: removeCredentials,
  hasCredentials: hasCredentials,
  // Import/Export
  exportAll: exportAll,
  importAll: importAll,
  // Stats
  getStats: getStats,
  getOpenProfileIds: getOpenProfileIds,
  // Events
  onChange: onChange,
  // Constants
  MAX_PROFILES: store.MAX_PROFILES
};
