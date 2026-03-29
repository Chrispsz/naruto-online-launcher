/**
 * Gerenciamento de Cookies Persistentes
 */

'use strict';

const logger = require('../utils/logger');

const COOKIE_EXPIRY = 31536000; // 1 ano em segundos

/**
 * Configura cookies persistentes
 * @param {Electron.Session} session 
 */
function setupPersistentCookies(session) {
  const convertingCookies = new Set();
  
  // Domínios de tracking para remover cookies
  const TRACKING_DOMAINS = [
    'facebook.com',
    'google.com',
    'doubleclick.net',
    'google-analytics.com',
    'sentry.io',
    'track.oasgames.com',
    'track.narutowebgame.com',
    'mdata.cool'
  ];
  
  // Domínios permitidos (nunca remover)
  const ALLOWED_DOMAINS = [
    'narutowebgame.com',
    'oasgames.com'
  ];

  session.cookies.on('changed', (event, cookie, cause, removed) => {
    if (removed) return;
    
    // Não remove cookies de domínios permitidos
    if (ALLOWED_DOMAINS.some(d => cookie.domain?.includes(d))) {
      // Estende cookies do jogo para 1 ano
      const key = `${cookie.domain}|${cookie.name}`;
      if (convertingCookies.has(key)) return;
      
      if (!cookie.expirationDate || cookie.expirationDate < Date.now() / 1000 + 86400) {
        convertingCookies.add(key);
        
        const url = buildCookieUrl(cookie);
        
        session.cookies.set({
          url,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          expirationDate: Math.floor(Date.now() / 1000) + COOKIE_EXPIRY,
          sameSite: 'no_restriction'
        })
          .catch(err => logger.debug('Cookie set failed', err.message))
          .finally(() => convertingCookies.delete(key));
      }
      return;
    }
    
    // Remove cookies de tracking diretamente
    if (TRACKING_DOMAINS.some(d => cookie.domain?.includes(d))) {
      const url = buildCookieUrl(cookie);
      session.cookies.remove(url, cookie.name).catch(() => {});
    }
  });
  
  // Intercepta headers para bloquear tracking cookies na origem
  // Só monitora domínios do jogo para não interferir em assets externos
  session.webRequest.onHeadersReceived(
    { urls: ['*://*.oasgames.com/*', '*://*.narutowebgame.com/*'] },
    (details, callback) => {
      const setCookie = details.responseHeaders?.['set-cookie'];
      
      if (!setCookie) {
        return callback({});
      }
      
      // Estende cookies do jogo
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders['set-cookie'] = setCookie.map(cookie => {
        if (!cookie.toLowerCase().includes('expires=') && !cookie.toLowerCase().includes('max-age=')) {
          return cookie + `; Max-Age=${COOKIE_EXPIRY}`;
        }
        return cookie;
      });
      
      callback({ responseHeaders });
    }
  );
  
  // Bloqueia tracking cookies em todos os domínios
  session.webRequest.onHeadersReceived(
    { urls: TRACKING_DOMAINS.map(d => `*://*.${d}/*`) },
    (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['set-cookie'];
      callback({ responseHeaders });
    }
  );
  
  logger.info('Cookies persistentes configurados');
}

/**
 * Constrói URL a partir do cookie
 */
function buildCookieUrl(cookie) {
  const protocol = cookie.secure ? 'https://' : 'http://';
  const domain = cookie.domain.replace(/^\./, '');
  return `${protocol}${domain}${cookie.path}`;
}

/**
 * Limpa todos os cookies e cache
 */
async function clearAllCookies(session) {
  try {
    const cookies = await session.cookies.get({});
    
    for (const cookie of cookies) {
      const url = buildCookieUrl(cookie);
      await session.cookies.remove(url, cookie.name);
    }
    
    await session.clearCache();
    await session.clearStorageData();
    
    logger.info('Cookies e cache limpos');
    return true;
  } catch (e) {
    logger.error('Erro ao limpar cookies', e.message);
    return false;
  }
}

module.exports = {
  setupPersistentCookies,
  clearAllCookies,
  COOKIE_EXPIRY
};
