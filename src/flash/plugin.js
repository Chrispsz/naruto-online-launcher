/**
 * Flash PPAPI Detection and Configuration
 * v3.0.0 - Clean Flash PPAPI configuration
 *
 * v4.9.3 (Phase 2): findFlashPlugin() also searches the on-demand cache
 * (userData/flash-cache/) para backward-compat com installs antigas.
 * O binário principal é committed no repo em flash/.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('../utils/logger');

// Minimum valid Flash binary size (1MB) — smaller files are likely corrupted or placeholders
const MIN_FLASH_SIZE = 1 * 1024 * 1024;

// Fallback versions if manifest doesn't exist
const FLASH_VERSIONS = {
  win32: '34.0.0.376',
  linux: '34.0.0.137'
};

const FLASH_PLUGIN_NAMES = {
  win32: 'pepflashplayer.dll',
  linux: 'libpepflashplayer.so'
};

/**
 * Auto-detect Flash version via manifest.json (exported for main/flags.js).
 * @param {string} flashDir - Directory containing manifest.json
 * @returns {string} Flash version string
 */
function getFlashVersion(flashDir) {
  try {
    const manifestPath = path.join(flashDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (process.platform === 'linux' && manifest.linux_version) {
        return manifest.linux_version;
      }
      if (manifest.version) {
        return manifest.version;
      }
    }
  } catch (e) {
    logger.debug('Failed to read manifest.json: ' + e.message);
  }
  return FLASH_VERSIONS[process.platform] || '34.0.0.0';
}

/**
 * Search for Flash PPAPI binary across multiple paths
 * @returns {string|null} Path to Flash binary, or null if not found
 */
function findFlashPlugin() {
  const platform = process.platform;

  if (platform !== 'win32' && platform !== 'linux') {
    logger.warn('Unsupported platform for Flash');
    return null;
  }

  const pluginName = FLASH_PLUGIN_NAMES[platform];

  // Robust search paths for ASAR, portable, dev modes, AND on-demand cache.
  // v4.9.3: userData/flash-cache/ mantido para backward-compat (installs antigas).
  const searchPaths = [
    path.join(process.resourcesPath, 'flash', pluginName),
    path.join(path.dirname(app.getPath('exe')), 'flash', pluginName),
    path.join(app.getAppPath().replace(/\.asar$/, ''), 'flash', pluginName),
    path.join(process.cwd(), 'flash', pluginName),
    path.join(__dirname, '..', '..', 'flash', pluginName),
    path.join(app.getPath('userData'), 'flash-cache', pluginName)
  ];

  const uniquePaths = [];
  const seen = {};
  for (let i = 0; i < searchPaths.length; i++) {
    if (!seen[searchPaths[i]]) {
      seen[searchPaths[i]] = true;
      uniquePaths.push(searchPaths[i]);
    }
  }

  logger.info('Searching for Flash PPAPI in:');
  for (let j = 0; j < uniquePaths.length; j++) {
    logger.info('  → ' + uniquePaths[j]);
    try {
      if (fs.existsSync(uniquePaths[j])) {
        const stats = fs.statSync(uniquePaths[j]);
        if (stats.size > MIN_FLASH_SIZE) {
          logger.info(
            '✅ Flash found: ' +
              uniquePaths[j] +
              ' (' +
              (stats.size / 1024 / 1024).toFixed(1) +
              'MB)'
          );
          return uniquePaths[j];
        } else {
          logger.warn('File too small: ' + uniquePaths[j] + ' (' + stats.size + ' bytes)');
        }
      }
    } catch (err) {
      logger.debug('Error: ' + uniquePaths[j] + ': ' + err.message);
    }
  }

  logger.error('❌ Flash PPAPI NOT found!');
  logger.error('Paths tested:\n  ' + uniquePaths.join('\n  '));
  return null;
}

module.exports = {
  findFlashPlugin: findFlashPlugin,
  getFlashVersion: getFlashVersion
};
