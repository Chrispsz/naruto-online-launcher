/**
 * Game Server Cluster Configuration
 * 6-cluster model (br/na/de/es/pl/fr)
 *
 * The launcher recognizes 6 real Naruto Online server clusters, each with its
 * own language and event schedule:
 *   br — Brasil          (PT)  — America/Sao_Paulo (UTC-3)
 *   na — North America   (EN)  — America/New_York  (UTC-5/-4 DST)
 *   de — Deutschland     (DE)  — Europe/Berlin     (UTC+1/+2 DST)
 *   es — España          (ES)  — Europe/Madrid     (UTC+1/+2 DST)
 *   pl — Polska          (PL)  — Europe/Warsaw     (UTC+1/+2 DST)
 *   fr — France          (FR)  — Europe/Paris      (UTC+1/+2 DST)
 *
 * Legacy compatibility:
 *   eu — merged into `na` (EU was a redundant EN cluster sharing NA servers)
 *   hk — merged into `na` (HK zh cluster DNS-dead since 2024)
 *   pt — legacy language code → maps to `br`
 *   en — legacy language code → maps to `na`
 *
 * Old profiles with eu/hk/pt/en region codes are auto-migrated on load by
 * `profiles/store.js` via `normalizeRegion()`.
 */

'use strict';

// flag field is a [XX] text tag (not emoji) — regional-indicator flag
// emojis don't render on Windows. The UI uses inline SVG flags (app.js FLAG_SVG);
// this text tag is only for backend logs/notifications where SVG can't be used.
const REGIONS = {
  br: { name: 'Brasil', name_en: 'Brazil', flag: '[BR]', language: 'pt' },
  na: { name: 'América do Norte', name_en: 'North America', flag: '[NA]', language: 'en' },
  de: { name: 'Deutschland', name_en: 'Germany', flag: '[DE]', language: 'de' },
  es: { name: 'España', name_en: 'Spain', flag: '[ES]', language: 'es' },
  pl: { name: 'Polska', name_en: 'Poland', flag: '[PL]', language: 'pl' },
  fr: { name: 'France', name_en: 'France', flag: '[FR]', language: 'fr' }
};

// Legacy region codes that are accepted but auto-migrated to a current cluster.
const LEGACY_MIGRATION = {
  eu: 'na', // EU was a redundant EN cluster sharing NA servers
  hk: 'na', // HK zh cluster DNS-dead since 2024
  pt: 'br', // legacy language code used as region in v4.x
  en: 'na'  // legacy language code used as region in v4.x
};

/**
 * Check if a region code is valid (either a current cluster or a legacy code).
 * Legacy codes are accepted so old profiles load without error; they are
 * normalized to a current cluster via normalizeRegion().
 * @param {string} code - Region code
 * @returns {boolean}
 */
function isValidRegion(code) {
  if (typeof code !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(REGIONS, code) ||
    Object.prototype.hasOwnProperty.call(LEGACY_MIGRATION, code);
}

/**
 * Check if a region code is a current cluster (not legacy).
 * @param {string} code
 * @returns {boolean}
 */
function isCurrentRegion(code) {
  return typeof code === 'string' &&
    Object.prototype.hasOwnProperty.call(REGIONS, code);
}

/**
 * Normalize a region code: legacy codes are mapped to current clusters.
 * Current codes pass through unchanged. Unknown codes return the default.
 * @param {string} code
 * @returns {string} a current cluster code
 */
function normalizeRegion(code) {
  if (typeof code !== 'string') return getDefaultRegion();
  if (Object.prototype.hasOwnProperty.call(REGIONS, code)) return code;
  if (Object.prototype.hasOwnProperty.call(LEGACY_MIGRATION, code)) {
    return LEGACY_MIGRATION[code];
  }
  return getDefaultRegion();
}

/**
 * Get the default region code.
 * @returns {string}
 */
function getDefaultRegion() {
  return 'br';
}

module.exports = {
  REGIONS: REGIONS,
  isValidRegion: isValidRegion,
  isCurrentRegion: isCurrentRegion,
  normalizeRegion: normalizeRegion,
  getDefaultRegion: getDefaultRegion
};
