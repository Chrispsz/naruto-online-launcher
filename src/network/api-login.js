/**
 * API Login — injeta JWT oas_user na session do Electron
 * v1.0.0 — v4.9: login via API (sem Flash) + cookie injection
 *
 * O login normal (form HTML) usa o passport.oasgames.com pra receber um JWT
 * e setar o cookie oas_user no domínio .narutowebgame.com. Esse módulo faz
 * o mesmo via API, pulando o form — útil pra:
 *   - Auto-login mais robusto (sem MutationObserver)
 *   - Login de contas tempmail recém-criadas
 *   - Renovação automática antes do JWT expirar (2h)
 *
 * Verificado ao vivo: o cookie oas_user=<loginKey> é tudo que o jogo precisa
 * pra considerar a sessão logada. O servidor valida o JWT HS256.
 *
 * DOMÍNIO CRÍTICO: o cookie DEVE ir no domínio .narutowebgame.com (não oasgames.com).
 * O renderer precisa estar numa página *.narutowebgame.com pra setCookie funcionar.
 */

'use strict';

const logger = require('../utils/logger');
const tempmail = require('./tempmail');

const OAS_USER_DOMAIN = 'narutowebgame.com';
// O jogo carrega de naruto.narutowebgame.com/pl/serverlist — secure cookie Praace.
const DEFAULT_GAME_PATH = '/pl/serverlist';

/**
 * Faz login via API e injeta o cookie oas_user na session do perfil.
 *
 * @param {Object} session — Electron session (session.fromPartition(partName))
 * @param {string} email
 * @param {string} password
 * @param {Object} [opts]
 * @param {boolean} [opts.remember] — remember=1 (JWT estendido)
 * @returns {Promise<{loginKey:string, playerId:string, nickname:string, expiresAt:number}>}
 */
async function loginAndInject(session, email, password, opts) {
  opts = opts || {};
  logger.info('ApiLogin: authenticating ' + email);

  // 1. Login via passport API → recebe loginKey (JWT)
  const auth = await tempmail.login(email, password, opts.remember);

  // 2. Injeta o cookie oas_user no domínio .narutowebgame.com
  //    O jogo lê esse cookie pra considerar a sessão logada.
  const cookieUrl = 'https://' + OAS_USER_DOMAIN + DEFAULT_GAME_PATH;
  await session.cookies.set({
    url: cookieUrl,
    name: 'oas_user',
    value: auth.loginKey,
    domain: '.' + OAS_USER_DOMAIN,
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'no_restriction',
    expirationDate: Math.floor(auth.expiresAt / 1000)
  });

  // 3. Seta também o cookie de idioma (pra não rebater pra tela de seleção)
  await session.cookies.set({
    url: cookieUrl,
    name: 'oas_lp_language_naruto',
    value: 'pl',
    domain: '.' + OAS_USER_DOMAIN,
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'no_restriction'
  });

  logger.info(
    'ApiLogin: cookie oas_user injected into .' +
      OAS_USER_DOMAIN +
      ' (expires in ' +
      Math.round(auth.expiresAt / 1000 - Date.now() / 1000) +
      's)'
  );

  return {
    loginKey: auth.loginKey,
    playerId: auth.playerId,
    nickname: auth.nickname,
    expiresAt: auth.expiresAt
  };
}

/**
 * Verifica se o cookie oas_user ainda é válido (não expirado).
 * @param {Object} session
 * @returns {Promise<{valid:boolean, jwtDecoded:Object|null, expiresInSeconds:number}>}
 */
async function checkSession(session) {
  const cookies = await session.cookies.get({ name: 'oas_user', domain: '.' + OAS_USER_DOMAIN });
  if (!cookies || !cookies.length) {
    return { valid: false, jwtDecoded: null, expiresInSeconds: 0 };
  }
  const decoded = tempmail._decode(cookies[0].value);
  if (!decoded) return { valid: false, jwtDecoded: null, expiresInSeconds: 0 };
  return {
    valid: !decoded.expired,
    jwtDecoded: decoded,
    expiresInSeconds: decoded.expiresInSeconds
  };
}

/**
 * Renova o JWT antes de expirar, se necessário.
 * @param {Object} session
 * @param {string} email
 * @param {string} password
 * @param {number} [thresholdSeconds=300] — renova se faltar menos que isso
 * @returns {Promise<{renewed:boolean, loginKey:string|null, expiresAt:number}>}
 */
async function renewIfNeeded(session, email, password, thresholdSeconds) {
  thresholdSeconds = thresholdSeconds != null ? thresholdSeconds : 300; // 5 min default
  const status = await checkSession(session);
  if (status.valid && status.expiresInSeconds > thresholdSeconds) {
    return { renewed: false, loginKey: null, expiresAt: 0 };
  }
  logger.info('ApiLogin: renewing JWT (expires in ' + status.expiresInSeconds + 's)');
  const fresh = await loginAndInject(session, email, password);
  return { renewed: true, loginKey: fresh.loginKey, expiresAt: fresh.expiresAt };
}

module.exports = {
  loginAndInject: loginAndInject,
  checkSession: checkSession,
  renewIfNeeded: renewIfNeeded,
  OAS_USER_DOMAIN: OAS_USER_DOMAIN
};
