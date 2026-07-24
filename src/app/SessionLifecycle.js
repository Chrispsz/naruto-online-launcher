/**
 * app/SessionLifecycle.js — Hooks de lifecycle da janela de jogo (Fase 3d split)
 *
 * Responsabilidade ÚNICA (SRP): anexar handlers de evento (did-finish-load,
 * did-fail-load, render-process-gone, unresponsive, will-navigate, new-window,
 * close, closed, ready-to-show) a uma BrowserWindow de jogo. Inclui CSS
 * injection, FB mock, e auto-login via vault.
 *
 * Histórico: era inline no God Object game-launcher.js (620 linhas). Extraído
 * para isolar o lifecycle do launch/orchestration.
 */

'use strict';

const logger = require('../utils/logger');
const vault = require('../profiles/vault');
const ManagerWindow = require('../ui/manager/ManagerWindow');
const StallDetector = require('./StallDetector');

/**
 * Carrega a página do jogo com pré-autenticação via API quando possível.
 * Se o perfil tem credenciais no vault, chama apiLogin.loginAndInject() ANTES
 * de loadURL — assim o cookie oas_user já está setado e o servidor redireciona
 * direto pro jogo, sem mostrar a tela de login do Naruto Online.
 * Fallback: se API login falha, carrega a URL normalmente (form-injection auto-login
 * via MutationObserver cuida do login depois).
 */
function _loadGameWithPreAuth(profileId, profile, win, ses, getGameUrl) {
  var url = getGameUrl(profile);

  if (vault.hasCredentials(profileId)) {
    var creds = vault.getCredentials(profileId);
    if (creds && creds.user && creds.pass) {
      var apiLogin = require('../network/api-login');
      logger.info('Login direto via API para "' + profile.name + '" (cookie pre-injected)');
      apiLogin
        .loginAndInject(ses, creds.user, creds.pass)
        .then(function () {
          if (win.isDestroyed()) return;
          win.loadURL(url);
        })
        .catch(function (e) {
          if (win.isDestroyed()) return;
          logger.warn(
            'Login via API falhou para "' +
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
 * Envia resultado do auto-login ao manager window (UI feedback).
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
 * Envia status de janela aberta/fechada ao manager window.
 * @param {string} profileId
 * @param {boolean} isOpen
 */
function _sendWindowStatus(profileId, isOpen) {
  ManagerWindow.send('game-window:status', { profileId: profileId, open: isOpen });
}

/**
 * Limpa timers pendentes de um entry de lifecycle (autoLogin + failLoad).
 * @param {Object|null} entry
 */
function _clearEntryTimers(entry) {
  if (!entry) return;
  if (entry.autoLoginTimer) clearTimeout(entry.autoLoginTimer);
  if (entry.failLoadTimer) clearTimeout(entry.failLoadTimer);
}

/**
 * Tenta auto-login injetando credenciais do vault no form da página.
 * Loop guard: max 5 tentativas de form injection por sessão.
 * @param {string} profileId
 * @param {Electron.BrowserWindow} win
 * @param {Object} entry - entrada do gameWindows Map (mutada para tracking)
 */
function _tryAutoLogin(profileId, win, entry) {
  if (!vault.hasCredentials(profileId)) return;
  if (!win || win.isDestroyed()) return;

  if (entry) {
    if (entry.formInjectAttempts > 5) {
      logger.debug(
        'Auto-login form: max attempts atingido para ' +
          profileId +
          ' — parando (possível loop de redirect)'
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
 * Anexa todos os handlers de lifecycle a uma janela de jogo.
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
  // Auditor (opcional — backward compatible com testes/callers antigos).
  // Phase 2: sessionStart/sessionEnd + recordCrash/recordReload/recordStall.
  const auditor = ctx.auditor || null;

  // ── StallDetector instance (auto-F5 quando SWF essencial falha) ──
  // Anexado em did-finish-load, desanexado em close/reload.
  var _stallDetector = null;

  // ── ISOLAMENTO DE CRASH + AUTO-RECOVERY ──
  // Backoff: max 3 auto-reloads em 10 min por perfil (evita crash loop).
  var _crashTimestamps = [];
  win.webContents.on('render-process-gone', function (_e, details) {
    logger.error(
      'SessionLifecycle: render-process-gone em "' +
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

    // Auto-recovery: reload se webContents ainda válido e dentro do backoff.
    // Causas recuperáveis: oom, crashed, abnormal-exit (não recupera 'clean-exit').
    if (win.isDestroyed()) return;
    if (win.webContents.isDestroyed()) return;
    var reason = details && details.reason;
    if (reason === 'clean-exit' || reason === 'killed') return;

    var now = Date.now();
    _crashTimestamps = _crashTimestamps.filter(function (ts) {
      return now - ts < 600000;
    }); // janela de 10 min
    if (_crashTimestamps.length >= 3) {
      logger.error(
        'SessionLifecycle: crash limit atingido para "' + profile.name + '" — não recarrega (loop)'
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
      'SessionLifecycle: janela UNRESPONSIVE — "' + profile.name + '" (outras contas continuam ok)'
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

    // ── v5.0.0: CPU optimization (cross-platform) ──
    // Aplicado aqui (e não no ready-to-show) porque getOSProcessId() só retorna
    // valor válido após o renderer process spawn — que acontece no loadURL.
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

    // CAMADA 1: limpeza leve (ads, cookies, popups, poluição do site do jogo)
    // Usa executeJavaScript com guard de idempotência — insertCSS() adiciona
    // um novo <style> a CADA chamada (incluindo sub-frame loads do Flash),
    // acumulando estilos duplicados. Com o guard, injeta exatamente uma vez.
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

    // CAMADA 2: fullscreen limpo — esconde header/footer/sidebars do site e faz
    // o #oas-player preencher a janela (experiência imersiva só do jogo).
    //
    // Usa MutationObserver + polling (mesmo padrão robusto do auto-login)
    // em vez de um check único no did-finish-load. O Naruto Online carrega o
    // embed #oas-player ASYNC via JS — no did-finish-load ele geralmente ainda
    // não existe no DOM, então o check único falhava e o CSS não injetava.
    // Resultado: a top bar às vezes sumia (numa sub-navegação onde #oas-player
    // já existia) e às vezes ficava visível — inconsistente. Agora o observer
    // detecta #oas-player assim que ele aparece e injeta o CSS de forma confiável.
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
            'Fullscreen CSS: aguardando #oas-player (MutationObserver) — ' + profile.name
          );
        }
      })
      .catch(function () {});

    // Mock FB object — fallback se SDK real não carrega
    win.webContents
      .executeJavaScript(
        'if (typeof window.FB === "undefined") {' +
          '  window.FB = { init: function(){}, login: function(c){c({status:"unknown"});}, getLoginStatus: function(c){c({status:"unknown"});}, api: function(){}, Event: { subscribe: function(){}, unsubscribe: function(){} }, Canvas: { setAutoGrow: function(){} }, AppEvents: { activateApp: function(){}, logEvent: function(){}, logPageView: function(){}, logPurchase: function(){} }, getUserID: function(){return null;}, getAccessToken: function(){return null;} };' +
          '  window.fbAsyncInit = function(){};' +
          '}'
      )
      .catch(function () {});

    _tryAutoLogin(profileId, win, entry);

    // ── StallDetector: auto-F5 quando SWF essencial falha (v5.9.11) ──
    // Monitora webRequest.onCompleted + onErrorOccurred. Se 2+ SWFs falham
    // em 60s, ou 45s sem atividade de rede durante o loading → trigger
    // reloadWithPreAuth (mesmo fluxo do F5: limpa + pré-auth via API).
    // Backoff: max 3 auto-reloads em 10 min. Auto-stop após 120s de atividade.
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
    // Libera o guard de reload agora que o novo StallDetector está ativo.
    // (O guard foi adicionado em reloadWithPreAuth antes do loadURL.)
    _reloadingWindows.delete(win.id);
  });

  // ── did-fail-load: retry 1x + tela de erro amigável ──
  win.webContents.on('did-fail-load', function (_e, code, desc, url) {
    if (url.startsWith('data:')) return;
    if (code === -3) return; // ERR_ABORTED

    const alreadyRetried = entry && entry.failLoadRetry;
    if (!alreadyRetried) {
      logger.warn(
        'Falha ao carregar (' +
          profile.name +
          '): ' +
          code +
          ' ' +
          desc +
          ' — tentando novamente...'
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
        'Falha ao carregar (' +
          profile.name +
          '): ' +
          code +
          ' ' +
          desc +
          ' — retry esgotado, exibindo tela de erro'
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
              '<h2 style="color:#DC2626">Falha na conexão</h2>' +
              '<p style="color:#8a8a96;margin:10px 0;font-size:13px">Erro: ' +
              safeDesc +
              ' (' +
              safeCode +
              ')</p>' +
              '<p style="color:#5a5a68;font-size:11px;margin-bottom:20px">Perfil: ' +
              profile.name +
              '</p>' +
              '<button onclick="location.href=\'' +
              safeUrl +
              '\'" ' +
              'style="padding:10px 24px;background:linear-gradient(135deg,#DC2626,#7a1414);color:#fff;' +
              'border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">' +
              '🔄 Tentar Novamente</button>' +
              '</body></html>'
          )
      );
    }
  });

  // ── KILL SWITCH GRACEFUL ──
  let _isForceClosing = false;
  let _renewTimer = null;
  win.on('close', function (e) {
    // Se o app está fechando (before-quit), pula graceful cleanup —
    // Electron destrói as janelas sozinho. Com N janelas abertas,
    // o delay de 500ms por janela atrasa o shutdown desnecessariamente.
    try {
      if (require('../main').isQuitting()) return;
    } catch (_) {
      // main não disponível (testes) — prossegue com graceful
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
    // JWT auto-renewal timer cleanup (setTimeout recursivo)
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
    // gameWindows.delete é responsabilidade do Launcher (que possui o Map)
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

  // ── JWT auto-renewal (pendência herdada, Fase 3g) ──
  // A cada 30 min, se o perfil tem credenciais no vault, checa se o JWT está
  // próximo de expirar (threshold 5 min) e renova via api-login. O JWT do
  // Naruto Online expira em 2h; sem renovação, a sessão cai e o auto-login
  // via form injection reassume — mas renovar evita essa interrupção.
  //
  // Usa setTimeout recursivo (não setInterval) para aplicar backoff exponencial
  // REAL: se a renovação falha N vezes consecutivas, o próximo delay dobra
  // (30min → 1h → 2h → 2h cap). Reseta no próximo sucesso.
  //
  // Adicionado backoff exponencial.
  // Fix — backoff agora é APLICADO no agendamento (antes era calculado
  // apenas no log, setInterval mantinha 30min fixo).
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
                'JWT auto-renovado para "' +
                  profile.name +
                  '" (novo expira em ' +
                  Math.round(r.expiresAt / 1000 - Date.now() / 1000) +
                  's)'
              );
            }
            // Sucesso ou não-renovado (JWT ainda válido) → reseta delay
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
                'JWT auto-renewal falhou (' +
                  _renewConsecutiveFailures +
                  'x, próximo em ' +
                  Math.round(backoffMs / 60000) +
                  'min): ' +
                  e.message
              );
            } else {
              logger.warn(
                'JWT auto-renewal falhou ' +
                  _renewConsecutiveFailures +
                  'x consecutivas — backoff ' +
                  Math.round(backoffMs / 60000) +
                  'min (servidor pode estar fora do ar)'
              );
            }
            // Aplica backoff REAL no agendamento
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
 * Recarrega a página do jogo com pré-autenticação (igual ao fluxo do Play).
 *
 * Diferente de um reload cru, este método:
 *   1. Limpa cookies + localStorage + sessionStorage + cache da partition
 *   2. Pré-autentica via apiLogin.loginAndInject() ANTES de recarregar
 *      → o cookie oas_user já vem setado → servidor redireciona direto pro jogo,
 *        sem mostrar a tela de login do Naruto Online (email ficaria visível).
 *
 * Se o perfil NÃO tem credenciais no vault, faz só o reload direto (não há como
 * pré-autenticar). Se o apiLogin falha, faz fallback pro loadURL simples (o
 * form-injection auto-login via did-finish-load cuida do login depois).
 *
 * ANTI-RACE: se já existe um reload em andamento para esta janela, ignora.
 * Evita que F5 múltiplo rápido cause clearStorageData concorrente + loadURL duplo.
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
// Permite reloadWithPreAuth (module-level) desanexar o detector antes do reload,
// sem precisar que _stallDetector esteja no escopo (ele vive dentro attach()).
var _windowStallDetectors = new WeakMap();

function reloadWithPreAuth(profileId, profile, win, ses, getGameUrl) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  if (win.webContents.isDestroyed()) return Promise.resolve();
  if (!ses) {
    // Sem session: não há o que limpar, só recarrega.
    if (!win.webContents.isDestroyed()) {
      win.webContents.reload();
    }
    return Promise.resolve();
  }

  // Anti-race: se já tem um reload em andamento pra esta janela, skip.
  var winId = win.id;
  if (_reloadingWindows.has(winId)) {
    logger.debug('F5 reloadWithPreAuth: reload already in progress (win ' + winId + ') — skip');
    return Promise.resolve();
  }
  _reloadingWindows.add(winId);

  // P2 FIX: desanexa StallDetector ANTES do reload. O antigo guard liberava
  // após 3s fixo, mas did-finish-load (que cria um novo StallDetector) pode
  // demorar mais que 3s em conexões lentas. Resultado: o StallDetector antigo
  // detectava "inatividade" durante o reload e disparava um segundo reload
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

  // Limpa onbeforeunload/onunload antes (igual ao reload antigo fazia).
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
      // Reutiliza o MESMO fluxo do Play (apiLogin.loginAndInject antes de loadURL).
      _loadGameWithPreAuth(profileId, profile, win, ses, getGameUrl);
      // O guard _reloadingWindows é liberado em did-finish-load (após o novo
      // StallDetector ser anexado). Timeout de segurança de 30s como fallback
      // caso did-finish-load nunca dispare (janela destruída, etc).
      const t = setTimeout(function () {
        _reloadingWindows.delete(winId);
      }, 30000);
      if (typeof t.unref === 'function') t.unref();
    })
    .catch(function (e) {
      _reloadingWindows.delete(winId);
      if (win.isDestroyed()) return;
      logger.warn('F5 reloadWithPreAuth: failed to clear — fallback direct reload: ' + e.message);
      // Reset do entry formInjectAttempts não é necessário aqui (did-finish-load cuida).
      win.webContents.reload();
    });
}

module.exports = {
  attach: attach,
  reloadWithPreAuth: reloadWithPreAuth,
  // expostos p/ testes
  _sendWindowStatus: _sendWindowStatus,
  _sendAutoLoginResult: _sendAutoLoginResult,
  _loadGameWithPreAuth: _loadGameWithPreAuth
};
