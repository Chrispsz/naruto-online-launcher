/**
 * Gerenciamento de Cookies Persistentes com Debounce
 * Com cleanup correto para evitar memory leaks
 */

'use strict';

const logger = require('../utils/logger');

const COOKIE_EXPIRY = 31536000; // 1 ano em segundos
const DEBOUNCE_MS = 250; // Debounce para operações de cookie (aumentado para menos I/O)

// Debounce timer e pending removals (module-level para cleanup)
let debounceTimer = null;
let pendingRemovals = new Map();

/**
 * Configura cookies persistentes com debounce para performance
 * @param {Electron.Session} session 
 */
function setupPersistentCookies(session) {
  const convertingCookies = new Set();
  
  // Domínios de tracking para remover cookies
  const TRACKING_DOMAINS = [
    'facebook.com',
    'google.com',
    'doubleclick.net',
    'google-analytics.com'
  ];
  
  // Domínios permitidos (nunca remover)
  const ALLOWED_DOMAINS = [
    'narutowebgame.com',
    'oasgames.com'
  ];

  const flushRemovals = () => {
    const removals = [...pendingRemovals.values()];
    pendingRemovals.clear();
    
    if (removals.length > 0) {
      Promise.all(
        removals.map(({ url, name }) =>
          session.cookies.remove(url, name).catch(() => {})
        )
      ).then(() => {
        logger.debug(`Removidos ${removals.length} tracking cookies`);
      });
    }
  };

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
    
    // Remove cookies de tracking
    if (TRACKING_DOMAINS.some(d => cookie.domain?.includes(d))) {
      const url = buildCookieUrl(cookie);
      const key = `${url}|${cookie.name}`;
      pendingRemovals.set(key, { url, name: cookie.name });
      
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushRemovals, DEBOUNCE_MS);
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
  
  logger.info('Cookies persistentes configurados (com debounce)');
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

/**
 * Cleanup para evitar memory leaks no shutdown
 * Deve ser chamado antes de app.exit()
 */
function cleanup() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingRemovals.clear();
}

module.exports = {
  setupPersistentCookies,
  clearAllCookies,
  cleanup,
  COOKIE_EXPIRY
};
