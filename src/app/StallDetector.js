/**
 * app/StallDetector.js — Stuck loader detection + auto-F5 with pre-auth
 *
 * PROBLEMA (v5.9.11): o login do Naruto Online às vezes trava em ~14% e dá
 * erro de conexão. Root cause: um SWF essencial (assets, UI, empty.swf)
 * falha no download (network hiccup, timeout, Mixed Content). O preloader
 * do Flash NÃO tem retry — quando um SWF falha, o loader fica preso
 * forever naquela porcentagem. O usuário precisa fechar e reabrir manualmente.
 *
 * SOLUÇÃO: monitorar a session via webRequest.onCompleted + onErrorOccurred.
 * Quando detectamos:
 *   (A) 2+ SWFs falhando em 60s → burst de falhas = servidor instável → reload
 *   (B) 45s sem nenhuma atividade de rede durante o loading → loader travado → reload
 * Chamamos onStall() que delega pra SessionLifecycle.reloadWithPreAuth
 * (mesmo fluxo do F5: limpa cookies + pré-autentica via API antes de reload).
 *
 * BACKOFF: max 3 auto-reloads em 10 min por perfil (evita loop infinito
 * se o servidor estiver realmente fora do ar).
 *
 * AUTO-STOP: após 120s de atividade contínua sem stall, consideramos o
 * jogo "pronto" e encerramos o monitoramento (o jogo está rodando, não
 * precisa mais de watchdog).
 *
 * LISTENER CLEANUP: Electron 11's webRequest.onCompleted(null) remove TODOS
 * os listeners da session, não apenas o nosso. Isso causava leak quando
 * múltiplas janelas usavam a mesma session. Fix: usamos um WeakMap para
 * rastrear os filtros registrados por cada session e passamos o filtro
 * correto no detach(). Se não for possível remover com filtro, usamos
 * um flag 'stopped' para no-op nos handlers (listeners ficam mas são inertes).
 *
 * Nota: did-fail-load (em SessionLifecycle) cuida de erros da página HTML
 * principal. Este módulo cuida de falhas de SUB-RECURSOS (SWFs dentro do
 * Flash player) que o did-fail-load não detecta.
 */

'use strict';

var logger = require('../utils/logger');

// WeakMap to track webRequest filters per session — enables clean detach
// without removing listeners from other StallDetectors on the same session.
var _sessionFilters = new WeakMap();

var DEFAULTS = {
  maxRetries: 3, // max auto-reloads in retry window
  retryWindowMs: 600000, // 10 min — window for counting retries
  stallThresholdMs: 45000, // 45s without activity = loader stuck
  swfErrorThreshold: 2, // 2 SWFs failing in 60s = burst = reload
  swfErrorWindowMs: 60000, // 60s — window for counting SWF errors
  pollIntervalMs: 10000, // check every 10s
  readyAfterMs: 120000 // 120s of continuous activity = game ready
};

/**
 * Cria e anexa um StallDetector a uma janela de jogo.
 *
 * @param {Electron.BrowserWindow} win
 * @param {Electron.Session} ses
 * @param {Object} ctx
 * @param {string} ctx.profileName — nome do perfil (pra logs)
 * @param {Function} ctx.onStall — callback chamado quando stall detectado
 * @param {Object} [ctx.opts] — overrides de thresholds (pra testes)
 * @returns {Object|null} instância com método detach(), ou null se inválido
 */
function attach(win, ses, ctx) {
  if (!win || !ses) return null;
  if (!ctx || typeof ctx.onStall !== 'function') return null;

  var profileName = ctx.profileName || 'unknown';
  var onStall = ctx.onStall;
  var opts = Object.assign({}, DEFAULTS, ctx.opts || {});

  var lastActivityAt = Date.now();
  var startedAt = Date.now();
  var swfErrors = []; // timestamps of SWF failures
  var retries = []; // timestamps of auto-reloads
  var stopped = false;
  var ready = false;
  var pollInterval = null;

  /**
   * Check if a URL is a SWF file.
   */
  function isSwf(url) {
    if (!url) return false;
    return /\.swf(\?|$|#)/i.test(url);
  }

  /**
   * Listener onCompleted — any resource that completes = network activity.
   */
  function onCompleted() {
    if (stopped) return;
    lastActivityAt = Date.now();
  }

  /**
   * Listener onErrorOccurred — records failures, especially SWFs.
   */
  function onErrorOccurred(details) {
    if (stopped) return;
    lastActivityAt = Date.now();
    if (isSwf(details.url)) {
      swfErrors.push(Date.now());
      logger.warn(
        'StallDetector: SWF failed — ' +
          (details.url || '').slice(0, 120) +
          ' (error: ' +
          (details.error || 'unknown') +
          ') — ' +
          profileName
      );
    }
  }

  /**
   * Main poll — runs every pollIntervalMs, checks stall conditions.
   */
  function check() {
    if (stopped || ready) return;
    if (win.isDestroyed()) {
      detach();
      return;
    }

    var now = Date.now();

    // Clear old entries
    swfErrors = swfErrors.filter(function (t) {
      return now - t < opts.swfErrorWindowMs;
    });
    retries = retries.filter(function (t) {
      return now - t < opts.retryWindowMs;
    });

    // ── Check: game ready? ──
    // After readyAfterMs of continuous activity without stall, we consider it loaded.
    if (now - startedAt > opts.readyAfterMs && now - lastActivityAt < opts.stallThresholdMs) {
      ready = true;
      logger.info(
        'StallDetector: game ready after ' +
          Math.round((now - startedAt) / 1000) +
          's — monitoring ended — ' +
          profileName
      );
      detach();
      return;
    }

    // ── Check: retry limit reached? ──
    if (retries.length >= opts.maxRetries) {
      logger.error(
        'StallDetector: auto-reload limit reached (' +
          opts.maxRetries +
          ' in ' +
          Math.round(opts.retryWindowMs / 60000) +
          'min) — ' +
          profileName +
          ' — GIVING UP (server may be down)'
      );
      detach();
      return;
    }

    // ── Check: SWF failure burst? ──
    if (swfErrors.length >= opts.swfErrorThreshold) {
      triggerStall(
        'SWF failure burst (' +
          swfErrors.length +
          ' in ' +
          Math.round(opts.swfErrorWindowMs / 1000) +
          's)'
      );
      return;
    }

    // ── Check: network inactivity? ──
    var inactiveFor = now - lastActivityAt;
    if (inactiveFor > opts.stallThresholdMs) {
      triggerStall('no network activity for ' + Math.round(inactiveFor / 1000) + 's');
      return;
    }
  }

  /**
   * Fire the stall: log, record retry, call onStall.
   */
  function triggerStall(reason) {
    if (stopped || ready) return;
    var attemptNum = retries.length + 1;
    logger.warn(
      'StallDetector: STALL detected — ' +
        reason +
        ' — ' +
        profileName +
        ' — auto-reload #' +
        attemptNum +
        '/' +
        opts.maxRetries
    );
    retries.push(Date.now());
    // Reset activity + errors to avoid immediate re-trigger on next poll
    lastActivityAt = Date.now();
    swfErrors = [];
    try {
      onStall();
    } catch (e) {
      logger.error('StallDetector: onStall callback threw error: ' + e.message);
    }
  }

  /**
   * Detach listeners + clear interval.
   * IMPORTANT: 'stopped' flag makes handlers inert. Even if we can't
   * remove the listener from webRequest (Electron 11 limited API),
   * the handler checks 'stopped' at the top and returns immediately — no
   * CPU leak or side-effects.
   */
  function detach() {
    if (stopped) return;
    stopped = true;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    // Try to remove listeners with the stored filter. Electron 11's
    // webRequest.onCompleted/onErrorOccurred(null) removes ALL
    // listeners from the session — this is dangerous with multiple windows.
    // We pass the specific filter if available.
    try {
      var filters = _sessionFilters.get(ses);
      if (filters) {
        ses.webRequest.onCompleted(filters, null);
        ses.webRequest.onErrorOccurred(filters, null);
        _sessionFilters.delete(ses);
      }
    } catch (_) {
      // Session may already be destroyed — 'stopped' ensures handlers are no-op
    }
  }

  // ── Initialization ──
  // Store filter for precise removal on detach. If the session has
  // other StallDetectors (multiple windows on the same partition), we won't
  // affect them — each one removes only its own filter.
  var _filter = { urls: ['<all_urls>'] };
  _sessionFilters.set(ses, _filter);
  ses.webRequest.onCompleted(_filter, onCompleted);
  ses.webRequest.onErrorOccurred(_filter, onErrorOccurred);
  pollInterval = setInterval(check, opts.pollIntervalMs);
  if (pollInterval.unref) pollInterval.unref();

  logger.info(
    'StallDetector: monitoring — ' +
      profileName +
      ' (stall=' +
      opts.stallThresholdMs / 1000 +
      's, swfBurst=' +
      opts.swfErrorThreshold +
      ' in ' +
      opts.swfErrorWindowMs / 1000 +
      's, maxRetry=' +
      opts.maxRetries +
      ')'
  );

  return {
    detach: detach,
    // exposed for tests/inspection
    _isReady: function () {
      return ready;
    },
    _isStopped: function () {
      return stopped;
    },
    _getRetryCount: function () {
      return retries.length;
    }
  };
}

module.exports = {
  attach: attach
};
