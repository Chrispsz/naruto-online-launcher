/**
 * Bloqueador de Trackers e Analytics com Trie
 * O(k) lookup onde k = partes do domínio
 */

'use strict';

const logger = require('../utils/logger');

/**
 * Trie para matching de sufixos de domínio
 * Permite O(k) lookup onde k é o número de partes do domínio
 */
class DomainTrie {
  constructor() {
    this.root = {};
  }

  /**
   * Adiciona domínio à trie
   * @param {string} domain - ex: "google-analytics.com"
   */
  add(domain) {
    const parts = domain.split('.').reverse(); // ["com", "google-analytics"]
    let node = this.root;
    
    for (const part of parts) {
      node[part] = node[part] || {};
      node = node[part];
    }
    
    node['$'] = true; // Marcador de fim
  }

  /**
   * Verifica se hostname ou qualquer sufixo corresponde
   * @param {string} hostname - ex: "www.google-analytics.com"
   * @returns {boolean}
   */
  matches(hostname) {
    const parts = hostname.split('.').reverse();
    let node = this.root;
    
    for (const part of parts) {
      // Match parcial encontrado
      if (node['$']) return true;
      
      if (!node[part]) return false;
      node = node[part];
    }
    
    return !!node['$'];
  }
}

// Lista de domínios bloqueados
const BLOCKED_DOMAINS = [
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
  'facebook.com',
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
];

// Setup da Trie (único)
const blockerTrie = new DomainTrie();
BLOCKED_DOMAINS.forEach(d => blockerTrie.add(d));

// Cache de resultados (LRU simples)
const blockCache = new Map();
const MAX_CACHE = 10000;

/**
 * Verifica se URL deve ser bloqueada
 * @param {string} url 
 * @returns {boolean}
 */
function shouldBlock(url) {
  // Cache hit?
  if (blockCache.has(url)) {
    return blockCache.get(url);
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    
    // Verifica na Trie
    const result = blockerTrie.matches(hostname);
    
    // Cacheia resultado (LRU simples)
    if (blockCache.size >= MAX_CACHE) {
      const keys = [...blockCache.keys()].slice(0, MAX_CACHE / 2);
      keys.forEach(k => blockCache.delete(k));
    }
    blockCache.set(url, result);
    
    return result;
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
  
  logger.info('Blocker configurado (Trie + Cache)');
}

module.exports = {
  DomainTrie,
  BLOCKED_DOMAINS,
  blockerTrie,
  shouldBlock,
  setupBlocker
};
