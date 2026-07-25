/**
 * config/urls.js — Multi-region game URL builder
 *
 * REAL RESEARCH (2025): URLs were validated by extracting HTML from the pages
 * oficiais da Oasis Games. Descobrimos que:
 *
 *   ❌ https://oasgames.com → Chinese placeholder page ("网站建设中")
 *   ❌ https://naruto.oasgames.com/pt/ → mobile page, no login form
 *   ✅ https://naruto.narutowebgame.com/{lang}/serverlist → REAL LOGIN PAGE
 *
 * The serverlist page contains:
 *   - Form de login com campos: oasun (user), oaspd (password)
 *   - List of all servers in the region (/pt/serverlist/s866, etc.)
 *   - Hidden config: passport_url = //passport.oasgames.com
 *   - GameCode: 'narutopt' (PT), 'narutoen' (EN), 'narutozh' (ZH)
 *   - Facebook OAuth: app_id = 394718192364866
 *
 * SERVERS BY REGION (validated):
 *   BR (PT): 866 servidores (S1 → S866)
 *   NA (EN): 2607 servidores (S1 → S2810)
 *   EU (EN): mesmos servidores NA (shared EN)
 *   HK (ZH): ~1000+ servidores
 */

'use strict';

// ── Real login URLs by region (6 languages — validated by 2025 research) ──
// Each region loads the serverlist page that HAS the login form.
// Campos do form: input[name="oasun"] + input[name="oaspd"] + keyLogin()
const REGION_URLS = {
  br: 'https://naruto.narutowebgame.com/pt/serverlist',
  na: 'https://naruto.narutowebgame.com/en/serverlist',
  eu: 'https://naruto.narutowebgame.com/en/serverlist',
  hk: 'https://naruto.narutowebgame.com/zh/serverlist',
  de: 'https://naruto.narutowebgame.com/de/serverlist',
  es: 'https://naruto.narutowebgame.com/es/serverlist',
  pl: 'https://naruto.narutowebgame.com/pl/serverlist',
  fr: 'https://naruto.narutowebgame.com/fr/serverlist'
};

// GameCode by region (used by the passport.oasgames.com API)
const REGION_GAME_CODES = {
  br: 'narutopt',
  na: 'narutoen',
  eu: 'narutoen',
  hk: 'narutozh',
  de: 'narutode',
  es: 'narutoes',
  pl: 'narutopl',
  fr: 'narutofr'
};

// Launcher identification params (recognized by server)
const LAUNCHER_PARAMS = 'logintype=4&leftbar_collapse=Yes&launcher=shinobi';

/**
 * Builds the game URL for a specific profile.
 *
 * If the profile has a server (e.g.: "S799"), goes directly to that server's page:
 *   https://naruto.narutowebgame.com/pt/serverlist/s799?logintype=4&launcher=shinobi
 *
 * If no server, goes to the general server list:
 *   https://naruto.narutowebgame.com/pt/serverlist?logintype=4&launcher=shinobi
 *
 * @param {string} [region] - Region code (br/na/eu/hk)
 * @param {string} [server] - Server number (e.g.: "s799" or "799")
 * @returns {string} Full URL with launcher parameters
 */
function getGameUrl(region, server) {
  // No region → default URL (BR)
  if (!region) region = 'br';

  const baseUrl = REGION_URLS[region];
  if (!baseUrl) return REGION_URLS.br + '?' + LAUNCHER_PARAMS;

  // If server set, builds direct server URL
  let url = baseUrl;
  if (server) {
    // Normaliza: "799" → "s799", "S799" → "s799"
    let s = String(server).toLowerCase().trim();
    if (!s.startsWith('s')) s = 's' + s;
    url = baseUrl + '/' + s;
  }

  return url + '?' + LAUNCHER_PARAMS;
}

/**
 * Returns the serverlist base URL for a region.
 * @param {string} region
 * @returns {string}
 */
function getServerlistUrl(region) {
  return REGION_URLS[region] || REGION_URLS.br;
}

/**
 * Returns the GameCode of a region (for passport API).
 * @param {string} region
 * @returns {string}
 */
function getGameCode(region) {
  return REGION_GAME_CODES[region] || REGION_GAME_CODES.br;
}

/**
 * Returns launcher parameters (for will-navigate injection).
 * @returns {string}
 */
function getLauncherParams() {
  return LAUNCHER_PARAMS;
}

module.exports = {
  LAUNCHER_PARAMS: LAUNCHER_PARAMS,
  getGameUrl: getGameUrl,
  getServerlistUrl: getServerlistUrl,
  getGameCode: getGameCode,
  getLauncherParams: getLauncherParams
};
