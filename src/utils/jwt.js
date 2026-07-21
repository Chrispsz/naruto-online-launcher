/**
 * JWT Decoder — para o cookie oas_user do Naruto Online
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
 * Decodifica um JWT (header + payload) sem validar a assinatura.
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

/**
 * Formata o JWT decodificado para exibição amigável (PT-BR).
 * @param {string} token
 * @returns {string} resumo legível
 */
function summarize(token) {
  const d = decode(token);
  if (!d) return 'JWT inválido ou malformado';
  const p = d.payload;
  const lines = [];
  lines.push('Player: ' + (p.nickname || p.playerId || '?'));
  lines.push('Email: ' + (p.username || '?'));
  lines.push('ID: ' + (p.playerId || p.uuid || '?'));
  lines.push('Emitido: ' + (d.iat ? d.iat.toISOString() : '?'));
  lines.push('Expira: ' + (d.exp ? d.exp.toISOString() : '?') + (d.expired ? ' [EXPIRADO]' : ''));
  lines.push('Lifetime: ' + (d.lifetime ? d.lifetime / 60 + ' min' : '?'));
  lines.push('Roles: ' + JSON.stringify(p.roles || []));
  lines.push('GrantType: ' + (p.loginGrantType || '?'));
  return lines.join('\n');
}

module.exports = {
  decode: decode,
  summarize: summarize
};
