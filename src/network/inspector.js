/**
 * Network Inspector — captures game data via webRequest
 * v1.0.0 — v4.9: dev-mode network inspector (alternative to blocked DevTools)
 *
 * The Naruto Online game runs in Flash (PPAPI). Character data (stats,
 * items, party, etc.) are NOT in the DOM — they are in HTTP responses that the SWF
 * makes. The only way to capture this data is by intercepting via
 * session.webRequest.onBeforeRequest / onResponseStarted.
 *
 * This module registers listeners on the profile's session and captures:
 *   - URLs called (with method, type, timestamp)
 *   - Captured oas_user cookies (decoded JWT)
 *   - Known endpoints (passport, odp3, game backend)
 *   - Aggregated statistics (requests/min, domains hit, etc.)
 *
 * DevTools (Ctrl+Shift+I) is blocked in the game for security. This inspector
 * is the legitimate alternative for developers to analyze traffic.
 */

'use strict';

const logger = require('../utils/logger');
const jwt = require('../utils/jwt');

// Interesting endpoints for classifying captures
// added login flow endpoints observed in F12:
//   - ScriptLoginManager-1.2.php (login manager JS with encrypted params)
//   - Scriptpad-zeropadding.js (crypto padding library for login form)
//   - query_svr_info.fcgi (XHR that fetches server info by svr_id)
// These 3 endpoints appear in normal game traffic even with pre-auth
// via API (oas_user cookie). The ScriptLoginManager is loaded by the game page
// for session validation — NOT a bug if it appears with status 200.
var KNOWN_ENDPOINTS = {
  'passport.oasgames.com': { type: 'auth', label: 'Passport (login/register)' },
  'odp3.oasgames.com': { type: 'api', label: 'Odp3 API (servers/profile)' },
  'naruto-pl.oasgames.com': { type: 'game', label: 'PL game backend (HTTP!)' },
  'naruto.narutowebgame.com': { type: 'site', label: 'Naruto site' },
  'narutowebgame.com': { type: 'site', label: 'Naruto site' },
  'oasgames.com': { type: 'parent', label: 'oasgames parent' }
};

// Path signatures for classifying requests by filename
// when hostname is already known but the path identifies the specific function.
// Useful to distinguish login flow vs game API vs telemetry in inspector log.
var KNOWN_PATH_SIGNATURES = [
  {
    pattern: /ScriptLoginManager/i,
    type: 'auth',
    label: 'ScriptLoginManager (login form JS)'
  },
  {
    pattern: /Scriptpad-zeropadding/i,
    type: 'auth',
    label: 'Scriptpad zeropadding (login crypto)'
  },
  {
    pattern: /query_svr_info\.fcgi/i,
    type: 'game',
    label: 'Server info query (svr_id)'
  },
  {
    pattern: /oss_report\.fcgi/i,
    type: 'telemetry',
    label: 'iMSDK telemetry (BLOCKED)'
  },
  {
    pattern: /crossdomain\.xml/i,
    type: 'telemetry',
    label: 'Flash policy (BLOCKED)'
  }
];

/**
 * Creates an inspector for an Electron session.
 * @param {Object} session — session.fromPartition(partName)
 * @param {string} profileId
 * @returns {Object} inspector instance
 */
function create(session, profileId) {
  var entries = []; // last N captures
  var stats = {
    // agregados
    totalRequests: 0,
    byDomain: {},
    // added 'telemetry' type (oss_report.fcgi, crossdomain.xml)
    byType: { auth: 0, api: 0, game: 0, site: 0, parent: 0, telemetry: 0, other: 0 },
    capturedCookies: [],
    capturedJwts: [],
    startedAt: Date.now()
  };
  var maxEntries = 500;
  var listeners = { onCapture: [] };
  var enabled = false;
  // Filter used in enable() — required for precise removable in disable().
  // Without filter, onBeforeRequest(null) removes ALL session listeners
  // (including the ad blocker), not just ours. Same pattern as StallDetector.
  var _filter = { urls: ['<all_urls>'] };

  /**
   * Classifies a URL into known types.
   * v5.9.10: now also checks KNOWN_PATH_SIGNATURES to classify
   * by file name (ScriptLoginManager, query_svr_info, etc.) —
   * more specific than hostname alone.
   */
  function classify(url) {
    try {
      var u = new (require('url').URL)(url);
      var host = u.hostname;
      var fullPath = u.pathname + u.search;

      // First checks path signatures (more specific)
      for (var i = 0; i < KNOWN_PATH_SIGNATURES.length; i++) {
        var sig = KNOWN_PATH_SIGNATURES[i];
        if (sig.pattern.test(fullPath)) {
          return {
            domain: host,
            path: u.pathname,
            type: sig.type,
            label: sig.label
          };
        }
      }

      // Then checks known hostname
      for (var domain in KNOWN_ENDPOINTS) {
        if (host === domain || host.endsWith('.' + domain)) {
          return Object.assign({ domain: host, path: u.pathname }, KNOWN_ENDPOINTS[domain]);
        }
      }
      return { type: 'other', label: host, domain: host, path: u.pathname };
    } catch (e) {
      return { type: 'other', label: '?', domain: '?', path: url.slice(0, 60) };
    }
  }

  /**
   * Attempts to extract JWT from cookie header or query param.
   */
  function tryExtractJwt(details) {
    // Cookie header
    var cookieHdr = details.requestHeaders && details.requestHeaders.Cookie;
    if (cookieHdr && cookieHdr.indexOf('oas_user=') !== -1) {
      var m = cookieHdr.match(/oas_user=([^;]+)/);
      if (m) {
        var decoded = jwt.decode(m[1]);
        if (decoded && stats.capturedJwts.indexOf(m[1]) === -1) {
          stats.capturedJwts.push(m[1]);
          stats.capturedCookies.push({
            name: 'oas_user',
            value: m[1].slice(0, 30) + '...',
            decoded: decoded,
            capturedAt: Date.now()
          });
          return decoded;
        }
      }
    }
    return null;
  }

  function record(details, kind) {
    var info = classify(details.url);
    stats.totalRequests++;
    stats.byDomain[info.domain] = (stats.byDomain[info.domain] || 0) + 1;
    stats.byType[info.type] = (stats.byType[info.type] || 0) + 1;

    var entry = {
      id: details.id,
      url: details.url,
      method: details.method || 'GET',
      kind: kind, // 'request' or 'response'
      type: info.type,
      label: info.label,
      domain: info.domain,
      path: info.path,
      timestamp: details.timestamp || Date.now(),
      statusCode: details.statusCode || null,
      resourceType: details.resourceType || null
    };

    // Only extracts JWT from requests to passport/oasgames
    if (info.type === 'auth' || info.type === 'parent' || info.type === 'site') {
      var decoded = tryExtractJwt(details);
      if (decoded) entry.jwt = decoded;
    }

    entries.push(entry);
    if (entries.length > maxEntries) entries.shift();

    listeners.onCapture.forEach(function (cb) {
      try {
        cb(entry);
      } catch (e) {
        logger.debug('Inspector: callback error: ' + e.message);
      }
    });
  }

  function enable() {
    if (enabled) return;
    enabled = true;

    session.webRequest.onBeforeRequest(_filter, function (details) {
      record(details, 'request');
      // NEVER blocks — only observes
      return { cancel: false };
    });

    session.webRequest.onResponseStarted(_filter, function (details) {
      record(details, 'response');
    });

    logger.info('Inspector: capture active for ' + profileId);
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    // Uses specific filter to remove ONLY our listeners —
    // without filter, removes ALL onBeforeRequest from the session (including
    // the ad blocker from blocker.js). Same pattern as StallDetector.
    try {
      session.webRequest.onBeforeRequest(_filter, null);
      session.webRequest.onResponseStarted(_filter, null);
    } catch (_) {
      /* session may already be destroyed */
    }
    logger.info('Inspector: capture disabled for ' + profileId);
  }

  function getEntries(filter) {
    if (!filter) return entries.slice();
    return entries.filter(function (e) {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.kind && e.kind !== filter.kind) return false;
      if (filter.domain && e.domain !== filter.domain) return false;
      return true;
    });
  }

  function getStats() {
    return Object.assign({}, stats, {
      entriesCount: entries.length,
      uptime: Math.round((Date.now() - stats.startedAt) / 1000),
      requestsPerMin: stats.totalRequests / Math.max(1, (Date.now() - stats.startedAt) / 60000)
    });
  }

  function on(event, cb) {
    if (event === 'capture' && typeof cb === 'function') {
      listeners.onCapture.push(cb);
    }
  }

  function clear() {
    entries = [];
    stats.capturedCookies = [];
    stats.capturedJwts = [];
    stats.totalRequests = 0;
    stats.byDomain = {};
    stats.byType = { auth: 0, api: 0, game: 0, site: 0, parent: 0, telemetry: 0, other: 0 };
    stats.startedAt = Date.now();
  }

  return {
    enable: enable,
    disable: disable,
    isEnabled: function () {
      return enabled;
    },
    getEntries: getEntries,
    getStats: getStats,
    on: on,
    clear: clear,
    profileId: profileId
  };
}

module.exports = {
  create: create,
  KNOWN_ENDPOINTS: KNOWN_ENDPOINTS,
  KNOWN_PATH_SIGNATURES: KNOWN_PATH_SIGNATURES
};
