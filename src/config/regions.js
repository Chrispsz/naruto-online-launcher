/**
 * Configuração de Regiões
 */

'use strict';

const REGIONS = {
  'pt': { name: 'Portugu\u00EAs', flag: '\u{1F1E7}\u{1F1F7}' },
  'en': { name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  'fr': { name: 'Fran\u00E7ais', flag: '\u{1F1EB}\u{1F1F7}' },
  'de': { name: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}' },
  'es': { name: 'Espa\u00F1ol', flag: '\u{1F1EA}\u{1F1F8}' },
  'pl': { name: 'Polski', flag: '\u{1F1F5}\u{1F1F1}' }
};

const REGION_CODES = Object.keys(REGIONS);

function isValidRegion(code) {
  return Object.prototype.hasOwnProperty.call(REGIONS, code);
}

function getDefaultRegion() {
  return 'pt';
}

module.exports = {
  REGIONS,
  REGION_CODES,
  isValidRegion,
  getDefaultRegion
};
