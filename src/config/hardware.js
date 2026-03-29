/**
 * Perfis de Hardware
 */

'use strict';

const HARDWARE_PROFILES = {
  'modern': {
    name: 'Moderno',
    description: 'RX 6000+, RTX 3000+, GTX 1600+',
    icon: '\u{1F680}'
  },
  'legacy': {
    name: 'Antigo',
    description: 'GTX 900/1000, Radeon HD/RX 500, Intel HD',
    icon: '\u{1F527}'
  },
  'cpu': {
    name: 'CPU Only',
    description: 'Sem GPU dedicada ou problemas de GPU',
    icon: '\u{1F4BB}'
  }
};

const PROFILE_CODES = Object.keys(HARDWARE_PROFILES);

function isValidProfile(code) {
  return Object.prototype.hasOwnProperty.call(HARDWARE_PROFILES, code);
}

function getDefaultProfile() {
  return 'modern';
}

module.exports = {
  HARDWARE_PROFILES,
  PROFILE_CODES,
  isValidProfile,
  getDefaultProfile
};
