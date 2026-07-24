/**
 * main/debug.js — SHINOBI_DEBUG feature flag (Decision B / Phase 3)
 *
 * Two layers of isolation for debug/test code:
 *   1. (git) Branch `debug` — experimental code lives there, never merged into main
 *      without approval. `main` = always release-ready.
 *   2. (runtime) Esta feature flag — esconde UI de debug na build final.
 *
 * ACTIVATION (two paths):
 *   - Environment variable:  SHINOBI_DEBUG=1 ./Naruto-Online.AppImage
 *   - Atalho secreto na UI:  segurar Ctrl+Shift+D por 2s na tela principal
 *     (tratado no renderer; veja ui/index.html).
 *
 * PERFORMANCE:
 *   DEBUG is resolved once at boot from process.env.SHINOBI_DEBUG.
 *   Debug code should be wrapped in `if (DEBUG)` — the bundler/Engine can
 *   dead-code-eliminate when false (zero overhead when disabled).
 *
 * preload exposes `window.__SHINOBI_DEBUG__` (boolean) to the renderer.
 */

'use strict';

const DEBUG = process.env.SHINOBI_DEBUG === '1' || process.env.SHINOBI_DEBUG === 'true';

module.exports = {
  DEBUG: DEBUG
};
