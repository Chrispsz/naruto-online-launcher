/**
 * Configuration Loading and Saving
 * Window bounds persistence, async file operations
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const logger = require('../utils/logger');
const { isValidRegion, normalizeRegion, getDefaultRegion } = require('./regions');
const { isValidProfile, getDefaultProfile } = require('./hardware');
const { isValidPreset, getDefaultPreset } = require('./optimization');

/**
 * Get the configuration file path
 * @returns {string} Absolute path to config.json
 */
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

/**
 * Validate and sanitize configuration values
 * @param {Object} rawConfig - Raw configuration from file
 * @returns {Object} Validated configuration
 */
function validateConfig(rawConfig) {
  const region = rawConfig && rawConfig.region;
  const hardwareProfile = rawConfig && rawConfig.hardwareProfile;
  // Backward-compat: migrate legacy forceBatata → forceLowSpec
  const forceLowSpec = rawConfig
    ? rawConfig.forceLowSpec !== undefined
      ? rawConfig.forceLowSpec
      : rawConfig.forceBatata
    : undefined;

  const optimizationPreset = rawConfig && rawConfig.optimizationPreset;

  const validated = {
    region: isValidRegion(region) ? normalizeRegion(region) : getDefaultRegion(),
    hardwareProfile: isValidProfile(hardwareProfile) ? hardwareProfile : getDefaultProfile(),
    forceLowSpec: forceLowSpec === true ? true : forceLowSpec === false ? false : undefined,
    mutedEvents: rawConfig && rawConfig.mutedEvents === true,
    windowBounds: (rawConfig && rawConfig.windowBounds) || null,
    // skip firstBoot setup wizard — defaults are sensible (EN + balanced preset).
    // Setting firstBoot=false means setup.html is never shown on first launch.
    firstBoot: rawConfig && rawConfig.firstBoot === false ? false : false,
    // EN is the default (more global). PT remains as alternative.
    // Legacy configs with 'pt' are preserved; invalid values fall back to 'en'.
    language:
      rawConfig && ['pt', 'en'].indexOf(rawConfig.language) !== -1 ? rawConfig.language : 'en',
    advancedMode: rawConfig && rawConfig.advancedMode === true, // Advanced Light Mode (Flash low quality)
    // optimization preset (performance/balanced/quality) — applied in flags.js
    optimizationPreset: isValidPreset(optimizationPreset) ? optimizationPreset : getDefaultPreset()
  };

  if (region !== undefined && !isValidRegion(region)) {
    logger.warn('Invalid region: ' + region + ', using default: ' + validated.region);
  }
  if (hardwareProfile !== undefined && !isValidProfile(hardwareProfile)) {
    logger.warn(
      'Invalid hardware profile: ' + hardwareProfile + ', using default: ' + validated.hardwareProfile
    );
  }

  return validated;
}

/**
 * Load configuration from disk, falling back to defaults
 * @returns {Object} Configuration object
 */
function loadConfig() {
  const configPath = getConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      logger.info('Using default configuration (first run)');
      return validateConfig({});
    }

    // Reject unreasonably large config files (prevent OOM on corruption)
    var stat = fs.statSync(configPath);
    if (stat.size > 1 * 1024 * 1024) {
      logger.error('Config file too large (' + stat.size + ' bytes), using defaults');
      return validateConfig({});
    }

    const rawContent = fs.readFileSync(configPath, 'utf8');
    let rawConfig;

    try {
      rawConfig = JSON.parse(rawContent);
    } catch (parseError) {
      logger.error('Invalid JSON in config, using defaults: ' + parseError.message);
      return validateConfig({});
    }

    const config = validateConfig(rawConfig);
    logger.info('Config loaded: region=' + config.region + ', profile=' + config.hardwareProfile);

    return config;
  } catch (e) {
    logger.error('Failed to load config, using defaults: ' + e.message);
    return validateConfig({});
  }
}

/**
 * Save configuration to disk (atomic write via tmp + rename)
 * @param {Object} config - Configuration object
 * @returns {boolean} True if saved successfully
 */
function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    const content = JSON.stringify(
      {
        region: config.region,
        hardwareProfile: config.hardwareProfile,
        forceLowSpec: config.forceLowSpec,
        mutedEvents: config.mutedEvents,
        windowBounds: config.windowBounds || null,
        firstBoot: false,
        language: config.language || 'en',
        advancedMode: config.advancedMode === true,
        // optimization preset
        optimizationPreset: config.optimizationPreset || getDefaultPreset()
      },
      null,
      2
    );

    const tmpPath = configPath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, configPath);
    logger.info('Config saved');
    return true;
  } catch (e) {
    logger.error('Failed to save config: ' + e.message);
    return false;
  }
}

module.exports = {
  loadConfig: loadConfig,
  saveConfig: saveConfig,
  validateConfig: validateConfig
};
