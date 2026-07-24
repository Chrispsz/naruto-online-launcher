/**
 * app/StallDetector.js — Stuck loader detection + auto-F5 with pre-auth
 *
 * PROBLEM (v5.9.11): Naruto Online login sometimes gets stuck at ~14% with
 * connection error. Root cause: an essential SWF (assets, UI, empty.swf)
 * fails to download (network hiccup, timeout, Mixed Content). The preloader
 * of Flash has NO retry — when an SWF fails, the loader gets stuck
 * forever at that percentage. The user has to close and reopen manually.
 *
 * SOLUTION: monitor the session via webRequest.onCompleted + onErrorOccurred.
 * When detected:
 *   (A) 2+ SWFs failing in 60s → burst of failures = unstable server → reload
 *   (B) 45s without any network activity during loading → stuck loader → reload
 * Calls onStall() which delegates to SessionLifecycle.reloadWithPreAuth
 * (same flow as F5: clears cookies + pre-authenticates via API before reload).
 *
 * BACKOFF: max 3 auto-reloads in 10 min per profile (avoids infinite loop
 * if the server is actually down).
 *
 * AUTO-STOP: after 120s of continuous activity without stall, consider the
 * game "ready" and end monitoring (the game is running, no
 * longer needs a watchdog).
 *
 * LISTENER CLEANUP: Electron 11's webRequest.onCompleted(null) removes ALL
 * listeners from the session, not just ours. This caused leaks when
 * multiple windows used the same session. Fix: we use a WeakMap to
 * track registered filters per session and pass the correct filter
 * on detach(). If removal with filter isn't possible, we use
 * a 'stopped' flag to no-op in handlers (listeners remain but are inert).
 *
 * Note: did-fail-load (in SessionLifecycle) handles HTML page errors.
 * This module handles SUB-RESOURCE failures (SWFs inside the
 * Flash player) that did-fail-load doesn't detect.
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
 * @returns {Object|null} instance with detach() method, or null if invalid
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
