/**
 * app/FlashUpdater.js — Clean Flash PPAPI fallback downloader + cache
 * v1.1.0 (Flash EOL — binaries now COMMITTED to repo; this is fallback only)
 *
 * FILOSOFIA (atualizada v5.9.2):
 *   Flash é EOL (end-of-life) e nunca mais vai mudar. Os binários PPAPI
 *   (libpepflashplayer.so + pepflashplayer.dll) agora são COMMITTED ao
 *   repo em flash/. O findFlashPlugin() em flash/plugin.js os encontra
 *   automaticamente — este FlashUpdater só é chamado em caso de binários
 *   missing (raro: usuário deletou, instalação corrompida).
 *
 *   Como fallback de emergência, ainda tenta baixar do darktohka/clean-flash-builds:
 *     Windows: ChineseFlash-Patched-Win-<ver>.7z  (v1.54 = 34.0.0.376)
 *     Linux:   flash_player_patched_ppapi_linux.x86_64.tar.gz  (v1.7 = 34.0.0.137, última com asset Linux)
 *
 * BOOT FLOW (orquestrado por main.js):
 *   1. findFlashPlugin() acha binário committed em flash/ → boot normal.
 *   2. Só se NÃO achar (corrompido/deletado): abre loading window →
 *      FlashUpdater.ensureLatest() → download + extração → relaunch.
 *
 * SOURCE canônico:
 *   Windows: https://github.com/darktohka/clean-flash-builds/releases/tag/v1.54
 *   Linux:   https://github.com/darktohka/clean-flash-builds/releases/tag/v1.7
 *   (Linux "latest" tag NÃO tem asset Linux — v1.7 é a última com asset Linux PPAPI)
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');
const logger = require('../utils/logger');

// ── Constants ────────────────────────────────────────────────────────────────

// Flash EOL: pinamos tags específicas em vez de "latest" (que não tem asset Linux).
// v1.7 = última release com asset Linux PPAPI (34.0.0.137).
// v1.54 = release mais recente com asset Windows PPAPI (34.0.0.376).
const PINNED_RELEASES = {
  linux: {
    tag: 'v1.7',
    apiPath: '/repos/darktohka/clean-flash-builds/releases/tags/v1.7',
    assetMatch: /flash_player_patched_ppapi_linux\.x86_64\.tar\.gz$/i
  },
  win32: {
    tag: 'v1.54',
    apiPath: '/repos/darktohka/clean-flash-builds/releases/tags/v1.54',
    assetMatch: /ChineseFlash-Patched-Win-.*\.7z$/i
  }
};

const API_HOST = 'api.github.com';
const USER_AGENT =
  'Shinobi-Launcher-FlashUpdater/1.1 (+https://github.com/Chrispsz/naruto-online-launcher)';

const CACHE_SUBDIR = 'flash-cache';
const CACHE_MANIFEST = 'cache-manifest.json';
const STALE_DAYS = 7;
const DOWNLOAD_TIMEOUT_MS = 120000; // 2 min p/ asset de 17MB em rede lenta

const PLUGIN_NAMES = {
  linux: 'libpepflashplayer.so',
  win32: 'pepflashplayer.dll'
};

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Diretório de cache: userData/flash-cache/
 * Disponível antes de app.ready.
 * @returns {string}
 */
function getCacheDir() {
  return path.join(app.getPath('userData'), CACHE_SUBDIR);
}

/**
 * Path do binário plugin cacheado para a plataforma atual.
 * @returns {string}
 */
function getCachedPluginPath() {
  return path.join(getCacheDir(), PLUGIN_NAMES[process.platform] || PLUGIN_NAMES.linux);
}

/**
 * Path do manifest do cache (version + downloadDate).
 * @returns {string}
 */
function getCacheManifestPath() {
  return path.join(getCacheDir(), CACHE_MANIFEST);
}

// ── Cache queries ────────────────────────────────────────────────────────────

/**
 * Lê o cache-manifest.json. Retorna null se ausente/inválido.
 * @returns {Object|null} { version, downloadDate, assetName }
 */
function getCacheInfo() {
  try {
    const p = getCacheManifestPath();
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data || !data.downloadDate) return null;
    return data;
  } catch (_) {
    return null;
  }
}

/**
 * Verifica se o binário cacheado existe E é maior que MIN_SIZE (não corrompido).
 * @returns {boolean}
 */
function hasCachedPlugin() {
  try {
    const p = getCachedPluginPath();
    if (!fs.existsSync(p)) return false;
    const stat = fs.statSync(p);
    return stat.size > 1024 * 1024; // >1MB
  } catch (_) {
    return false;
  }
}

/**
 * Cache está stale (mais de STALE_DAYS dias)?
 * @returns {boolean}
 */
function isCacheStale() {
  const info = getCacheInfo();
  if (!info) return true;
  const ageMs = Date.now() - new Date(info.downloadDate).getTime();
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

// ── GitHub API ───────────────────────────────────────────────────────────────

/**
 * Fetch JSON do GitHub API para a release PINNADA da plataforma.
 * Flash EOL: usamos tags fixas (v1.7 Linux, v1.54 Windows) em vez de "latest".
 * @param {string} [platform] - default process.platform
 * @returns {Promise<Object>} release object com assets[]
 */
function fetchLatestRelease(platform) {
  const plat = platform || process.platform;
  const pinned = PINNED_RELEASES[plat] || PINNED_RELEASES.win32;
  return new Promise(function (resolve, reject) {
    const req = https.get(
      {
        host: API_HOST,
        path: pinned.apiPath,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.github+json'
        },
        timeout: 30000
      },
      function (res) {
        // Follow redirect (GitHub API occasionally 302s)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https
            .get(
              res.headers.location,
              {
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
                timeout: 30000
              },
              function (r2) {
                _readJson(r2, resolve, reject);
              }
            )
            .on('error', reject)
            .on('timeout', function () {
              reject(new Error('GitHub API redirect timeout'));
            });
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error('GitHub API HTTP ' + res.statusCode + ' para ' + pinned.tag));
          return;
        }
        _readJson(res, resolve, reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', function () {
      req.destroy(new Error('GitHub API timeout'));
    });
  });
}

function _readJson(stream, resolve, reject) {
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', function (c) {
    body += c;
  });
  stream.on('end', function () {
    try {
      resolve(JSON.parse(body));
    } catch (e) {
      reject(new Error('GitHub API JSON inválido: ' + e.message));
    }
  });
  stream.on('error', reject);
}

/**
 * Encontra o asset correto para a plataforma atual no release PINNADO.
 *
 * Flash EOL (v5.9.2):
 *   Linux:   flash_player_patched_ppapi_linux.x86_64.tar.gz (v1.7, 34.0.0.137)
 *   Windows: ChineseFlash-Patched-Win-<ver>.7z              (v1.54, 34.0.0.376)
 *
 * @param {Object} release
 * @param {string} [platform] - default process.platform
 * @returns {Object|null} asset { name, browser_download_url, size }
 */
function pickAsset(release, platform) {
  const plat = platform || process.platform;
  const pinned = PINNED_RELEASES[plat];
  if (!pinned) return null;
  const assets = (release && release.assets) || [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (pinned.assetMatch.test(a.name || '')) return a;
  }
  return null;
}

// ── Download ─────────────────────────────────────────────────────────────────

/**
 * Baixa um asset via streaming para um arquivo temporário.
 * @param {string} url - browser_download_url
 * @param {string} destPath - caminho destino
 * @param {Function} [onProgress] - (percent 0-100, downloadedMB, totalMB)
 * @returns {Promise<string>} destPath
 */
function downloadAsset(url, destPath, onProgress) {
  return new Promise(function (resolve, reject) {
    const file = fs.createWriteStream(destPath);
    let total = 0;
    let contentLength = 0;
    let lastReport = 0;

    function doRequest(targetUrl) {
      const req = https.get(
        targetUrl,
        {
          headers: { 'User-Agent': USER_AGENT },
          timeout: DOWNLOAD_TIMEOUT_MS
        },
        function (res) {
          // Follow redirects (GitHub releases redirect to S3/codeload)
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume(); // drain
            return doRequest(res.headers.location);
          }
          if (res.statusCode !== 200) {
            file.close(function () {
              try {
                fs.unlinkSync(destPath);
              } catch (_) {
                /* ignore */
              }
            });
            reject(new Error('Download HTTP ' + res.statusCode));
            return;
          }
          contentLength = parseInt(res.headers['content-length'] || '0', 10);
          res.on('data', function (chunk) {
            total += chunk.length;
            const now = Date.now();
            // Throttle progress reports to 4/s
            if (onProgress && (now - lastReport > 250 || total === contentLength)) {
              lastReport = now;
              const pct =
                contentLength > 0 ? Math.min(100, Math.round((total / contentLength) * 100)) : 0;
              onProgress(pct, (total / 1048576).toFixed(1), (contentLength / 1048576).toFixed(1));
            }
          });
          res.pipe(file);
        }
      );
      req.on('error', function (err) {
        file.close(function () {
          try {
            fs.unlinkSync(destPath);
          } catch (_) {
            /* ignore */
          }
        });
        reject(err);
      });
      req.on('timeout', function () {
        req.destroy(new Error('Download timeout'));
      });
    }

    file.on('finish', function () {
      file.close(function () {
        resolve(destPath);
      });
    });
    file.on('error', function (err) {
      try {
        fs.unlinkSync(destPath);
      } catch (_) {
        /* ignore */
      }
      reject(err);
    });

    doRequest(url);
  });
}

// ── Extraction ───────────────────────────────────────────────────────────────

/**
 * Extrai o asset baixado para o diretório de cache.
 *   .7z  (Windows, formato atual darktohka) → 7z x, depois acha pepflashplayer.dll recursivamente
 *   .exe (InnoSetup legacy)                 → innoextract | 7z x
 *   .tar.xz (reserva linux)                 → tar -xJf
 *   .zip (Mac, reserva)                     → unzip
 * @param {string} archivePath
 * @param {string} destDir
 * @returns {Promise<void>}
 */
function extractAsset(archivePath, destDir) {
  return new Promise(function (resolve, reject) {
    const lower = archivePath.toLowerCase();
    if (lower.endsWith('.7z')) {
      // 7-zip archive (formato atual do darktohka Windows). Extrai e depois
      // localiza pepflashplayer.dll recursivamente (a estrutura interna varia).
      execFile('7z', ['x', '-o' + destDir, '-y', archivePath], { timeout: 60000 }, function (err) {
        if (err) reject(new Error('7z extraction failed: ' + (err.message || err)));
        else resolve();
      });
    } else if (lower.endsWith('.exe')) {
      // InnoSetup installer (legacy) — innoextract | 7z
      _tryExtractWin(archivePath, destDir, function (err) {
        if (err) reject(err);
        else resolve();
      });
    } else if (lower.endsWith('.tar.xz')) {
      execFile('tar', ['-xJf', archivePath, '-C', destDir], { timeout: 60000 }, function (err) {
        if (err) reject(new Error('tar extraction failed: ' + (err.message || err)));
        else resolve();
      });
    } else if (lower.endsWith('.zip')) {
      execFile('unzip', ['-o', archivePath, '-d', destDir], { timeout: 60000 }, function (err) {
        if (err) reject(new Error('unzip failed: ' + (err.message || err)));
        else resolve();
      });
    } else {
      reject(new Error('Formato de archive não suportado: ' + archivePath));
    }
  });
}

/**
 * Busca um arquivo pelo nome (case-insensitive) recursivamente num diretório.
 * Usado para achar pepflashplayer.dll dentro do .7z extraído (estrutura varia).
 * @param {string} dir
 * @param {string} targetName
 * @returns {string|null}
 */
function _findFileRecursive(dir, targetName) {
  const target = targetName.toLowerCase();
  let found = null;
  function walk(d) {
    if (found) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (let i = 0; i < entries.length; i++) {
      if (found) return;
      const e = entries[i];
      if (e.isFile() && e.name.toLowerCase() === target) {
        found = path.join(d, e.name);
      } else if (e.isDirectory()) {
        walk(path.join(d, e.name));
      }
    }
  }
  walk(dir);
  return found;
}

function _tryExtractWin(archivePath, destDir, cb) {
  // innoextract é mais limpo p/ InnoSetup, mas raramente instalado. 7z é comum.
  // 1. innoextract -d <dest> <archive>
  execFile('innoextract', ['-d', destDir, archivePath], { timeout: 60000 }, function (err1) {
    if (!err1) return cb(null);
    // 2. 7z x -o<dest> <archive>
    execFile('7z', ['x', '-o' + destDir, '-y', archivePath], { timeout: 60000 }, function (err2) {
      if (!err2) return cb(null);
      cb(
        new Error('Windows extraction failed (innoextract/7z ausentes): ' + (err2.message || err2))
      );
    });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Garante que o Clean Flash PPAPI mais recente está no cache.
 * Baixa + extrai + escreve cache-manifest.json. Retorna o path do plugin.
 *
 * @param {string} [platform] - process.platform (default atual)
 * @param {Function} [onProgress] - (percent, downloadedMB, totalMB, phase)
 * @returns {Promise<string>} caminho absoluto do binário plugin no cache
 */
async function ensureLatest(platform, onProgress) {
  const plat = platform || process.platform;
  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  // Verifica primeiro se binário committed existe em flash/ (caminho relativo ao app).
  // Se existir, copia pro cache e retorna — não precisa de download.
  try {
    const appPath = app.getAppPath().replace(/\.asar$/, '');
    const committedPath = path.join(appPath, 'flash', PLUGIN_NAMES[plat] || PLUGIN_NAMES.win32);
    if (fs.existsSync(committedPath)) {
      const stat = fs.statSync(committedPath);
      if (stat.size > 1024 * 1024) {
        const pluginPath = path.join(cacheDir, PLUGIN_NAMES[plat] || PLUGIN_NAMES.win32);
        if (!fs.existsSync(pluginPath)) {
          fs.copyFileSync(committedPath, pluginPath);
        }
        const manifest = {
          version: '34.0.0.' + (plat === 'linux' ? '137' : '376'),
          downloadDate: new Date().toISOString(),
          assetName: 'committed-binary',
          releaseTag: PINNED_RELEASES[plat] ? PINNED_RELEASES[plat].tag : null,
          source: 'repo-flash-dir'
        };
        fs.writeFileSync(getCacheManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
        logger.info('FlashUpdater: ✅ binário committed encontrado em flash/ — copiado ao cache');
        if (onProgress) onProgress(100, '', '', 'done');
        return pluginPath;
      }
    }
  } catch (e) {
    logger.debug(
      'FlashUpdater: binário committed não acessível (' + e.message + ') — tentando download'
    );
  }

  logger.info(
    'FlashUpdater: buscando release pinada do Clean Flash (' +
      (PINNED_RELEASES[plat] ? PINNED_RELEASES[plat].tag : plat) +
      ')...'
  );

  const release = await fetchLatestRelease(plat);
  const asset = pickAsset(release, plat);
  if (!asset) {
    throw new Error(
      'Nenhum asset Flash encontrado para plataforma "' +
        plat +
        '" no release ' +
        (release.tag_name || '?')
    );
  }
  logger.info(
    'FlashUpdater: release ' +
      (release.tag_name || '?') +
      ' → asset "' +
      asset.name +
      '" (' +
      (asset.size / 1048576).toFixed(1) +
      'MB)'
  );

  if (onProgress) onProgress(0, '0', (asset.size / 1048576).toFixed(1), 'download');

  const archivePath = path.join(cacheDir, asset.name);
  await downloadAsset(asset.browser_download_url, archivePath, function (pct, dl, tot) {
    if (onProgress) onProgress(pct, dl, tot, 'download');
  });

  if (onProgress)
    onProgress(
      100,
      (asset.size / 1048576).toFixed(1),
      (asset.size / 1048576).toFixed(1),
      'extract'
    );

  // Extrai para um subdiretório temporário (o .7z do Windows espalha muitos arquivos)
  const extractDir = path.join(cacheDir, '_extract');
  try {
    fs.rmSync(extractDir, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
  fs.mkdirSync(extractDir, { recursive: true });
  await extractAsset(archivePath, extractDir);

  // Limpa o archive temporário
  try {
    fs.unlinkSync(archivePath);
  } catch (_) {
    /* ignore */
  }

  // Localiza o plugin PPAPI extraído (estrutura interna do .7z varia) e move
  // para a raiz do cache, onde getCachedPluginPath() espera encontrá-lo.
  // Windows: o .7z tem pepflashplayer64_*.dll em flash64/ — precisamos achar
  // pelo padrão e renomear para pepflashplayer.dll.
  const pluginName = PLUGIN_NAMES[plat] || PLUGIN_NAMES.win32;
  let found = _findFileRecursive(extractDir, pluginName);
  // Windows fallback: achar pepflashplayer64_*.dll e renomear
  if (!found && plat === 'win32') {
    found = _findFileRecursive(extractDir, 'pepflashplayer64');
  }
  // Linux fallback: achar pelo .so
  if (!found && plat === 'linux') {
    found = _findFileRecursive(extractDir, 'libpepflashplayer');
  }
  if (!found) {
    throw new Error(
      'Extração concluída mas ' + pluginName + ' não encontrado dentro do archive ' + asset.name
    );
  }
  const pluginPath = path.join(cacheDir, pluginName);
  try {
    fs.copyFileSync(found, pluginPath);
  } catch (_) {
    /* ignore */
  }

  // Limpa o subdiretório de extração (mantém só o plugin + manifest no cache)
  try {
    fs.rmSync(extractDir, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }

  if (!fs.existsSync(pluginPath)) {
    throw new Error('Falha ao mover ' + pluginName + ' para o cache (' + pluginPath + ')');
  }

  // Escreve cache-manifest.json
  const version = _extractVersion(release, cacheDir);
  const manifest = {
    version: version,
    downloadDate: new Date().toISOString(),
    assetName: asset.name,
    releaseTag: release.tag_name || null,
    source: 'darktohka/clean-flash-builds'
  };
  fs.writeFileSync(getCacheManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');

  logger.info('FlashUpdater: ✅ Clean Flash ' + version + ' cacheado em ' + cacheDir);
  if (onProgress) onProgress(100, '', '', 'done');
  return pluginPath;
}

/**
 * Extrai a versão do Flash do release tag ou do manifest.json extraído.
 * @param {Object} release
 * @param {string} cacheDir
 * @returns {string}
 */
function _extractVersion(release, cacheDir) {
  // Tenta ler o manifest.json extraído (darktohka inclui um)
  try {
    const m = path.join(cacheDir, 'manifest.json');
    if (fs.existsSync(m)) {
      const data = JSON.parse(fs.readFileSync(m, 'utf8'));
      if (process.platform === 'linux' && data.linux_version) return data.linux_version;
      if (data.version) return data.version;
    }
  } catch (_) {
    /* ignore */
  }
  // Fallback: parse do tag name (ex: "v34.0.0.137")
  const tag = (release && release.tag_name) || '';
  const match = tag.match(/(\d+(?:\.\d+)+)/);
  return match ? match[1] : '34.0.0.0';
}

/**
 * Refresh em background se o cache estiver stale (não bloqueia o boot).
 * Só refresca o cache para o PRÓXIMO boot — não relança.
 * @param {string} [platform]
 * @returns {Promise<void>}
 */
async function refreshIfStale(platform) {
  if (!hasCachedPlugin()) return; // nothing to refresh
  if (!isCacheStale()) return; // fresh enough
  logger.info('FlashUpdater: cache stale (>' + STALE_DAYS + 'd) — atualizando em background...');
  try {
    await ensureLatest(platform);
    logger.info('FlashUpdater: cache atualizado em background (válido para próximo boot)');
  } catch (e) {
    logger.warn(
      'FlashUpdater: refresh background falhou (' + e.message + ') — mantendo cache atual'
    );
  }
}

module.exports = {
  ensureLatest: ensureLatest,
  refreshIfStale: refreshIfStale,
  // cache queries (exposto p/ testes)
  getCacheDir: getCacheDir,
  getCachedPluginPath: getCachedPluginPath,
  hasCachedPlugin: hasCachedPlugin,
  getCacheInfo: getCacheInfo,
  isCacheStale: isCacheStale,
  // pure helpers (expostos p/ testes unitários)
  pickAsset: pickAsset,
  _findFileRecursive: _findFileRecursive,
  // constants (p/ testes)
  CACHE_SUBDIR: CACHE_SUBDIR,
  STALE_DAYS: STALE_DAYS
};
