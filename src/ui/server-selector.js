/**
 * ui/server-selector.js — Seletor de Servidores Nativo
 * v1.0.0 — v3.5.0
 *
 * Faz fetch da lista de servidores da página serverlist da Oasis Games
 * e retorna lista estruturada para o launcher renderizar.
 *
 * COMO FUNCIONA:
 *   1. Faz GET para naruto.narutowebgame.com/{lang}/serverlist
 *   2. Extrai links /serverlist/sNNN do HTML
 *   3. Retorna array de { id, number, url } ordenado por número
 *
 * PERFORMANCE:
 *   - Cache em memória por região (evita re-fetch)
 *   - Fetch assíncrono não-bloqueante (Electron net module)
 *   - Timeout de 10s
 */

'use strict';

const { net } = require('electron');
const logger = require('../utils/logger');
const urlConfig = require('../config/urls');

// Cache: region → { servers, fetchedAt }
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const FETCH_TIMEOUT_MS = 10000;

/**
 * Mapeia região → locale da URL.
 * @param {string} region
 * @returns {string}
 */
function _regionToLocale(region) {
  const map = {
    br: 'pt',
    na: 'en',
    eu: 'en',
    hk: 'zh',
    de: 'de',
    es: 'es',
    pl: 'pl',
    fr: 'fr'
  };
  return map[region] || 'pt';
}

/**
 * Extrai servidores do HTML da página serverlist.
 * @param {string} html
 * @param {string} locale
 * @returns {Array<{id:string, number:number, url:string}>}
 */
function _parseServersFromHtml(html, locale) {
  const servers = [];
  const seen = new Set();
  // Match: /pt/serverlist/s799 ou /en/serverlist/s1234
  const regex = new RegExp('/' + locale + '/serverlist/s(\\d+)', 'g');
  let match;
  while ((match = regex.exec(html)) !== null) {
    const num = parseInt(match[1], 10);
    // v3.5.1: S9999 é um redirect "Jogar Agora" (play_host), não servidor real
    if (num === 9999) continue;
    if (!seen.has(num)) {
      seen.add(num);
      servers.push({
        id: 's' + num,
        number: num,
        url: '/' + locale + '/serverlist/s' + num
      });
    }
  }
  // Ordena por número decrescente (servidores mais novos primeiro)
  servers.sort(function (a, b) {
    return b.number - a.number;
  });
  return servers;
}

/**
 * Busca lista de servidores de uma região.
 * Usa cache de 5min para evitar re-fetch desnecessário.
 * @param {string} region - Código da região (br/na/eu/hk/de/es/pl/fr)
 * @returns {Promise<Array<{id:string, number:number}>>}
 */
function fetchServers(region) {
  return new Promise(function (resolve) {
    const locale = _regionToLocale(region);

    // Verifica cache
    const cached = _cache.get(region);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      logger.debug(
        'server-selector: cache hit para ' + region + ' (' + cached.servers.length + ' servers)'
      );
      resolve(cached.servers);
      return;
    }

    const serverlistUrl = urlConfig.getServerlistUrl(region);
    logger.info('server-selector: fetchando servidores de ' + region + ' → ' + serverlistUrl);

    let html = '';
    let settled = false;

    try {
      const request = net.request({
        method: 'GET',
        url: serverlistUrl
      });

      request.setHeader('User-Agent', 'shinobi-launcher/3.5 (server-selector)');

      const timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          try {
            request.cancel();
          } catch (_) {
            /* ignore — socket pode já estar fechado */
          }
          logger.warn('server-selector: timeout para ' + region);
          resolve([]);
        }
      }, FETCH_TIMEOUT_MS);

      request.on('response', function (response) {
        response.on('data', function (chunk) {
          html += chunk.toString();
        });
        response.on('end', function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          if (response.statusCode !== 200) {
            logger.warn('server-selector: HTTP ' + response.statusCode + ' para ' + region);
            resolve([]);
            return;
          }

          const servers = _parseServersFromHtml(html, locale);
          _cache.set(region, { servers: servers, fetchedAt: Date.now() });
          logger.info(
            'server-selector: ' + servers.length + ' servidores encontrados para ' + region
          );
          resolve(servers);
        });
      });

      request.on('error', function (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        logger.warn('server-selector: erro para ' + region + ': ' + error.message);
        resolve([]);
      });

      request.end();
    } catch (e) {
      if (!settled) {
        settled = true;
        logger.error('server-selector: exceção: ' + e.message);
        resolve([]);
      }
    }
  });
}

/**
 * Limpa cache de uma região (ou todas).
 * @param {string} [region]
 */
function clearCache(region) {
  if (region) {
    _cache.delete(region);
  } else {
    _cache.clear();
  }
}

module.exports = {
  fetchServers: fetchServers,
  clearCache: clearCache
};
