/**
 * config/optimization.js — Presets de Otimização (v1.0.0)
 *
 * Responsabilidade ÚNICA: definir os 3 presets (Performance / Balanced / Quality)
 * e suas configurações específicas. Aplicados em main/flags.js + CpuOptimizer.js.
 *
 * PRESETS:
 *   Os presets controlam apenas: nome, descrição, ícone e cor para a UI.
 *   A lógica REAL de otimização (CPU affinity, nice, OOM) é hardcoded em
 *   CpuOptimizer.optimizeRenderer() baseado no preset STRING, não nos campos
 *   deste objeto. As env vars de GPU são aplicadas via GpuDetector.getEnvVars()
 *   em main.js antes de app.whenReady().
 *
 *   - performance: máx FPS, fixa CPU em P-cores, nice=-5, OOM protection,
 *                  env vars GPU (NVIDIA threaded opts, PRIME offload, etc.).
 *                  Trade-off: mais consumo de energia, fan mais alto, PC esquenta.
 *
 *   - balanced:    padrão. CPU em P-cores, nice=0, OOM protection.
 *                  Trade-off: nenhum. Recomendado para maioria dos users.
 *
 *   - quality:     máxima compatibilidade. Sem CPU affinity (scheduler decide),
 *                  nice=+5 (cede prioridade a outras apps), sem OOM protection.
 *                  Trade-off: menos FPS em PCs fracos. Recomendado para quem
 *                  roda o jogo em segundo plano enquanto trabalha.
 */

'use strict';

const PRESETS = {
  performance: {
    name: 'Performance',
    description: 'Máximo FPS • CPU em P-cores • Prioridade alta',
    icon: '\u{1F680}',
    color: '#DC2626'
  },

  balanced: {
    name: 'Balanceado',
    description: 'Padrão • CPU em P-cores • Estável',
    icon: '\u{2696}\u{FE0F}',
    color: '#10B981'
  },

  quality: {
    name: 'Qualidade',
    description: 'Compatibilidade • Cede prioridade • Sem affinity • Multitarefa',
    icon: '\u{1F33F}',
    color: '#3B82F6'
  }
};

const PRESET_CODES = Object.keys(PRESETS);

/**
 * Valida um código de preset.
 * @param {string} code
 * @returns {boolean}
 */
function isValidPreset(code) {
  return Object.prototype.hasOwnProperty.call(PRESETS, code);
}

/**
 * Retorna o preset padrão.
 * @returns {string}
 */
function getDefaultPreset() {
  return 'balanced';
}

/**
 * Lista presets formatados para UI.
 * @returns {Array<{code, name, description, icon, color}>}
 */
function listForUI() {
  return PRESET_CODES.map(function (code) {
    const p = PRESETS[code];
    return {
      code: code,
      name: p.name,
      description: p.description,
      icon: p.icon,
      color: p.color
    };
  });
}

module.exports = {
  isValidPreset: isValidPreset,
  getDefaultPreset: getDefaultPreset,
  listForUI: listForUI
};
