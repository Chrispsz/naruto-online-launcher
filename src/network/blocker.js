/**
 * Tracker and Analytics Blocker
 * v1.3.0 — Idempotent anti-leak (cron-review-1)
 */

'use strict';

const logger = require('../utils/logger');

// Idempotency: sessions already configured (onBeforeRequest replaces, but
// we avoid redundant work on profile reopening)
const _configuredSessions = new WeakSet();

// Blocked domains
const BLOCKED_DOMAINS = new Set([
  // Analytics
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',

  // Ads
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',

  // Social tracking
  // NOTE: connect.facebook.net is NOT blocked — the game's Facebook tools
  // (oas_facebook_tools.js) require the real SDK to avoid infinite retry loops.
  // Only the tracking pixel endpoint is blocked.
  'pixel.facebook.net',
  'pixel.facebook.com',

  // OAS Games tracking ONLY
  // WARNING: odp3.oasgames.com is the GAME API (servers, VIP) — DO NOT BLOCK
  // WARNING: vipsac.oasgames.com is needed for VIP store features
  'collect.mdata.cool',
  'mdata.cool',
  'pin.mdata.cool',
  'pin.oasgames.com',
  'track.oasgames.com',
  'log.oasgames.com',
  'track.narutowebgame.com',
  // 'odp3.oasgames.com'  ← GAME API: get-user-servers, getvip — CRITICAL
  // 'vipsac.oasgames.com' ← VIP store — needed for purchase features
  'dmp.oasgames.com',

  // NOTE: huoying.qq.com (Tencent CDN) is NOT blocked — the game loads
  // critical SWF files from res.huoying.qq.com (UI, empty.swf, etc.)
  // Previously blocked due to timeouts, but that was caused by Mixed Content
  // policy — now fixed with --allow-running-insecure-content.

  // Telemetry
  'sentry.io',

  // General
  'hotjar.com',
  'clarity.ms',
  'cdn.mxpnl.com'
]);

// URL path patterns to block (for telemetry that runs on the SAME domain
// do jogo, onde bloquear por hostname quebraria o jogo). Caso constatado no F12:
// oss_report.fcgi?uin=...&role_id=...&svr_id=... is the iMSDK from Tencent reporting
// server_id + role_id + uin pra telemetria, no mesmo host naruto-pl.oasgames.com.
// Blocking the PATH (not the domain) preserves the game and cuts the leak.
const BLOCKED_PATH_PATTERNS = [
  /\/oss_report\.fcgi\b/i, // Tencent iMSDK telemetry (server_id, role_id, uin)
  /\/crossdomain\.xml$/i // Flash security policy — always fails (404/timeout), only generates noise
];

/**
 * Check if a hostname matches any blocked domain
 * @param {string} hostname - Hostname to check
 * @returns {boolean} True if blocked
 */
function isBlockedDomain(hostname) {
  for (const domain of BLOCKED_DOMAINS) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a URL path matches any blocked path pattern (v5.9.9).
 * Used for telemetry that runs on the SAME game domain (e.g.: oss_report.fcgi
 * em naruto-pl.oasgames.com) onde bloquear o hostname quebraria o jogo.
 * @param {string} pathname - URL pathname to check
 * @returns {boolean} True if blocked
 */
function isBlockedPath(pathname) {
  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(pathname)) return true;
  }
  return false;
}

/**
 * Check if a URL should be blocked (hostname OR path pattern).
 * @param {string} url - URL to check
 * @returns {boolean} True if should be blocked
 */
function shouldBlock(url) {
  try {
    const u = new URL(url);
    if (isBlockedDomain(u.hostname)) return true;
    if (isBlockedPath(u.pathname)) return true;
    return false;
  } catch (e) {
    // Fail-closed: unparseable URLs are blocked (legitimate game URLs always parse)
    return true;
  }
}

/**
 * Setup request blocker on a session.
 * Idempotent (cron-review-1): skips if already configured.
 * @param {Electron.Session} session - Browser session
 * @returns {boolean} true se configurou agora
 */
function setupBlocker(session) {
  if (_configuredSessions.has(session)) {
    logger.debug('Blocker: session already configured — skip');
    return false;
  }
  _configuredSessions.add(session);

  session.webRequest.onBeforeRequest(function (details, callback) {
    if (shouldBlock(details.url)) {
      logger.debug('Blocked: ' + details.url);
      return callback({ cancel: true });
    }

    // Replace logintype=3 with logintype=4
    // Use boundary-aware match to avoid replacing logintype=30, logintype=301, etc.
    let url = details.url;
    if (url.includes('logintype=3')) {
      const replaced = url.replace(/logintype=3(?=[&#]|$)/g, 'logintype=4');
      if (replaced !== url) {
        return callback({ redirectURL: replaced });
      }
    }

    callback({ cancel: false });
  });

  logger.info(
    'Blocker: ' +
      BLOCKED_DOMAINS.size +
      ' domains + ' +
      BLOCKED_PATH_PATTERNS.length +
      ' path patterns'
  );
  return true;
}

/**
 * Resets the idempotency state of a session.
 * @param {Electron.Session} session
 */
function forgetSession(session) {
  _configuredSessions.delete(session);
}

module.exports = {
  BLOCKED_DOMAINS: BLOCKED_DOMAINS,
  BLOCKED_PATH_PATTERNS: BLOCKED_PATH_PATTERNS,
  isBlockedDomain: isBlockedDomain,
  isBlockedPath: isBlockedPath,
  shouldBlock: shouldBlock,
  setupBlocker: setupBlocker,
  forgetSession: forgetSession
};
