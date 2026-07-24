/**
 * main/debug.js — SHINOBI_DEBUG feature flag (Decision B / Phase 3)
 *
 * Two layers of isolation for debug/test code:
 *   1. (git) Branch `debug` — código experimental fica lá, nunca merge em main
 *      sem aprovação. `main` = sempre release-ready.
 *   2. (runtime) Esta feature flag — esconde UI de debug na build final.
 *
 * ACTIVATION (two paths):
 *   - Variável de ambiente:  SHINOBI_DEBUG=1 ./Naruto-Online.AppImage
 *   - Atalho secreto na UI:  segurar Ctrl+Shift+D por 2s na tela principal
 *     (tratado no renderer; veja ui/index.html).
 *
 * PERFORMANCE:
 *   DEBUG is resolved once at boot from process.env.SHINOBI_DEBUG.
 *   Código debug deve ser envolto em `if (DEBUG)` — o bundler/Engine pode
 *   dead-code-eliminate when false (zero overhead when disabled).
 *
 * preload expõe `window.__SHINOBI_DEBUG__` (boolean) para o renderer.
 */

'use strict';

const DEBUG = process.env.SHINOBI_DEBUG === '1' || process.env.SHINOBI_DEBUG === 'true';

module.exports = {
  DEBUG: DEBUG
};
