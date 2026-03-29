/**
 * Bloqueador de Trackers e Analytics
 */

'use strict';

const logger = require('../utils/logger');

// Lista otimizada com Set para O(1) lookup
const BLOCK_DOMAINS = new Set([
  // Analytics
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',
  'www.google-analytics.com',
  // Ads
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  // Social tracking
  'facebook.com/tr',
  'connect.facebook.net',
  'pixel.facebook.com',
  // Game-specific tracking
  'collect.mdata.cool',
  'mdata.cool',
  'track.oasgames.com',
  'log.oasgames.com',
  // General
  'hotjar.com',
  'clarity.ms',
  'cdn.mxpnl.com'
]);

function shouldBlock(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const pathname = parsed.pathname;
    
    for (const domain of BLOCK_DOMAINS) {
      if (hostname.includes(domain) || pathname.includes(domain)) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

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
  BLOCK_DOMAINS,
  shouldBlock,
  setupBlocker
};
