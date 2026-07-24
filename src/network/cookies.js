/**
 * Persistent Cookie Management
 * v1.3.0 — Idempotent anti-leak of listeners (cron-review-1)
 */

'use strict';

const logger = require('../utils/logger');

const COOKIE_EXPIRY = 365 * 86400; // 1 year in seconds

// ── Idempotency: WeakSet tracks already-configured sessions ──
// BUG FIX (cron-review-1): previously, each call to setupPersistentCookies()
// registered a NEW listener on session.cookies.on('changed'). Since sessions
// persist:profile-<id> are cached by Electron, reopening a profile
// duplicava os listeners → cada cookie change disparava N cookies.set()
// → cumulative performance degradation. Now skipped if already configured.
const _configuredSessions = new WeakSet();

// Tracking domains to strip cookies from
const TRACKING_DOMAINS = [
  'facebook.com',
  'google.com',
  'doubleclick.net',
  'google-analytics.com',
  'sentry.io',
  'track.oasgames.com',
  'track.narutowebgame.com',
  'mdata.cool'
];

// Allowed domains (never strip cookies)
const ALLOWED_DOMAINS = ['narutowebgame.com', 'oasgames.com'];

/**
 * Check if a domain matches or is a subdomain of a base domain
 * @param {string} domain - Domain to check
 * @param {string} base - Base domain
 * @returns {boolean}
 */
function domainMatch(domain, base) {
  return domain && (domain === base || domain.endsWith('.' + base));
}

/**
 * Check if hostname belongs to the game domain
 * @param {string} hostname - Hostname to check
 * @returns {boolean}
 */
function isGameDomain(hostname) {
  return ALLOWED_DOMAINS.some(function (d) {
    return domainMatch(hostname, d);
  });
}

/**
 * Check if hostname belongs to a tracking domain
 * @param {string} hostname - Hostname to check
 * @returns {boolean}
 */
function isTrackingDomain(hostname) {
  return TRACKING_DOMAINS.some(function (d) {
    return domainMatch(hostname, d);
  });
}

/**
 * Setup persistent cookies with auto-extension + optional CSP.
 *
 * IDEMPOTENT (cron-review-1): if session already configured, skip.
 * Resolves 'changed' listener leak accumulated on profile reopen.
 *
 * BUG FIX (cron-review-1): previously, callers (e.g.: game-launcher.js) registered
 * a SECOND onHeadersReceived for CSP, which overwrote this handler
 * → cookie extension was dead. Now CSP is merged HERE in the same handler.
 *
 * @param {Electron.Session} session - Browser session
 * @param {Object} [options]
 * @param {string} [options.csp] - Content-Security-Policy header to inject
 * @returns {boolean} true if configured now, false if already configured
 */
function setupPersistentCookies(session, options) {
  // Idempotency: do not re-register listeners on the same session
  if (_configuredSessions.has(session)) {
    logger.debug('Cookies: session already configured — skip (idempotent)');
    return false;
  }
  _configuredSessions.add(session);

  const opts = options || {};
  const csp = opts.csp || null;
  const convertingCookies = new Set();

  session.cookies.on('changed', function (event, cookie, cause, removed) {
    if (removed) return;

    // Guard: skip API-caused overwrites to prevent infinite loops
    if (cause === 'overwrite') return;
    // 'explicit' = cookie set by renderer JS (document.cookie) — these we DO process

    // Don't strip cookies from allowed domains
    if (
      ALLOWED_DOMAINS.some(function (d) {
        return domainMatch(cookie.domain, d);
      })
    ) {
      const key = cookie.domain + '|' + cookie.name;
      if (convertingCookies.has(key)) return;

      // Only extend if less than 7 days remaining
      const sevenDays = 7 * 86400;
      if (!cookie.expirationDate || cookie.expirationDate < Date.now() / 1000 + sevenDays) {
        convertingCookies.add(key);

        const url = buildCookieUrl(cookie);

        session.cookies
          .set({
            url: url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            // Force secure=false — some game endpoints use HTTP
            // and secure cookies won't be sent over HTTP, breaking login/session
            secure: false,
            httpOnly: cookie.httpOnly,
            expirationDate: Math.floor(Date.now() / 1000) + COOKIE_EXPIRY,
            sameSite: 'no_restriction'
          })
          .catch(function (err) {
            logger.debug('Cookie set failed: ' + err.message);
          })
          .finally(function () {
            convertingCookies.delete(key);
          });
      }
      return;
    }

    // Strip tracking cookies directly
    if (isTrackingDomain(cookie.domain.replace(/^\./, ''))) {
      const url2 = buildCookieUrl(cookie);
      session.cookies.remove(url2, cookie.name).catch(function () {});
    }
  });

  // ── Single onHeadersReceived: CSP + cookie extension + tracking block ──
  // (Electron only allows ONE handler per session/event — merging here is MANDATORY)
  session.webRequest.onHeadersReceived(function (details, callback) {
    const setCookie = details.responseHeaders && details.responseHeaders['set-cookie'];

    let hostname;
    try {
      hostname = new URL(details.url).hostname;
    } catch (e) {
      return callback({});
    }

    const responseHeaders = Object.assign({}, details.responseHeaders);

    // 1. CSP injection (se passado pelo caller)
    if (csp && (details.url.startsWith('http:') || details.url.startsWith('https:'))) {
      responseHeaders['Content-Security-Policy'] = [csp];
    }

    // 2. Cookie extension / tracking block
    if (setCookie) {
      if (isTrackingDomain(hostname)) {
        // Block tracking cookies at the source
        delete responseHeaders['set-cookie'];
      } else if (isGameDomain(hostname)) {
        // Extend game cookies to 1 year
        responseHeaders['set-cookie'] = setCookie.map(function (cookie) {
          if (
            !cookie.toLowerCase().includes('expires=') &&
            !cookie.toLowerCase().includes('max-age=')
          ) {
            return cookie + '; Max-Age=' + COOKIE_EXPIRY;
          }
          return cookie;
        });
      }
    }

    callback({ responseHeaders: responseHeaders });
  });

  logger.info('Persistent cookies configured' + (csp ? ' (+ CSP)' : ''));
  return true;
}

/**
 * Resets the idempotency state of a session (for tests or explicit reset).
 * Does NOT remove already-registered listeners — use session.cookies.removeAllListeners('changed')
 * se precisar de limpeza profunda.
 * @param {Electron.Session} session
 */
function forgetSession(session) {
  _configuredSessions.delete(session);
}

/**
 * Build URL from cookie for set/remove operations
 * @param {Object} cookie - Cookie object
 * @returns {string} URL string
 */
function buildCookieUrl(cookie) {
  const protocol = cookie.secure ? 'https://' : 'http://';
  const domain = cookie.domain.replace(/^\./, '');
  const cookiePath = cookie.path || '/';
  return protocol + domain + cookiePath;
}

/**
 * Clear all cookies and cache
 * @param {Electron.Session} session - Browser session
 * @returns {Promise<boolean>}
 */
async function clearAllCookies(session) {
  try {
    const cookies = await session.cookies.get({});

    // Remove all cookies in parallel for speed
    await Promise.all(
      cookies.map(function (c) {
        return session.cookies.remove(buildCookieUrl(c), c.name).catch(function () {});
      })
    );

    await session.clearCache();
    await session.clearStorageData();

    logger.info('Cookies and cache cleared');
    return true;
  } catch (e) {
    logger.error('Failed to clear cookies: ' + e.message);
    return false;
  }
}

module.exports = {
  setupPersistentCookies: setupPersistentCookies,
  clearAllCookies: clearAllCookies,
  forgetSession: forgetSession
};
