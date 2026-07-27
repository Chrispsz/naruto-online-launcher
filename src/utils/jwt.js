/**
 * JWT Decoder — for the Naruto Online oas_user cookie
 * tempmail + API login + dev inspector
 *
 * The passport.oasgames.com returns a loginKey (JWT HS256) valid for 2h. This JWT
 * will end up in the oas_user cookie (domain .narutowebgame.com) and is what
 * keeps the session logged in to the game.
 *
 * This module decodes WITHOUT validating the signature (the server validates).
 * Used by the Network Inspector to display the captured JWT payload.
 */

'use strict';

/**
 * Decodes a JWT (header + payload) without validating the signature.
 * @param {string} token — Full JWT (xxx.yyy.zzz)
 * @returns {{header:Object, payload:Object, signature:string, exp:Date, iat:Date, expired:boolean, expiresInSeconds:number}|null}
 */
function decode(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    // Base64Url → Base64
    const b64url = function (s) {
      let out = s.replace(/-/g, '+').replace(/_/g, '/');
      while (out.length % 4) out += '=';
      return out;
    };
    const header = JSON.parse(Buffer.from(b64url(parts[0]), 'base64').toString('utf8'));
    const payload = JSON.parse(Buffer.from(b64url(parts[1]), 'base64').toString('utf8'));

    const now = Math.floor(Date.now() / 1000);
    const iat = payload.iat ? new Date(payload.iat * 1000) : null;
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    const expired = !!(exp && now >= payload.exp);
    const expiresInSeconds = exp ? Math.max(0, payload.exp - now) : 0;

    return {
      header: header,
      payload: payload,
      signature: parts[2],
      iat: iat,
      exp: exp,
      expired: expired,
      expiresInSeconds: expiresInSeconds,
      lifetime: payload.lifetime || null
    };
  } catch (e) {
    return null;
  }
}

module.exports = {
  decode: decode
};
