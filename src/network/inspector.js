/**
 * Network Inspector — captura dados do jogo via webRequest
 * v1.0.0 — v4.9: dev-mode network inspector (alternativa ao DevTools bloqueado)
 *
 * O jogo Naruto Online roda em Flash (PPAPI). Os dados do personagem (stats,
 * itens, party, etc.) NÃO estão no DOM — estão nas respostas HTTP que o SWF
 * faz. A única forma de capturar esses dados é interceptar via
 * session.webRequest.onBeforeRequest / onResponseStarted.
 *
 * Este módulo registra listeners na session do perfil e captura:
 *   - URLs chamadas (com método, tipo, timestamp)
 *   - Cookies oas_user capturados (JWT decodificado)
 *   - Endpoints conhecidos (passport, odp3, game backend)
 *   - Estatísticas agregadas (requests/min, domains hit, etc.)
 *
 * O DevTools (Ctrl+Shift+I) é bloqueado no jogo por segurança. Este inspector
 * é a alternativa legítima pra desenvolvedores analisarem o tráfego.
 */

'use strict';

const logger = require('../utils/logger');
const jwt = require('../utils/jwt');

// Endpoints interessantes pra classificar capturas
// adicionados endpoints do fluxo de login observados no F12:
//   - ScriptLoginManager-1.2.php (login manager JS com params criptografados)
//   - Scriptpad-zeropadding.js (crypto padding library pro form de login)
//   - query_svr_info.fcgi (XHR que busca info do servidor por svr_id)
// Esses 3 endpoints aparecem no tráfego normal do jogo mesmo com pre-auth
// via API (oas_user cookie). O ScriptLoginManager é carregado pela página
// do jogo pra validação de sessão — NÃO é bug se aparece com status 200.
var KNOWN_ENDPOINTS = {
  'passport.oasgames.com': { type: 'auth', label: 'Passport (login/register)' },
  'odp3.oasgames.com': { type: 'api', label: 'Odp3 API (servers/profile)' },
  'naruto-pl.oasgames.com': { type: 'game', label: 'PL game backend (HTTP!)' },
  'naruto.narutowebgame.com': { type: 'site', label: 'Naruto site' },
  'narutowebgame.com': { type: 'site', label: 'Naruto site' },
  'oasgames.com': { type: 'parent', label: 'oasgames parent' }
};

// Path signatures para classificar requisições por nome de arquivo
// quando o hostname já é conhecido mas o path identifica a função específica.
// Útil pra distinguir login flow vs game API vs telemetry no inspector log.
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
 * Cria um inspector pra uma session do Electron.
 * @param {Object} session — session.fromPartition(partName)
 * @param {string} profileId
 * @returns {Object} inspector instance
 */
function create(session, profileId) {
  var entries = []; // últimas N capturas
  var stats = {
    // agregados
    totalRequests: 0,
    byDomain: {},
    // adicionado tipo 'telemetry' (oss_report.fcgi, crossdomain.xml)
    byType: { auth: 0, api: 0, game: 0, site: 0, parent: 0, telemetry: 0, other: 0 },
    capturedCookies: [],
    capturedJwts: [],
    startedAt: Date.now()
  };
  var maxEntries = 500;
  var listeners = { onCapture: [] };
  var enabled = false;
  // Filtro usado no enable() — necessário pra removable preciso no disable().
  // Sem filtro, onBeforeRequest(null) remove TODOS os listeners da session
  // (incluindo o ad blocker), não só os nossos. Mesmo padrão do StallDetector.
  var _filter = { urls: ['<all_urls>'] };

  /**
   * Classifica uma URL nos tipos conhecidos.
   * v5.9.10: agora também checa KNOWN_PATH_SIGNATURES pra classificar
   * por nome de arquivo (ScriptLoginManager, query_svr_info, etc.) —
   * mais específico que só o hostname.
   */
  function classify(url) {
    try {
      var u = new (require('url').URL)(url);
      var host = u.hostname;
      var fullPath = u.pathname + u.search;

      // Primeiro checa path signatures (mais específico)
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

      // Depois checa hostname conhecido
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
   * Tenta extrair JWT de cookie header ou query param.
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

    // Só extrai JWT de requests pra passport/oasgames
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
      // NUNCA bloqueia — só observa
      return { cancel: false };
    });

    session.webRequest.onResponseStarted(_filter, function (details) {
      record(details, 'response');
    });

    logger.info('Inspector: captura ativa para ' + profileId);
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    // Usa filtro específico pra remover APENAS nossos listeners —
    // sem filtro, remove TODOS os onBeforeRequest da session (incluindo
    // o ad blocker do blocker.js). Mesmo padrão do StallDetector.
    try {
      session.webRequest.onBeforeRequest(_filter, null);
      session.webRequest.onResponseStarted(_filter, null);
    } catch (_) {
      /* session pode estar destruída */
    }
    logger.info('Inspector: captura desativada para ' + profileId);
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
