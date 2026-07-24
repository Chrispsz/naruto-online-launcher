/**
 * Hardware Profile Configuration
 * v1.1.0
 */

'use strict';

const HARDWARE_PROFILES = {
  modern: {
    name: 'Moderno',
    description: 'RX 6000+, RTX 3000+, GTX 1600+',
    icon: '\u{1F680}'
  },
  legacy: {
    name: 'Antigo',
    description: 'GTX 900/1000, Radeon HD/RX 500, Intel HD',
    icon: '\u{1F527}'
  },
  cpu: {
    name: 'CPU Only',
    description: 'Sem GPU dedicada ou problemas de GPU',
    icon: '\u{1F4BB}'
  }
};

/**
 * Check if a hardware profile code is valid
 * @param {string} code - Profile code
 * @returns {boolean}
 */
function isValidProfile(code) {
  return Object.prototype.hasOwnProperty.call(HARDWARE_PROFILES, code);
}

/**
 * Get the default hardware profile code
 * @returns {string}
 */
function getDefaultProfile() {
  return 'modern';
}

module.exports = {
  isValidProfile: isValidProfile,
  getDefaultProfile: getDefaultProfile
};
