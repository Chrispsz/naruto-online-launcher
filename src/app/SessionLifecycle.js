/**
 * app/SessionLifecycle.js — Game window lifecycle hooks (Phase 3d split)
 *
 * Single Responsibility (SRP): attach event handlers (did-finish-load,
 * did-fail-load, render-process-gone, unresponsive, will-navigate, new-window,
 * close, closed, ready-to-show) to a game BrowserWindow. Includes CSS
 * injection, FB mock, and auto-login via vault.
 *
 * History: was inline in the God Object game-launcher.js (620 lines). Extracted
 * to isolate the lifecycle from launch/orchestration.
 */

'use strict';

const logger = require('../utils/logger');
const vault = require('../profiles/vault');
const ManagerWindow = require('../ui/manager/ManagerWindow');
const StallDetector = require('./StallDetector');

/**
 * Loads the game page with pre-authentication via API when possible.
 * If the profile has credentials in the vault, calls apiLogin.loginAndInject() BEFORE
 * loadURL — so the oas_user cookie is already set and the server redirects
 * straight to the game, without showing the Naruto Online login screen.
 * Fallback: if API login fails, loads the URL normally (form-injection auto-login
 * via MutationObserver handles the login after that).
 */
function _loadGameWithPreAuth(profileId, profile, win, ses, getGameUrl) {
  var url = getGameUrl(profile);

  if (vault.hasCredentials(profileId)) {
    var creds = vault.getCredentials(profileId);
    if (creds && creds.user && creds.pass) {
      var apiLogin = require('../network/api-login');
      logger.info('Direct API login for "' + profile.name + '" (cookie pre-injected)');
      apiLogin
        .loginAndInject(ses, creds.user, creds.pass)
        .then(function () {
          if (win.isDestroyed()) return;
          win.loadURL(url);
        })
        .catch(function (e) {
          if (win.isDestroyed()) return;
          logger.warn(
            'API login failed for "' +
              profile.name +
              '" — fallback form-injection: ' +
              e.message
          );
          win.loadURL(url);
        });
      return;
    }
  }

  logger.info('Loading game for "' + profile.name + '": ' + url);
  win.loadURL(url);
}

/**
 * Send auto-login result to manager window (UI feedback).
 * @param {string} profileId
 * @param {string} result - 'filled'|'clicked'|'waiting'|'not-found'|'error'
 */
function _sendAutoLoginResult(profileId, result) {
  var status;
  if (result === 'filled' || result === 'clicked') status = 'success';
  else if (result === 'waiting') status = 'loading';
  else if (result === 'error') status = 'error';
  else status = 'idle';
  ManagerWindow.send('auto-login:result', { profileId: profileId, result: result });
  ManagerWindow.send('auto-login:status', { profileId: profileId, status: status, result: result });
}

/**
 * Send window open/closed status to manager window.
 * @param {string} profileId
 * @param {boolean} isOpen
 */
function _sendWindowStatus(profileId, isOpen) {
  ManagerWindow.send('game-window:status', { profileId: profileId, open: isOpen });
}

/**
 * Clear pending timers from a lifecycle entry (autoLogin + failLoad).
 * @param {Object|null} entry
 */
function _clearEntryTimers(entry) {
  if (!entry) return;
  if (entry.autoLoginTimer) clearTimeout(entry.autoLoginTimer);
  if (entry.failLoadTimer) clearTimeout(entry.failLoadTimer);
}

/**
 * Attempt auto-login by injecting vault credentials into the page form.
 * Loop guard: max 5 form injection attempts per session.
 * @param {string} profileId
 * @param {Electron.BrowserWindow} win
 * @param {Object} entry - gameWindows Map entry (mutated for tracking)
 */
function _tryAutoLogin(profileId, win, entry) {
  if (!vault.hasCredentials(profileId)) return;
  if (!win || win.isDestroyed()) return;

  if (entry) {
    if (entry.formInjectAttempts > 5) {
      logger.debug(
        'Auto-login form: max attempts reached for ' +
          profileId +
          ' — stopping (possible redirect loop)'
      );
      return;
    }
  }

  const creds = vault.getCredentials(profileId);
  if (!creds || !creds.user || !creds.pass) return;

  const script = vault.buildAutoLoginScript(creds.user, creds.pass);
  win.webContents
    .executeJavaScript(script)
    .then(function (result) {
      // simplified return values — "filled" (form found + submitted),
      // "waiting" (MutationObserver watching async form), "not-found" (no form
      // on page — likely already logged in via cookie), "error:<msg>".
      if (result === 'filled') {
        logger.info('Auto-login: credentials injected for ' + profileId);
        if (entry) entry.formInjectAttempts = 0;
        _sendAutoLoginResult(profileId, 'filled');
      } else if (result === 'waiting') {
        logger.info('Auto-login: waiting for async form for ' + profileId);
        _sendAutoLoginResult(profileId, 'waiting');
      } else if (result === 'not-found') {
        logger.debug('Auto-login: form not found (already logged-in?) for ' + profileId);
        _sendAutoLoginResult(profileId, 'not-found');
      } else if (typeof result === 'string' && result.indexOf('error:') === 0) {
        logger.warn('Auto-login: script error for ' + profileId + ' — ' + result);
        _sendAutoLoginResult(profileId, 'error');
      } else {
        logger.debug('Auto-login: unexpected result for ' + profileId + ' — ' + result);
      }
    })
    .catch(function (e) {
      logger.debug('Auto-login failed (ok if already logged in via cookie): ' + e.message);
    });
}

/**
 * Attach all lifecycle handlers to a game window.
 * @param {Electron.BrowserWindow} win
 * @param {Object} ctx - { profileId, profile, entry, ses, onOpened, onClosed, getGameUrl, LAUNCHER_PARAMS }
 */
function attach(win, ctx) {
  const profileId = ctx.profileId;
  const profile = ctx.profile;
  const entry = ctx.entry;
  const ses = ctx.ses;
  const onOpened = ctx.onOpened;
  const onClosed = ctx.onClosed;
  const getGameUrl = ctx.getGameUrl;
  const LAUNCHER_PARAMS = ctx.LAUNCHER_PARAMS;
  // Auditor (optional — backward compatible with old tests/callers).
  // Phase 2: sessionStart/sessionEnd + recordCrash/recordReload/recordStall.
  const auditor = ctx.auditor || null;

  // ── StallDetector instance (auto-F5 when essential SWF fails) ──
  // Attached on did-finish-load, detached on close/reload.
  var _stallDetector = null;

  // ── CRASH ISOLATION + AUTO-RECOVERY ──
  // Backoff: max MAX_AUTO_RELOADS auto-reloads in CRASH_WINDOW_MS per profile (prevents crash loop).
  var CRASH_WINDOW_MS = 10 * 60 * 1000; // 10 min
  var MAX_AUTO_RELOADS = 3;
  var _crashTimestamps = [];
  win.webContents.on('render-process-gone', function (_e, details) {
    logger.error(
      'SessionLifecycle: render-process-gone in "' +
        profile.name +
        '" — reason=' +
        details.reason +
        ' exitCode=' +
        details.exitCode
    );
    try {
      const manager = require('../profiles/manager');
      manager.reportCrash(profileId);
    } catch (e) {
      logger.debug('render-process-gone: reportCrash(profile) failed: ' + e.message);
    }

    // Auto-recovery: reload if webContents still valid and within backoff.
    // Recoverable causes: oom, crashed, abnormal-exit (doesn't recover 'clean-exit').
    if (win.isDestroyed()) return;
    if (win.webContents.isDestroyed()) return;
    var reason = details && details.reason;
    if (reason === 'clean-exit' || reason === 'killed') return;

    var now = Date.now();
    _crashTimestamps = _crashTimestamps.filter(function (ts) {
      return now - ts < CRASH_WINDOW_MS;
    }); // CRASH_WINDOW_MS window
    if (_crashTimestamps.length >= MAX_AUTO_RELOADS) {
      logger.error(
        'SessionLifecycle: crash limit reached for "' + profile.name + '" — not reloading (loop)'
      );
      return;
    }
    _crashTimestamps.push(now);
    logger.info('SessionLifecycle: auto-reload in 1.5s for "' + profile.name + '"');
    if (auditor) {
      try {
        auditor.recordCrash(details && details.reason ? details.reason : 'unknown');
        auditor.recordReload();
      } catch (e) { logger.debug('auditor.recordCrash/Reload failed: ' + e.message); }
    }
    var reloadTimer = setTimeout(function () {
      if (win.isDestroyed() || win.webContents.isDestroyed()) return;
      try {
        win.webContents.reload();
      } catch (e) {
        logger.warn('SessionLifecycle: reload failed for "' + profile.name + '": ' + e.message);
      }
    }, 1500);
    if (reloadTimer.unref) reloadTimer.unref();
  });

  win.on('unresponsive', function () {
    logger.warn(
      'SessionLifecycle: window UNRESPONSIVE — "' + profile.name + '" (other accounts continue ok)'
    );
  });
  win.on('responsive', function () {
    logger.info('SessionLifecycle: window RESPONSIVE again — "' + profile.name + '"');
  });

  // ── Navigation handling ──
  win.webContents.on('will-navigate', function (e, url) {
    if (url.startsWith('data:')) return;
    try {
      const parsed = new URL(url);
      const isAsset = parsed.pathname.match(
        /\.(js|css|png|jpg|jpeg|gif|swf|json|xml|ico|svg|woff2?|mp3|mp4|flv|ogg|wav|webm|ttf|eot|otf|map|dat|bin|zip|gz)$/i
      );
      const isPage = !isAsset;
      const isGameHost = parsed.hostname.includes('naruto') || parsed.hostname.includes('oasgames');
      if (isGameHost && isPage && !parsed.search.includes('logintype')) {
        e.preventDefault();
        const sep = url.includes('?') ? '&' : '?';
        win.loadURL(url + sep + LAUNCHER_PARAMS);
      }
    } catch (e) {
      logger.debug('will-navigate: URL parse failed for ' + url);
    }
  });

  win.webContents.on('new-window', function (e, url) {
    e.preventDefault();
    if (url.includes('naruto') || url.includes('oasgames')) {
      win.loadURL(url);
    } else {
      try {
        const protocol = new URL(url).protocol;
        if (protocol === 'http:' || protocol === 'https:') {
          const { shell } = require('electron');
          shell.openExternal(url);
        }
      } catch (e) {
        logger.debug('new-window: invalid URL ignored — ' + url);
      }
    }
  });

  // ── On load: CSS injection + FB mock + AUTO-LOGIN ──
  win.webContents.on('did-finish-load', function () {
    if (entry) entry.failLoadRetry = false;
    ses.cookies.flushStore().catch(function () {});

    // ── CPU optimization (cross-platform) ──
    // Applied here (not in ready-to-show) because getOSProcessId() only returns
    // a valid value after the renderer process spawn — which happens on loadURL.
    // LINUX: taskset (affinity) + renice (priority) + oom_score_adj (OOM protection).
    // WINDOWS: PowerShell (affinity) + os.setPriority (priority).
    // macOS: no-op.
    try {
      const cpuOptimizer = require('./CpuOptimizer');
      const { loadConfig } = require('../config/settings');
      const cfg = loadConfig();
      const rendererPid = win.webContents.getOSProcessId();
      if (rendererPid > 0) {
        cpuOptimizer
          .optimizeRenderer(rendererPid, {
            preset: cfg.optimizationPreset || 'balanced'
          })
          .catch(function (e) {
            logger.debug('CpuOptimizer: failed (non-fatal) — ' + e.message);
          });
      }
    } catch (e) {
      logger.debug('CpuOptimizer: skip — ' + e.message);
    }

    // LAYER 1: light cleanup (ads, cookies, popups, game site clutter)
    // Uses executeJavaScript with idempotency guard — insertCSS() adds
    // um novo <style> a CADA chamada (incluindo sub-frame loads do Flash),
    // accumulating duplicate styles. With the guard, injects exactly once.
    win.webContents
      .executeJavaScript(
        '(function(){' +
          'if(document.getElementById("__shinobi-adblock"))return "already";' +
          'var s=document.createElement("style");' +
          's.id="__shinobi-adblock";' +
          's.textContent=' +
          '"' +
          '.ad,.ads,.banner,.ad-banner,.ad-container,[class*=advertisement],[id*=advertisement]{display:none!important}' +
          '.cookie-notice,.cookie-banner,#cookieConsent,.gdpr-banner{display:none!important}' +
          '.support-link,.help-link,.external-link,.social-share,.share-buttons{display:none!important}' +
          '#flash_guide_main_panel,#fb_like_tag,#preload_element{display:none!important}' +
          'iframe[name=conversion_code],iframe[name=adtrace]{display:none!important;width:0!important;height:0!important}' +
          '";' +
          '(document.head||document.documentElement).appendChild(s);' +
          'return "injected";' +
          '})()'
      )
      .catch(function () {});

    // LAYER 2: clean fullscreen — hides header/footer/sidebars and makes
    // #oas-player to fill the window (immersive game-only experience).
    //
    // Uses MutationObserver + polling (same robust pattern as auto-login)
    // instead of a single check on did-finish-load. Naruto Online loads the
    // embed #oas-player ASYNC via JS — no did-finish-load ele geralmente ainda
    // doesn't exist in the DOM, so the single check failed and the CSS didn't inject.
    // Result: the top bar sometimes disappeared (on a sub-navigation where #oas-player
    // already existed) and sometimes stayed visible — inconsistent. Now the observer
    // detects #oas-player as soon as it appears and injects CSS reliably.
    win.webContents
      .executeJavaScript(
        '(function(){' +
          '  if (window.__shinobiFsInjected) return "already";' +
          '  window.__shinobiFsInjected = true;' +
          '  var css = ' +
          '    "html, body { margin:0 !important; padding:0 !important; overflow:hidden !important; width:100% !important; height:100% !important; background:#000 !important; }" +' +
          '    "#oas-bar, .oas-bar, #oas-bar-hide, .header, .header-wrap, .site-header, .top-bar, .topbar { display:none !important; height:0 !important; min-height:0 !important; }" +' +
          '    "footer, .footer, .site-footer, .footer-wrap, #footer { display:none !important; height:0 !important; }" +' +
          '    ".sidebar, .left-sidebar, .right-sidebar, .nav-sidebar { display:none !important; }" +' +
          '    "#oas-player { position:fixed !important; top:0 !important; left:0 !important; width:100vw !important; height:100vh !important; margin:0 !important; }" +' +
          '    "#oas-player iframe { width:100% !important; height:100% !important; }";' +
          '  function apply(){' +
          '    if (window.__shinobiFsApplied) return true;' +
          '    var flashEl = document.querySelector("#oas-player iframe, #oas-player embed, #oas-player object");' +
          '    var player = document.querySelector("#oas-player");' +
          '    if (!flashEl && !player) return false;' +
          '    var s = document.createElement("style");' +
          '    s.setAttribute("data-shinobi","fullscreen");' +
          '    s.textContent = css;' +
          '    (document.head||document.documentElement).appendChild(s);' +
          '    window.__shinobiFsApplied = true;' +
          '    return true;' +
          '  }' +
          '  if (apply()) return "applied";' +
          '  var attempts = 0, maxAttempts = 120;' + // ~30s @ 250ms
          '  var obs = new MutationObserver(function(){' +
          '    if (apply()) { obs.disconnect(); try{clearInterval(poll);}catch(e){} }' +
          '  });' +
          '  obs.observe(document.documentElement||document.body,{childList:true,subtree:true});' +
          '  var poll = setInterval(function(){' +
          '    attempts++;' +
          '    if (apply()) { clearInterval(poll); obs.disconnect(); return; }' +
          '    if (attempts >= maxAttempts) { clearInterval(poll); obs.disconnect(); }' +
          '  }, 250);' +
          '  return "observing";' +
          '})()'
      )
      .then(function (result) {
        if (result === 'applied') {
          logger.info('Fullscreen CSS applied immediately — ' + profile.name);
        } else if (result === 'observing') {
          logger.info(
            'Fullscreen CSS: waiting for #oas-player (MutationObserver) — ' + profile.name
          );
        }
      })
      .catch(function () {});

    // Mock FB object — fallback if real SDK doesn't load
    win.webContents
      .executeJavaScript(
        'if (typeof window.FB === "undefined") {' +
          '  window.FB = { init: function(){}, login: function(c){c({status:"unknown"});}, getLoginStatus: function(c){c({status:"unknown"});}, api: function(){}, Event: { subscribe: function(){}, unsubscribe: function(){} }, Canvas: { setAutoGrow: function(){} }, AppEvents: { activateApp: function(){}, logEvent: function(){}, logPageView: function(){}, logPurchase: function(){} }, getUserID: function(){return null;}, getAccessToken: function(){return null;} };' +
          '  window.fbAsyncInit = function(){};' +
          '}'
      )
      .catch(function () {});

    _tryAutoLogin(profileId, win, entry);

    // ── StallDetector: auto-F5 when essential SWF fails ──
    // Monitors webRequest.onCompleted + onErrorOccurred. If 2+ SWFs fail
    // in 60s, or 45s without network activity during loading → trigger
    // reloadWithPreAuth (same flow as F5: clear + pre-auth via API).
    // Backoff: max 3 auto-reloads in 10 min. Auto-stop after 120s of activity.
    if (_stallDetector) {
      try {
        _stallDetector.detach();
      } catch (_) {
        /* ignore */
      }
      _stallDetector = null;
    }
    _stallDetector = StallDetector.attach(win, ses, {
      profileName: profile.name,
      onStall: function () {
        if (win.isDestroyed()) return;
        logger.info('StallDetector triggered auto-F5 (pre-auth) — "' + profile.name + '"');
        if (auditor) {
          try { auditor.recordStall('swf-stall'); } catch (e) { logger.debug('auditor.recordStall failed: ' + e.message); }
        }
        reloadWithPreAuth(profileId, profile, win, ses, getGameUrl);
      }
    });
    _windowStallDetectors.set(win, _stallDetector);
    // Releases the reload guard now that the new StallDetector is active.
    // (The guard was added in reloadWithPreAuth before loadURL.)
    _reloadingWindows.delete(win.id);
  });

  // ── did-fail-load: retry 1x + friendly error page ──
  win.webContents.on('did-fail-load', function (_e, code, desc, url) {
    if (url.startsWith('data:')) return;
    if (code === -3) return; // ERR_ABORTED

    const alreadyRetried = entry && entry.failLoadRetry;
    if (!alreadyRetried) {
      logger.warn(
        'Load failure (' +
          profile.name +
          '): ' +
          code +
          ' ' +
          desc +
          ' — retrying...'
      );
      if (entry) entry.failLoadRetry = true;
      if (entry) {
        entry.failLoadTimer = setTimeout(function () {
          entry.failLoadTimer = null;
          if (win && !win.isDestroyed()) {
            win.loadURL(getGameUrl(profile));
          }
        }, 1500);
        if (entry.failLoadTimer.unref) entry.failLoadTimer.unref();
      }
    } else {
      logger.error(
        'Load failure (' +
          profile.name +
          '): ' +
          code +
          ' ' +
          desc +
          ' — retry exhausted, showing error page'
      );
      const safeDesc = String(desc)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const safeCode = String(code)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const gameUrl = getGameUrl(profile);
      const safeUrl = gameUrl.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
      win.webContents.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<html><head><meta charset="utf-8"></head><body style="background:#0f0f14;color:#fff;display:flex;' +
              'align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;flex-direction:column">' +
              '<div style="font-size:48px;margin-bottom:16px">⚠️</div>' +
              '<h2 style="color:#DC2626">Connection failure</h2>' +
              '<p style="color:#8a8a96;margin:10px 0;font-size:13px">Error: ' +
              safeDesc +
              ' (' +
              safeCode +
              ')</p>' +
              '<p style="color:#5a5a68;font-size:11px;margin-bottom:20px">Profile: ' +
              profile.name +
              '</p>' +
              '<button onclick="location.href=\'' +
              safeUrl +
              '\'" ' +
              'style="padding:10px 24px;background:linear-gradient(135deg,#DC2626,#7a1414);color:#fff;' +
              'border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">' +
              '🔄 Try Again</button>' +
              '</body></html>'
          )
      );
    }
  });

  // ── KILL SWITCH GRACEFUL ──
  let _isForceClosing = false;
  let _renewTimer = null;
  win.on('close', function (e) {
    // If app is quitting (before-quit), skip graceful cleanup —
    // Electron destroys windows on its own. With N windows open,
    // the 500ms delay per window unnecessarily delays shutdown.
    try {
      if (require('../main').isQuitting()) return;
    } catch (_) {
      // main not available (tests) — proceeds with graceful
    }
    e.preventDefault();
    if (_isForceClosing) return;
    _isForceClosing = true;

    logger.info('Kill switch: closing ' + profile.name + ' (graceful + fallback destroy)');

    if (entry) {
      _clearEntryTimers(entry);
    }
    // StallDetector cleanup (remove webRequest listeners + interval)
    if (_stallDetector) {
      try {
        _stallDetector.detach();
      } catch (_) {
        /* ignore */
      }
      _stallDetector = null;
    }
    // JWT auto-renewal timer cleanup (recursive setTimeout)
    if (_renewTimer) {
      clearTimeout(_renewTimer);
      _renewTimer = null;
    }

    try {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.stop();
        win.webContents
          .executeJavaScript(
            'document.querySelectorAll("embed,object").forEach(function(e){e.remove();});'
          )
          .catch(function () {
            /* ignore */
          });
      }
    } catch (_) {
      /* ignore */
    }

    const t = setTimeout(function () {
      try {
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
      } catch (_) {
        /* ignore */
      }
    }, 500);
    if (typeof t.unref === 'function') t.unref();
  });

  // ── Closed → cleanup final ──
  win.on('closed', function () {
    _clearEntryTimers(entry);
    // Clean up reload race guard for this window
    _reloadingWindows.delete(win.id);
    _windowStallDetectors.delete(win);
    // gameWindows.delete is the responsibility of Launcher (which owns the Map)
    _sendWindowStatus(profileId, false);
    logger.info('Profile closed: ' + profile.name);
    if (onClosed) onClosed();
  });

  // ── ready-to-show: show + load game URL ──
  win.once('ready-to-show', function () {
    win.show();
    _sendWindowStatus(profileId, true);
    if (auditor) {
      try { auditor.sessionStart(); } catch (e) { logger.debug('auditor.sessionStart failed: ' + e.message); }
    }
    if (onOpened) onOpened();
    setImmediate(function () {
      _loadGameWithPreAuth(profileId, profile, win, ses, getGameUrl);
    });
  });

  // ── JWT auto-renewal (inherited task, Phase 3g) ──
  // Every 30 min, if the profile has credentials in the vault, checks if the JWT is
  // about to expire (threshold 5 min) and renews via api-login. The Naruto Online
  // JWT expires in 2h; without renewal, the session drops and auto-login
  // via form injection takes over — but renewing avoids this interruption.
  //
  // Uses recursive setTimeout (not setInterval) to apply exponential backoff
  // REAL: if renewal fails N consecutive times, the next delay doubles
  // (30min → 1h → 2h → 2h cap). Resets on next success.
  //
  // Added exponential backoff.
  // Fix — backoff is now APPLIED to scheduling (previously was only
  // calculated in the log, setInterval kept 30min fixed).
  var _renewConsecutiveFailures = 0;
  var _renewBaseIntervalMs = 30 * 60 * 1000; // 30 min base

  function _scheduleJwtRenewal(delayMs) {
    _renewTimer = setTimeout(function () {
      _renewTimer = null;
      if (win.isDestroyed()) return;
      if (!vault.hasCredentials(profileId)) {
        _scheduleJwtRenewal(_renewBaseIntervalMs);
        return;
      }
      var creds = vault.getCredentials(profileId);
      if (!creds || !creds.user || !creds.pass) {
        _scheduleJwtRenewal(_renewBaseIntervalMs);
        return;
      }
      try {
        var apiLogin = require('../network/api-login');
        apiLogin
          .renewIfNeeded(ses, creds.user, creds.pass, 300)
          .then(function (r) {
            if (r.renewed) {
              _renewConsecutiveFailures = 0;
              logger.info(
                'JWT auto-renewed for "' +
                  profile.name +
                  '" (new expires in ' +
                  Math.round(r.expiresAt / 1000 - Date.now() / 1000) +
                  's)'
              );
            }
            // Success or not-renewed (JWT still valid) → resets delay
            _scheduleJwtRenewal(_renewBaseIntervalMs);
          })
          .catch(function (e) {
            _renewConsecutiveFailures++;
            var backoffMs = Math.min(
              _renewBaseIntervalMs * Math.pow(2, Math.min(_renewConsecutiveFailures - 1, 3)),
              2 * 60 * 60 * 1000 // max 2h
            );
            if (_renewConsecutiveFailures <= 2) {
              logger.debug(
                'JWT auto-renewal failed (' +
                  _renewConsecutiveFailures +
                  'x, next in ' +
                  Math.round(backoffMs / 60000) +
                  'min): ' +
                  e.message
              );
            } else {
              logger.warn(
                'JWT auto-renewal failed ' +
                  _renewConsecutiveFailures +
                  'x consecutively — backoff ' +
                  Math.round(backoffMs / 60000) +
                  'min (server may be down)'
              );
            }
            // Apply REAL backoff to scheduling
            _scheduleJwtRenewal(backoffMs);
          });
      } catch (e) {
        logger.debug('JWT auto-renewal skip: ' + e.message);
        _scheduleJwtRenewal(_renewBaseIntervalMs);
      }
    }, delayMs);
    if (_renewTimer.unref) _renewTimer.unref();
  }
  _scheduleJwtRenewal(_renewBaseIntervalMs);
}

/**
 * Reloads the game page with pre-authentication (same flow as Play).
 *
 * Unlike a raw reload, this method:
 *   1. Clears cookies + localStorage + sessionStorage + cache from the partition
 *   2. Pre-authenticates via apiLogin.loginAndInject() BEFORE reloading
 *      → the oas_user cookie comes already set → server redirects straight to the game,
 *        without showing the Naruto Online login screen (email would be visible).
 *
 * If the profile does NOT have credentials in the vault, does just a direct reload (no way to
 * pre-authenticate). If apiLogin fails, falls back to simple loadURL (the
 * form-injection auto-login via did-finish-load handles the login after that).
 *
 * ANTI-RACE: if a reload is already in progress for this window, ignores.
 * Prevents rapid multiple F5 from causing concurrent clearStorageData + double loadURL.
 *
 * @param {string} profileId
 * @param {Object} profile
 * @param {Electron.BrowserWindow} win
 * @param {Electron.Session} ses
 * @param {Function} getGameUrl
 * @returns {Promise<void>}
 */
var _reloadingWindows = new Set();
// Module-level WeakMap: BrowserWindow -> StallDetector instance.
// Allows reloadWithPreAuth (module-level) to detach the detector before reload,
// without needing _stallDetector to be in scope (it lives inside attach()).
var _windowStallDetectors = new WeakMap();

function reloadWithPreAuth(profileId, profile, win, ses, getGameUrl) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  if (win.webContents.isDestroyed()) return Promise.resolve();
  if (!ses) {
    // No session: nothing to clear, just reloads.
    if (!win.webContents.isDestroyed()) {
      win.webContents.reload();
    }
    return Promise.resolve();
  }

  // Anti-race: if a reload is already in progress for this window, skip.
  var winId = win.id;
  if (_reloadingWindows.has(winId)) {
    logger.debug('F5 reloadWithPreAuth: reload already in progress (win ' + winId + ') — skip');
    return Promise.resolve();
  }
  _reloadingWindows.add(winId);

  // P2 FIX: detaches StallDetector BEFORE reload. The old guard released
  // after a fixed 3s, but did-finish-load (which creates a new StallDetector) can
  // take longer than 3s on slow connections. Result: the old StallDetector
  // detected "inactivity" during reload and triggered a second reload
  // concorrente → loop de reloads.
  var sd = _windowStallDetectors.get(win);
  if (sd) {
    try {
      sd.detach();
    } catch (_) {
      /* ignore */
    }
    _windowStallDetectors.delete(win);
  }

  logger.info('F5 reloadWithPreAuth: clearing login + pre-authenticating "' + profile.name + '"');

  // Clears onbeforeunload/onunload beforehand (same as the old reload did).
  var clearJs = win.webContents
    .executeJavaScript('window.onbeforeunload = null; window.onunload = null;')
    .catch(function () {});

  var clearStorage = ses.clearStorageData({
    storages: ['cookies', 'localstorage', 'sessionstorage']
  });
  var clearCache = ses.clearCache();

  return Promise.all([clearJs, clearStorage, clearCache])
    .then(function () {
      if (win.isDestroyed()) {
        _reloadingWindows.delete(winId);
        return;
      }
      logger.info('F5 reloadWithPreAuth: login cleared, pre-authenticating — ' + profile.name);
      // Reuses the SAME Play flow (apiLogin.loginAndInject before loadURL).
      _loadGameWithPreAuth(profileId, profile, win, ses, getGameUrl);
      // The _reloadingWindows guard is released in did-finish-load (after the new
      // StallDetector is attached). 30s safety timeout as fallback
      // in case did-finish-load never fires (window destroyed, etc).
      const t = setTimeout(function () {
        _reloadingWindows.delete(winId);
      }, 30000);
      if (typeof t.unref === 'function') t.unref();
    })
    .catch(function (e) {
      _reloadingWindows.delete(winId);
      if (win.isDestroyed()) return;
      logger.warn('F5 reloadWithPreAuth: failed to clear — fallback direct reload: ' + e.message);
      // Reset of entry formInjectAttempts is not needed here (did-finish-load handles it).
      win.webContents.reload();
    });
}

module.exports = {
  attach: attach,
  reloadWithPreAuth: reloadWithPreAuth
};
