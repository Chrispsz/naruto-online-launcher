/**
 * API Login — injects JWT oas_user into the Electron session
 * v1.0.0 — v4.9: API login (no Flash) + cookie injection
 *
 * Normal login (HTML form) uses passport.oasgames.com to receive a JWT
 * and set the oas_user cookie on the .narutowebgame.com domain. This module does
 * the same via API, skipping the form — useful for:
 *   - Auto-login mais robusto (sem MutationObserver)
 *   - Login de contas tempmail recém-criadas
 *   - Auto-renewal before JWT expires (2h)
 *
 * Verificado ao vivo: o cookie oas_user=<loginKey> é tudo que o jogo precisa
 * to consider the session logged in. The server validates the JWT HS256.
 *
 * CRITICAL DOMAIN: the cookie MUST go to .narutowebgame.com (not oasgames.com).
 * The renderer must be on a *.narutowebgame.com page for setCookie to work.
 */

'use strict';

const logger = require('../utils/logger');
const tempmail = require('./tempmail');

const OAS_USER_DOMAIN = 'narutowebgame.com';
// The game loads from naruto.narutowebgame.com/pl/serverlist — secure cookie Practice.
const DEFAULT_GAME_PATH = '/pl/serverlist';

/**
 * Performs API login and injects the oas_user cookie into the profile's session.
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

  // 2. Injects the oas_user cookie on the .narutowebgame.com domain
  //    The game reads this cookie to consider the session logged in.
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

  // 3. Also sets the language cookie (to avoid bouncing to language selection screen)
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
 * Checks if the oas_user cookie is still valid (not expired).
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
 * Renews the JWT before it expires, if necessary.
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
