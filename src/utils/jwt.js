/**
 * JWT Decoder — for the Naruto Online oas_user cookie
 * v1.0.0 — v4.9: tempmail + API login + dev inspector
 *
 * O passport.oasgames.com retorna um loginKey (JWT HS256) de 2h. Esse JWT
 * vai parar no cookie oas_user (domínio .narutowebgame.com) e é o que
 * mantém a sessão logada no jogo.
 *
 * Este módulo decodifica SEM validar a assinatura (o servidor valida).
 * Usado pelo Inspector de Rede pra mostrar o payload do JWT capturado.
 */

'use strict';

/**
 * Decodes a JWT (header + payload) without validating the signature.
 * @param {string} token — JWT completo (xxx.yyy.zzz)
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
