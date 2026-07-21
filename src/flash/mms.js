/**
 * Gerenciamento do mms.cfg (Flash Config)
 * v1.2.0
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('../utils/logger');

/**
 * Get the path to mms.cfg for the current platform
 * @returns {string} Absolute path to mms.cfg
 */
function getMmsCfgPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
    return path.join(appData, 'Macromedia', 'Flash Player', 'mms.cfg');
  } else {
    const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
    return path.join(home, '.macromedia', 'Flash_Player', 'mms.cfg');
  }
}

/**
 * Generate mms.cfg content
 *
 * v5.20.0: HONEST AUDIT — only Adobe-documented mms.cfg keys for PPAPI
 * Flash Player 34 are emitted. Previously this file contained placebo keys
 * (StageQuality, OverrideFPS, EnableSockets, FontSmoothingType, plus a
 * duplicate DisableHardwareAcceleration) that PPAPI silently ignores —
 * they are HTML embed params or AS3 properties, NOT mms.cfg keys.
 *
 * Real, verified mms.cfg keys for PPAPI Flash Player 34:
 *   - OverrideGPUValidation   (forces GPU driver validation bypass)
 *   - EnableHardwareAcceleration (0/1 — controls Flash HW accel)
 *   - AssetCacheSize          (Flash asset cache in MB, 0 disables)
 *   - AutoUpdateDisable       (disables Flash auto-updater)
 *
 * What lowpc mode CAN actually do (real effects):
 *   - Drop the asset cache to 0 MB → less RAM, forces re-download of assets
 *   - Force software rendering (EnableHardwareAcceleration=0) → unloads GPU
 *
 * What lowpc mode CANNOT do (controlled by the game's AS3 code, not mms.cfg):
 *   - Lower the StageQuality (that's an AS3 property / HTML embed param)
 *   - Cap the FPS (that's stage.frameRate in AS3)
 *   - Toggle sockets (that's crossdomain.xml policy)
 *
 * @param {string} hardwareProfile - 'modern', 'legacy', or 'cpu'
 * @param {Object} [opts] - { advancedMode: boolean }
 * @returns {string} mms.cfg file content
 */
function generateMmsContent(hardwareProfile, opts) {
  const isCpuMode = hardwareProfile === 'cpu';
  const advancedMode = !!(opts && opts.advancedMode);

  const config = [
    // Force GPU driver validation bypass — works around buggy GPU drivers.
    'OverrideGPUValidation=1',
    // Toggle Flash hardware acceleration. cpu profile + lowpc both force
    // software rendering to unload a weak/broken GPU.
    isCpuMode || advancedMode
      ? 'EnableHardwareAcceleration=0'
      : 'EnableHardwareAcceleration=1'
  ];

  // ── Low-end PC mode: only REAL mms.cfg effects ──
  // Drops the Flash asset cache to 0 MB (less RAM, re-downloads assets)
  // and disables the Flash auto-updater (cosmetic — PPAPI standalone doesn't
  // auto-update anyway, but the key is harmless and documented).
  if (advancedMode) {
    config.push('AssetCacheSize=0', 'AutoUpdateDisable=1');
  }

  return config.join('\n');
}

/**
 * Create mms.cfg with backup of existing file
 * @param {string} hardwareProfile - Hardware profile name
 * @param {Object} [opts] - v3.5: { advancedMode: boolean }
 * @returns {boolean} True if successful
 */
function createMmsCfg(hardwareProfile, opts) {
  if (!hardwareProfile) hardwareProfile = 'modern';

  try {
    const cfgPath = getMmsCfgPath();
    const dir = path.dirname(cfgPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug('Diretório criado: ' + dir);
    }

    if (fs.existsSync(cfgPath)) {
      const backupPath = cfgPath + '.bak';
      fs.copyFileSync(cfgPath, backupPath);
      logger.info('mms.cfg backup atualizado: ' + backupPath);
    }

    const content = generateMmsContent(hardwareProfile, opts);
    fs.writeFileSync(cfgPath, content, 'utf8');
    logger.info(
      'mms.cfg atualizado (' +
        hardwareProfile +
        (opts && opts.advancedMode ? ' + Advanced' : '') +
        ')'
    );
    return true;
  } catch (e) {
    logger.error('Falha ao criar mms.cfg: ' + e.message);
    return false;
  }
}

/**
 * Restore mms.cfg backup on exit
 * @returns {boolean} True if backup was restored
 */
function restoreMmsCfg() {
  try {
    const cfgPath = getMmsCfgPath();
    const backupPath = cfgPath + '.bak';

    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, cfgPath);
      fs.unlinkSync(backupPath);
      logger.info('mms.cfg restaurado do backup');
      return true;
    }
  } catch (e) {
    logger.warn('Falha ao restaurar mms.cfg: ' + e.message);
  }
  return false;
}

module.exports = {
  createMmsCfg: createMmsCfg,
  restoreMmsCfg: restoreMmsCfg
};
