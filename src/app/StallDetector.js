/**
 * app/StallDetector.js — Detecção de loader travado + auto-F5 com pré-auth
 *
 * PROBLEMA (v5.9.11): o login do Naruto Online às vezes trava em ~14% e dá
 * erro de conexão. Root cause: um SWF essencial (assets, UI, empty.swf)
 * falha no download (network hiccup, timeout, Mixed Content). O preloader
 * do Flash NÃO tem retry — quando um SWF falha, o loader fica preso
 * forever naquela porcentagem. O usuário precisa fechar e reabrir manualmente.
 *
 * SOLUÇÃO: monitorar a session via webRequest.onCompleted + onErrorOccurred.
 * Quando detectamos:
 *   (A) 2+ SWFs falhando em 60s → burst de falhas = servidor instável → reload
 *   (B) 45s sem nenhuma atividade de rede durante o loading → loader travado → reload
 * Chamamos onStall() que delega pra SessionLifecycle.reloadWithPreAuth
 * (mesmo fluxo do F5: limpa cookies + pré-autentica via API antes de reload).
 *
 * BACKOFF: max 3 auto-reloads em 10 min por perfil (evita loop infinito
 * se o servidor estiver realmente fora do ar).
 *
 * AUTO-STOP: após 120s de atividade contínua sem stall, consideramos o
 * jogo "pronto" e encerramos o monitoramento (o jogo está rodando, não
 * precisa mais de watchdog).
 *
 * LISTENER CLEANUP: Electron 11's webRequest.onCompleted(null) remove TODOS
 * os listeners da session, não apenas o nosso. Isso causava leak quando
 * múltiplas janelas usavam a mesma session. Fix: usamos um WeakMap para
 * rastrear os filtros registrados por cada session e passamos o filtro
 * correto no detach(). Se não for possível remover com filtro, usamos
 * um flag 'stopped' para no-op nos handlers (listeners ficam mas são inertes).
 *
 * Nota: did-fail-load (em SessionLifecycle) cuida de erros da página HTML
 * principal. Este módulo cuida de falhas de SUB-RECURSOS (SWFs dentro do
 * Flash player) que o did-fail-load não detecta.
 */

'use strict';

var logger = require('../utils/logger');

// WeakMap para rastrear filtros webRequest por session — permite detach limpo
// sem remover listeners de outros StallDetectors na mesma session.
var _sessionFilters = new WeakMap();

var DEFAULTS = {
  maxRetries: 3, // max auto-reloads na janela de retry
  retryWindowMs: 600000, // 10 min — janela pra contar retries
  stallThresholdMs: 45000, // 45s sem atividade = loader travado
  swfErrorThreshold: 2, // 2 SWFs falhando em 60s = burst = reload
  swfErrorWindowMs: 60000, // 60s — janela pra contar SWF errors
  pollIntervalMs: 10000, // check a cada 10s
  readyAfterMs: 120000 // 120s de atividade contínua = jogo pronto
};

/**
 * Cria e anexa um StallDetector a uma janela de jogo.
 *
 * @param {Electron.BrowserWindow} win
 * @param {Electron.Session} ses
 * @param {Object} ctx
 * @param {string} ctx.profileName — nome do perfil (pra logs)
 * @param {Function} ctx.onStall — callback chamado quando stall detectado
 * @param {Object} [ctx.opts] — overrides de thresholds (pra testes)
 * @returns {Object|null} instância com método detach(), ou null se inválido
 */
function attach(win, ses, ctx) {
  if (!win || !ses) return null;
  if (!ctx || typeof ctx.onStall !== 'function') return null;

  var profileName = ctx.profileName || 'unknown';
  var onStall = ctx.onStall;
  var opts = Object.assign({}, DEFAULTS, ctx.opts || {});

  var lastActivityAt = Date.now();
  var startedAt = Date.now();
  var swfErrors = []; // timestamps de falhas de SWF
  var retries = []; // timestamps de auto-reloads
  var stopped = false;
  var ready = false;
  var pollInterval = null;

  /**
   * Verifica se uma URL é um arquivo SWF.
   */
  function isSwf(url) {
    if (!url) return false;
    return /\.swf(\?|$|#)/i.test(url);
  }

  /**
   * Listener onCompleted — qualquer recurso que completa = atividade de rede.
   */
  function onCompleted() {
    if (stopped) return;
    lastActivityAt = Date.now();
  }

  /**
   * Listener onErrorOccurred — registra falhas, especialmente SWFs.
   */
  function onErrorOccurred(details) {
    if (stopped) return;
    lastActivityAt = Date.now();
    if (isSwf(details.url)) {
      swfErrors.push(Date.now());
      logger.warn(
        'StallDetector: SWF falhou — ' +
          (details.url || '').slice(0, 120) +
          ' (erro: ' +
          (details.error || 'unknown') +
          ') — ' +
          profileName
      );
    }
  }

  /**
   * Poll principal — roda a cada pollIntervalMs, checa condições de stall.
   */
  function check() {
    if (stopped || ready) return;
    if (win.isDestroyed()) {
      detach();
      return;
    }

    var now = Date.now();

    // Limpa entradas antigas
    swfErrors = swfErrors.filter(function (t) {
      return now - t < opts.swfErrorWindowMs;
    });
    retries = retries.filter(function (t) {
      return now - t < opts.retryWindowMs;
    });

    // ── Check: jogo pronto? ──
    // Após readyAfterMs de atividade contínua sem stall, consideramos carregado.
    if (now - startedAt > opts.readyAfterMs && now - lastActivityAt < opts.stallThresholdMs) {
      ready = true;
      logger.info(
        'StallDetector: jogo pronto após ' +
          Math.round((now - startedAt) / 1000) +
          's — monitoramento encerrado — ' +
          profileName
      );
      detach();
      return;
    }

    // ── Check: limite de retries atingido? ──
    if (retries.length >= opts.maxRetries) {
      logger.error(
        'StallDetector: limite de auto-reload atingido (' +
          opts.maxRetries +
          ' em ' +
          Math.round(opts.retryWindowMs / 60000) +
          'min) — ' +
          profileName +
          ' — DESISTINDO (servidor pode estar fora do ar)'
      );
      detach();
      return;
    }

    // ── Check: burst de falhas de SWF? ──
    if (swfErrors.length >= opts.swfErrorThreshold) {
      triggerStall(
        'burst de falhas SWF (' +
          swfErrors.length +
          ' em ' +
          Math.round(opts.swfErrorWindowMs / 1000) +
          's)'
      );
      return;
    }

    // ── Check: inatividade de rede? ──
    var inactiveFor = now - lastActivityAt;
    if (inactiveFor > opts.stallThresholdMs) {
      triggerStall('sem atividade de rede por ' + Math.round(inactiveFor / 1000) + 's');
      return;
    }
  }

  /**
   * Dispara o stall: loga, registra retry, chama onStall.
   */
  function triggerStall(reason) {
    if (stopped || ready) return;
    var attemptNum = retries.length + 1;
    logger.warn(
      'StallDetector: STALL detectado — ' +
        reason +
        ' — ' +
        profileName +
        ' — auto-reload #' +
        attemptNum +
        '/' +
        opts.maxRetries
    );
    retries.push(Date.now());
    // Reset activity + errors pra não re-trigger imediatamente no próximo poll
    lastActivityAt = Date.now();
    swfErrors = [];
    try {
      onStall();
    } catch (e) {
      logger.error('StallDetector: onStall callback lançou erro: ' + e.message);
    }
  }

  /**
   * Desanexa listeners + limpa interval.
   * IMPORTANTE: 'stopped' flag torna os handlers inertes. Mesmo que não
   * consigamos remover o listener do webRequest (Electron 11 API limitada),
   * o handler checka 'stopped' no topo e retorna imediatamente — sem leak
   * de CPU ou side-effects.
   */
  function detach() {
    if (stopped) return;
    stopped = true;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    // Tenta remover listeners com o filtro armazenado. Electron 11's
    // webRequest.onCompleted/onErrorOccurred(null) remove TODOS os
    // listeners da session — isso é perigoso com múltiplas janelas.
    // Passamos o filtro específico se disponível.
    try {
      var filters = _sessionFilters.get(ses);
      if (filters) {
        ses.webRequest.onCompleted(filters, null);
        ses.webRequest.onErrorOccurred(filters, null);
        _sessionFilters.delete(ses);
      }
    } catch (_) {
      // Session pode já estar destruída — 'stopped' garante handlers são no-op
    }
  }

  // ── Inicialização ──
  // Armazena filtro para remoção precisa no detach. Se a session tiver
  // outros StallDetectors (múltiplas janelas na mesma partition), não
  // os afetaremos — cada um remove apenas seu próprio filtro.
  var _filter = { urls: ['<all_urls>'] };
  _sessionFilters.set(ses, _filter);
  ses.webRequest.onCompleted(_filter, onCompleted);
  ses.webRequest.onErrorOccurred(_filter, onErrorOccurred);
  pollInterval = setInterval(check, opts.pollIntervalMs);
  if (pollInterval.unref) pollInterval.unref();

  logger.info(
    'StallDetector: monitorando — ' +
      profileName +
      ' (stall=' +
      opts.stallThresholdMs / 1000 +
      's, swfBurst=' +
      opts.swfErrorThreshold +
      ' em ' +
      opts.swfErrorWindowMs / 1000 +
      's, maxRetry=' +
      opts.maxRetries +
      ')'
  );

  return {
    detach: detach,
    // exposto pra testes/inspeção
    _isReady: function () {
      return ready;
    },
    _isStopped: function () {
      return stopped;
    },
    _getRetryCount: function () {
      return retries.length;
    }
  };
}

module.exports = {
  attach: attach,
  DEFAULTS: DEFAULTS
};
