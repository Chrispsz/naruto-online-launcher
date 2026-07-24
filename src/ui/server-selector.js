/**
 * ui/server-selector.js — Native Server Selector
 * v1.0.0 — v3.5.0
 *
 * Fetches the server list from the Oasis Games serverlist page
 * and returns a structured list for the launcher to render.
 *
 * COMO FUNCIONA:
 *   1. Faz GET para naruto.narutowebgame.com/{lang}/serverlist
 *   2. Extrai links /serverlist/sNNN do HTML
 *   3. Retorna array de { id, number, url } ordenado por número
 *
 * PERFORMANCE:
 *   - In-memory cache per region (avoids re-fetch)
 *   - Non-blocking async fetch (Electron net module)
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
 * Maps region → URL locale.
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
 * Extracts servers from the serverlist page HTML.
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
    // v3.5.1: S9999 is a "Play Now" redirect (play_host), not a real server
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
  // Sort by descending number (newest servers first)
  servers.sort(function (a, b) {
    return b.number - a.number;
  });
  return servers;
}

/**
 * Fetches server list for a region.
 * Uses 5min cache to avoid unnecessary re-fetch.
 * @param {string} region - Region code (br/na/eu/hk/de/es/pl/fr)
 * @returns {Promise<Array<{id:string, number:number}>>}
 */
function fetchServers(region) {
  return new Promise(function (resolve) {
    const locale = _regionToLocale(region);

    // Check cache
    const cached = _cache.get(region);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      logger.debug(
        'server-selector: cache hit for ' + region + ' (' + cached.servers.length + ' servers)'
      );
      resolve(cached.servers);
      return;
    }

    const serverlistUrl = urlConfig.getServerlistUrl(region);
    logger.info('server-selector: fetching servers from ' + region + ' → ' + serverlistUrl);

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
          logger.warn('server-selector: timeout for ' + region);
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
            logger.warn('server-selector: HTTP ' + response.statusCode + ' for ' + region);
            resolve([]);
            return;
          }

          const servers = _parseServersFromHtml(html, locale);
          _cache.set(region, { servers: servers, fetchedAt: Date.now() });
          logger.info(
            'server-selector: ' + servers.length + ' servers found for ' + region
          );
          resolve(servers);
        });
      });

      request.on('error', function (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        logger.warn('server-selector: error for ' + region + ': ' + error.message);
        resolve([]);
      });

      request.end();
    } catch (e) {
      if (!settled) {
        settled = true;
        logger.error('server-selector: exception: ' + e.message);
        resolve([]);
      }
    }
  });
}

/**
 * Clears cache for a region (or all).
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
