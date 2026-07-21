/**
 * config/urls.js — Game URL builder multi-região (v3.5.1)
 *
 * PESQUISA REAL (2025): As URLs foram validadas extraindo HTML das páginas
 * oficiais da Oasis Games. Descobrimos que:
 *
 *   ❌ https://oasgames.com → página placeholder chinesa ("网站建设中")
 *   ❌ https://naruto.oasgames.com/pt/ → página mobile, sem form de login
 *   ✅ https://naruto.narutowebgame.com/{lang}/serverlist → PÁGINA DE LOGIN REAL
 *
 * A página de serverlist contém:
 *   - Form de login com campos: oasun (user), oaspd (password)
 *   - Lista de todos os servidores da região (/pt/serverlist/s866, etc.)
 *   - Hidden config: passport_url = //passport.oasgames.com
 *   - GameCode: 'narutopt' (PT), 'narutoen' (EN), 'narutozh' (ZH)
 *   - Facebook OAuth: app_id = 394718192364866
 *
 * SERVIDORES POR REGIÃO (validado):
 *   BR (PT): 866 servidores (S1 → S866)
 *   NA (EN): 2607 servidores (S1 → S2810)
 *   EU (EN): mesmos servidores NA (shared EN)
 *   HK (ZH): ~1000+ servidores
 */

'use strict';

// ── URLs reais de login por região (6 idiomas — validado por pesquisa 2025) ──
// Cada região carrega a página de serverlist que TEM o form de login.
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

// GameCode por região (usado pela API passport.oasgames.com)
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

// Parâmetros de identificação do launcher (reconhecimento pelo servidor)
const LAUNCHER_PARAMS = 'logintype=4&leftbar_collapse=Yes&launcher=shinobi';

// URL base (para construção de links de servidor)
const BASE_URL = 'https://naruto.narutowebgame.com';

/**
 * Constrói a URL do jogo para um perfil específico.
 *
 * Se o perfil tem servidor (ex: "S799"), vai direto para a página desse servidor:
 *   https://naruto.narutowebgame.com/pt/serverlist/s799?logintype=4&launcher=shinobi
 *
 * Se não tem servidor, vai para a lista geral de servidores:
 *   https://naruto.narutowebgame.com/pt/serverlist?logintype=4&launcher=shinobi
 *
 * @param {string} [region] - Código da região (br/na/eu/hk)
 * @param {string} [language] - Código do idioma (pt/en/zh)
 * @param {string} [server] - Número do servidor (ex: "s799" ou "799")
 * @returns {string} URL completa com parâmetros de launcher
 */
function getGameUrl(region, language, server) {
  // Sem região → URL padrão (BR)
  if (!region) region = 'br';

  const baseUrl = REGION_URLS[region];
  if (!baseUrl) return REGION_URLS.br + '?' + LAUNCHER_PARAMS;

  // Se tem servidor, constrói URL direta do servidor
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
 * Retorna a URL base de serverlist para uma região.
 * @param {string} region
 * @returns {string}
 */
function getServerlistUrl(region) {
  return REGION_URLS[region] || REGION_URLS.br;
}

/**
 * Retorna o GameCode de uma região (para API passport).
 * @param {string} region
 * @returns {string}
 */
function getGameCode(region) {
  return REGION_GAME_CODES[region] || REGION_GAME_CODES.br;
}

/**
 * Retorna os parâmetros de launcher (para will-navigate injection).
 * @returns {string}
 */
function getLauncherParams() {
  return LAUNCHER_PARAMS;
}

module.exports = {
  REGION_URLS: REGION_URLS,
  REGION_GAME_CODES: REGION_GAME_CODES,
  BASE_URL: BASE_URL,
  LAUNCHER_PARAMS: LAUNCHER_PARAMS,
  getGameUrl: getGameUrl,
  getServerlistUrl: getServerlistUrl,
  getGameCode: getGameCode,
  getLauncherParams: getLauncherParams
};
