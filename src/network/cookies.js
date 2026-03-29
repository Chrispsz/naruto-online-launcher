/**
 * Gerenciamento de Cookies Persistentes
 */

'use strict';

const logger = require('../utils/logger');

const COOKIE_EXPIRY = 31536000; // 1 ano em segundos

function setupPersistentCookies(session) {
  const convertingCookies = new Set();
  
  session.cookies.on('changed', (event, cookie, cause, removed) => {
    if (removed) return;
    
    const key = `${cookie.domain}|${cookie.name}`;
    if (convertingCookies.has(key)) return;
    
    // Se o cookie expira em menos de 24h, estende para 1 ano
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
      }).finally(() => convertingCookies.delete(key));
    }
  });
  
  // Intercepta headers para adicionar Max-Age
  session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    
    if (responseHeaders['set-cookie']) {
      responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(cookie => {
        if (!cookie.toLowerCase().includes('expires=') && !cookie.toLowerCase().includes('max-age=')) {
          return cookie + `; Max-Age=${COOKIE_EXPIRY}`;
        }
        return cookie;
      });
    }
    
    callback({ responseHeaders });
  });
  
  logger.info('Cookies persistentes configurados');
}

function buildCookieUrl(cookie) {
  const protocol = cookie.secure ? 'https://' : 'http://';
  const domain = cookie.domain.replace(/^\./, '');
  return `${protocol}${domain}${cookie.path}`;
}

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
