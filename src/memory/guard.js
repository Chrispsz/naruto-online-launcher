/**
 * memory/guard.js — FACADE (Fase 3f split)
 *
 * Era o God Object (436 linhas). Agora é uma facade fina que compõe:
 *   - MemoryGuard.js  — monitor de RSS + estado + registry de webviews
 *   - GcDaemon.js     — daemon periódico + collect() + FIX BLACK SCREEN
 *
 * A facade preserva a API pública histórica para que main.js, controller.js
 * e manager.js não precisem mudar. Internamente delega aos dois módulos.
 *
 * Para código novo, prefira importar MemoryGuard/GcDaemon diretamente.
 */

'use strict';

const MemoryGuard = require('./MemoryGuard');
const GcDaemon = require('./GcDaemon');

module.exports = Object.assign({}, MemoryGuard, {
  // GcDaemon sobrescreve as 3 funções de daemon/collect do MemoryGuard
  collect: GcDaemon.collect,
  start: GcDaemon.start,
  // stop only needs to stop the GcDaemon — the webview-GC no-ops were removed
  // in v4.9.1 (window.gc() in the renderer caused black screens in Flash).
  stop: function () {
    GcDaemon.stop();
  }
});
