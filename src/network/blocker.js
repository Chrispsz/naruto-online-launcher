/**
 * Bloqueador de Trackers e Analytics
 * Simples Set + endsWith para 18 domínios estáticos
 */

'use strict';

const logger = require('../utils/logger');

// Lista de domínios bloqueados (apenas domínios raiz)
const BLOCKED_DOMAINS = new Set([
  // Analytics
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',
  // Ads
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  // Social tracking
  'facebook.com',
  'connect.facebook.net',
  'pixel.facebook.com',
  // Game-specific tracking
  'collect.mdata.cool',
  'mdata.cool',
  'track.oasgames.com',
  'log.oasgames.com',
  'track.narutowebgame.com',
  // Telemetry
  'sentry.io',
  // General
  'hotjar.com',
  'clarity.ms',
  'cdn.mxpnl.com'
]);

/**
 * Verifica se hostname termina com algum domínio bloqueado
 * @param {string} hostname
 * @returns {boolean}
 */
function isBlockedDomain(hostname) {
  for (const domain of BLOCKED_DOMAINS) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return true;
    }
  }
  return false;
}

/**
 * Verifica se URL deve ser bloqueada
 * @param {string} url 
 * @returns {boolean}
 */
function shouldBlock(url) {
  try {
    const hostname = new URL(url).hostname;
    return isBlockedDomain(hostname);
  } catch {
    return false;
  }
}

/**
 * Configura o bloqueador na sessão
 * @param {Electron.Session} session 
 */
function setupBlocker(session) {
  session.webRequest.onBeforeRequest((details, callback) => {
    if (shouldBlock(details.url)) {
      logger.debug(`Bloqueado: ${details.url}`);
      return callback({ cancel: true });
    }
    
    // Substitui logintype=3 por logintype=4
    let url = details.url;
    if (url.includes('logintype=3')) {
      url = url.replace(/logintype=3/g, 'logintype=4');
      return callback({ redirectURL: url });
    }
    
    callback({ cancel: false });
  });
  
  logger.info('Blocker configurado');
}

module.exports = {
  BLOCKED_DOMAINS,
  isBlockedDomain,
  shouldBlock,
  setupBlocker
};
