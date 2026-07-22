/**
 * Network Request Logger — captura requests/responses completos em arquivo rotativo
 *
 * Diferente do inspector.js (que só guarda stats agregadas + últimas 500 entries em
 * memória), este módulo loga CADA request/response num arquivo JSONL por profile,
 * permitindo análise post-mortem de tráfego do jogo.
 *
 * Features:
 *   - JSON Lines format (1 req por linha, atomic per-line)
 *   - Rotação por tamanho (5MB) + retenção por dias (3 dias)
 *   - Headers sensíveis redacted (Cookie, Authorization, etc.)
 *   - Toggleável via settings (default OFF — privacidade)
 *   - I/O não-bloqueante (queue + setImmediate flush)
 *
 * Arquivo: userData/logs/<profileId>-requests-<YYYY-MM-DD>.jsonl
 *
 * Integração: listeners PARALELOS ao inspector.js na mesma session.
 * Electron 11 suporta múltiplos listeners no mesmo webRequest event.
 *
 * NOTE: este módulo NÃO captura response bodies (apenas headers + size).
 * Bodies de SWF/HTTP seriam pesados demais e de pouca utilidade pra debug.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var logger = require('../utils/logger');

var MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
var RETENTION_DAYS = 3;
var FLUSH_BATCH = 100; // linhas por flush
var REDACTED_HEADERS = ['cookie', 'authorization', 'x-csrf-token', 'x-xsrf-token', 'set-cookie'];

/**
 * Cria um request logger para um profile.
 * @param {string} profileId
 * @param {Object} opts - { userDataPath (string, obrigatório p/ testes), enabled (bool) }
 * @returns {Object} logger instance
 */
function create(profileId, opts) {
  if (typeof profileId !== 'string' || !profileId) {
    throw new Error('RequestLogger: profileId obrigatório');
  }
  opts = opts || {};

  var _userDataPath = opts.userDataPath;
  if (!_userDataPath) {
    try {
      var { app } = require('electron');
      _userDataPath = app.getPath('userData');
    } catch (e) {
      throw new Error('RequestLogger: userDataPath obrigatório quando Electron indisponível');
    }
  }

  var _enabled = !!opts.enabled;
  var _fileHandle = null;
  var _filePath = null;
  var _fileSize = 0;
  var _queue = [];
  var _flushing = false;
  var _filter = { urls: ['<all_urls>'] };
  var _listenersAttached = false;

  function _getLogDir() {
    return path.join(_userDataPath, 'logs');
  }

  function _getCurrentFilePath() {
    var d = new Date();
    var date = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    return path.join(_getLogDir(), profileId + '-requests-' + date + '.jsonl');
  }

  function _ensureLogDir() {
    var dir = _getLogDir();
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return true;
    } catch (e) {
      logger.error('RequestLogger: não criou dir ' + dir + ' — ' + e.message);
      return false;
    }
  }

  function _openFile() {
    if (!_ensureLogDir()) return false;
    _filePath = _getCurrentFilePath();
    try {
      _fileHandle = fs.openSync(_filePath, 'a');
      var stats = fs.fstatSync(_fileHandle);
      _fileSize = stats.size;
      return true;
    } catch (e) {
      logger.error('RequestLogger: não abriu ' + _filePath + ' — ' + e.message);
      _fileHandle = null;
      return false;
    }
  }

  function _closeFile() {
    if (_fileHandle !== null) {
      try { fs.closeSync(_fileHandle); } catch (_) { /* best-effort close */ }
      _fileHandle = null;
      _fileSize = 0;
    }
  }

  function _rotateIfNeeded() {
    if (_fileSize >= MAX_FILE_SIZE) {
      _closeFile();
      _openFile();
    }
  }

  function _redactHeaders(headers) {
    if (!headers) return null;
    var out = {};
    for (var k in headers) {
      if (!Object.prototype.hasOwnProperty.call(headers, k)) continue;
      if (REDACTED_HEADERS.indexOf(k.toLowerCase()) !== -1) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = headers[k];
      }
    }
    return out;
  }

  function _buildEntry(details, kind) {
    return {
      ts: details.timestamp || Date.now(),
      id: details.id,
      kind: kind,
      method: details.method || 'GET',
      url: details.url,
      status: details.statusCode || null,
      resourceType: details.resourceType || null,
      reqHeaders: _redactHeaders(details.requestHeaders),
      resHeaders: kind === 'response' ? _redactHeaders(details.responseHeaders) : null,
      fromCache: !!details.fromCache,
      error: details.error || null
    };
  }

  function _flushQueue() {
    if (_flushing || _queue.length === 0 || _fileHandle === null) return;
    _flushing = true;
    var batch = _queue.splice(0, FLUSH_BATCH);
    var chunk = batch.join('\n') + '\n';
    try {
      fs.writeSync(_fileHandle, chunk);
      _fileSize += Buffer.byteLength(chunk);
      _rotateIfNeeded();
    } catch (e) {
      logger.error('RequestLogger: write falhou (' + profileId + ') — ' + e.message);
      // Re-enfileira o batch perdido no fim (best-effort)
      _queue = batch.concat(_queue);
    }
    _flushing = false;
    if (_queue.length > 0) setImmediate(_flushQueue);
  }

  /**
   * Handler onBeforeRequest — captura o REQUEST.
   */
  function onBeforeRequest(details) {
    if (!_enabled) return;
    var entry = _buildEntry(details, 'request');
    _queue.push(JSON.stringify(entry));
    _flushQueue();
  }

  /**
   * Handler onResponseStarted — captura a RESPONSE (status + headers).
   */
  function onResponseStarted(details) {
    if (!_enabled) return;
    var entry = _buildEntry(details, 'response');
    _queue.push(JSON.stringify(entry));
    _flushQueue();
  }

  /**
   * Anexa listeners na session. Idempotente.
   */
  function _attachListeners(ses) {
    if (_listenersAttached || !ses || !ses.webRequest) return;
    try {
      ses.webRequest.onBeforeRequest(_filter, onBeforeRequest);
      ses.webRequest.onResponseStarted(_filter, onResponseStarted);
      _listenersAttached = true;
    } catch (e) {
      logger.error('RequestLogger: falhou attach listeners — ' + e.message);
    }
  }

  /**
   * Desanexa listeners da session (usando filtro específico, padrão do projeto).
   */
  function _detachListeners(ses) {
    if (!_listenersAttached || !ses || !ses.webRequest) return;
    try {
      ses.webRequest.onBeforeRequest(_filter, null);
      ses.webRequest.onResponseStarted(_filter, null);
    } catch (_) { /* session pode estar destruída */ }
    _listenersAttached = false;
  }

  function enable(ses) {
    if (_enabled) return;
    _enabled = true;
    if (_openFile()) {
      _cleanupOldLogs();
      if (ses) _attachListeners(ses);
      logger.info('RequestLogger: ativo — ' + profileId + ' → ' + _filePath);
    } else {
      _enabled = false;
    }
  }

  function disable(ses) {
    if (!_enabled) return;
    _enabled = false;
    _flushQueue(); // drain pendentes
    if (ses) _detachListeners(ses);
    _closeFile();
    logger.info('RequestLogger: desativado — ' + profileId);
  }

  function isEnabled() {
    return _enabled;
  }

  /**
   * Limpa logs antigos (> RETENTION_DAYS) deste profile.
   */
  function _cleanupOldLogs() {
    var dir = _getLogDir();
    try {
      var files = fs.readdirSync(dir);
      var cutoff = Date.now() - RETENTION_DAYS * 86400000;
      var prefix = profileId + '-requests-';
      for (var i = 0; i < files.length; i++) {
        if (files[i].indexOf(prefix) !== 0) continue;
        var fp = path.join(dir, files[i]);
        try {
          var stats = fs.statSync(fp);
          if (stats.mtimeMs < cutoff) fs.unlinkSync(fp);
        } catch (_) { /* ignore stat/unlink errors */ }
      }
    } catch (_) { /* ignore readdir errors */ }
  }

  /**
   * Atualiza config em runtime. Se desligou, desliga; se ligou, liga.
   * @param {boolean} enabled
   * @param {Object} [ses] - session para attach/detach listeners
   */
  function updateSettings(enabled, ses) {
    if (enabled && !_enabled) {
      enable(ses);
    } else if (!enabled && _enabled) {
      disable(ses);
    }
  }

  /**
   * Destrói o logger: desliga, fecha arquivo, limpa queue.
   */
  function destroy(ses) {
    disable(ses);
    _queue = [];
  }

  /**
   * Retorna stats do logger (para inspeção/dev).
   */
  function getStats() {
    return {
      profileId: profileId,
      enabled: _enabled,
      filePath: _filePath,
      fileSize: _fileSize,
      queueLength: _queue.length,
      listenersAttached: _listenersAttached
    };
  }

  return {
    enable: enable,
    disable: disable,
    isEnabled: isEnabled,
    updateSettings: updateSettings,
    destroy: destroy,
    getStats: getStats,
    // handlers expostos pra teste unitário
    _onBeforeRequest: onBeforeRequest,
    _onResponseStarted: onResponseStarted,
    _buildEntry: _buildEntry,
    _redactHeaders: _redactHeaders
  };
}

module.exports = {
  create: create,
  MAX_FILE_SIZE: MAX_FILE_SIZE,
  RETENTION_DAYS: RETENTION_DAYS,
  REDACTED_HEADERS: REDACTED_HEADERS
};
