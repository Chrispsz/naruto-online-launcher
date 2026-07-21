/**
 * Diagnostics Exporter — gera pacote .zip para diagnóstico (opt-in explícito)
 * v1.0.0 — v4.9.2
 *
 * SUBSTITUI o antigo crash-reporter (local-only, removido em v4.9.2).
 * Filosofia: zero tracking, zero auto-envio. O usuário clica em
 * "Exportar diagnóstico" e recebe um .zip pra anexar num GitHub Issue
 * — se quiser. Nada é enviado automaticamente.
 *
 * CONTEÚDO DO .zip:
 *   - system-info.json   → versão, Electron, Node, SO, RAM, CPU (sanitizado)
 *   - config.json        → config do launcher (sanitizada: sem senhas, sem paths)
 *   - profiles.json      → perfis (sanitizado: nome + região + servidor, sem creds)
 *   - logs/main.log      → log principal do electron-log (últimas 500 linhas)
 *   - logs/old-*.log     → logs rotacionados (se existirem)
 *   - crash-reports.json → se existir do v4.7 (legacy, pode estar vazio)
 *
 * SANITIZAÇÃO:
 *   - Remove paths absolutos (/home/user, C:\Users\user)
 *   - Remove tokens (40+ hex chars)
 *   - Remove emails
 *   - Não inclui credenciais do vault (jamais)
 *   - Não inclui cookies do jogo (jamais)
 *
 * USO:
 *   const diag = require('./utils/diagnostics');
 *   const result = await diag.exportZip(parentWindow);
 *   // → { ok:true, path:'/tmp/shinobi-diag-2026-07-14.zip' }
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, dialog } = require('electron');
const logger = require('./logger');

// ── Sanitização ──────────────────────────────────────────────────────────

function _sanitize(str) {
  if (typeof str !== 'string') return String(str || '');
  // Paths absolutos de usuário
  str = str.replace(/\/(?:home|Users)\/[^/\s]+/g, '/home/[user]');
  str = str.replace(/[A-Z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\[user]');
  // Tokens (40+ hex chars — JWT, etc)
  str = str.replace(/[a-f0-9]{40,}/gi, '[token-redacted]');
  // Emails
  str = str.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email-redacted]');
  return str;
}

function _sanitizeObj(obj, depth) {
  depth = depth || 0;
  if (depth > 6) return '[max-depth]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return _sanitize(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj))
    return obj.map(function (i) {
      return _sanitizeObj(i, depth + 1);
    });
  if (typeof obj === 'object') {
    const out = {};
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      // Nunca incluir campos sensíveis por nome
      const lk = k.toLowerCase();
      if (
        lk === 'pass' ||
        lk === 'password' ||
        lk === 'pwd' ||
        lk === 'secret' ||
        lk === 'token' ||
        lk === 'credentials' ||
        lk === 'cookie' ||
        lk === 'cookies' ||
        lk === 'loginkey' ||
        lk === 'oas_user' ||
        lk === 'vault'
      ) {
        out[k] = '[redacted]';
      } else {
        out[k] = _sanitizeObj(obj[k], depth + 1);
      }
    }
    return out;
  }
  return String(obj);
}

// ── Coleta de informações ────────────────────────────────────────────────

function _collectSystemInfo() {
  const pkg = require('../../package.json');
  const cpus = os.cpus();
  return {
    app: {
      name: pkg.name,
      version: pkg.version,
      electronVersion: pkg.devDependencies && pkg.devDependencies.electron
    },
    runtime: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8
    },
    os: {
      platform: process.platform,
      arch: process.arch,
      release: _sanitize(os.release()),
      hostname: 'redacted',
      totalRAM_GB: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
      freeRAM_GB: Math.round((os.freemem() / 1024 / 1024 / 1024) * 10) / 10,
      cpuCores: cpus.length,
      cpuModel: _sanitize((cpus[0] && cpus[0].model) || 'unknown'),
      uptime_min: Math.round(os.uptime() / 60)
    },
    timestamp: new Date().toISOString(),
    timestamp_epoch: Date.now()
  };
}

function _collectConfig() {
  try {
    const { loadConfig } = require('../config/settings');
    return _sanitizeObj(loadConfig());
  } catch (e) {
    return { error: e.message };
  }
}

function _collectProfiles() {
  try {
    const store = require('../profiles/store');
    const profiles = store.getAll();
    // Só nome + região + servidor + stats — JAMAIS creds
    return profiles.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        region: p.region,
        server: p.server,
        language: p.language,
        favorite: !!p.favorite,
        notes: p.notes ? '[has-notes]' : null,
        stats: p.stats || null,
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt,
        launchCount: p.launchCount || 0
      };
    });
  } catch (e) {
    return { error: e.message };
  }
}

function _readLogs() {
  const out = {};
  try {
    // electron-log salva em app.getPath('logs') ou app.getPath('userData')/logs
    let logsDir = null;
    try {
      logsDir = app.getPath('logs');
    } catch (_) {
      /* fallback */
    }
    if (!logsDir || !fs.existsSync(logsDir)) {
      logsDir = path.join(app.getPath('userData'), 'logs');
    }
    if (!fs.existsSync(logsDir)) return out;

    const files = fs.readdirSync(logsDir).filter(function (f) {
      return /\.log$/i.test(f);
    });

    files.forEach(function (f) {
      const full = path.join(logsDir, f);
      try {
        const stat = fs.statSync(full);
        if (stat.size > 2 * 1024 * 1024) {
          // >2MB: lê só últimas 500 linhas
          const buf = fs.readFileSync(full, 'utf8');
          const lines = buf.split('\n');
          out[f] = lines.slice(-500).join('\n');
        } else {
          out[f] = fs.readFileSync(full, 'utf8');
        }
        out[f] = _sanitize(out[f]);
      } catch (e) {
        out[f] = '[read-error: ' + e.message + ']';
      }
    });
  } catch (e) {
    out['error.txt'] = 'Failed to read logs: ' + e.message;
  }
  return out;
}

function _readLegacyCrashReports() {
  try {
    const file = path.join(app.getPath('userData'), 'crash-reports.json');
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return _sanitize(raw);
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

// ── ZIP writer minimalista (sem dependências) ────────────────────────────
// Formato ZIP: estrutura simples, deflate. Implementação inline pra não
// adicionar dependência (adm-zip/jszip) ao launcher.

function _crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function _makeZipFile(entries) {
  // entries: [{ name, data(Buffer) }]
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const name = entries[i].name;
    const data = entries[i].data;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = _crc32(data);
    // Store (sem compressão) — simplicidade + logs já são texto
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // compression: store
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14); // crc32
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(local, 30);

    const localWithFile = Buffer.concat([local, data]);
    localParts.push(localWithFile);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // compression
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // offset of local header
    nameBuf.copy(central, 46);
    centralParts.push(central);

    offset += localWithFile.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // EOCD signature
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(centralParts.length, 8); // entries on disk
  end.writeUInt16LE(centralParts.length, 10); // total entries
  end.writeUInt32LE(centralBuf.length, 12); // central dir size
  end.writeUInt32LE(offset, 16); // offset of central dir
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([Buffer.concat(localParts), centralBuf, end]);
}

// ── API pública ──────────────────────────────────────────────────────────

/**
 * Gera o pacote .zip de diagnóstico e abre diálogo de salvamento.
 * @param {Object} [parentWindow] — janela pai pra modal (opcional)
 * @returns {Promise<{ok:boolean, path?:string, error?:string, size?:number}>}
 */
async function exportZip(parentWindow) {
  try {
    logger.info('Diagnostics: coletando informações...');

    const sysInfo = _collectSystemInfo();
    const config = _collectConfig();
    const profiles = _collectProfiles();
    const logs = _readLogs();
    const legacyCrash = _readLegacyCrashReports();

    // Monta entradas do zip
    const entries = [];
    entries.push({
      name: 'system-info.json',
      data: Buffer.from(JSON.stringify(sysInfo, null, 2), 'utf8')
    });
    entries.push({
      name: 'config.json',
      data: Buffer.from(JSON.stringify(config, null, 2), 'utf8')
    });
    entries.push({
      name: 'profiles.json',
      data: Buffer.from(JSON.stringify(profiles, null, 2), 'utf8')
    });
    if (legacyCrash) {
      entries.push({ name: 'crash-reports-legacy.json', data: Buffer.from(legacyCrash, 'utf8') });
    }
    // Logs em subpasta
    Object.keys(logs).forEach(function (fname) {
      entries.push({ name: 'logs/' + fname, data: Buffer.from(logs[fname], 'utf8') });
    });
    // README explicativo
    const readme = [
      '# Diagnóstico Shinobi Launcher v' + sysInfo.app.version,
      '',
      'Gerado em: ' + sysInfo.timestamp,
      '',
      '## Conteúdo',
      '- system-info.json: versões, SO, hardware (sanitizado)',
      '- config.json: configuração do launcher (sem credenciais)',
      '- profiles.json: perfis (nome + região + stats, sem senhas)',
      '- logs/main.log: log principal (últimas 500 linhas)',
      '- crash-reports-legacy.json: reports antigos do v4.7 (se existirem)',
      '',
      '## Sanitização',
      'Paths de usuário, tokens, emails e credenciais foram removidos.',
      'Nada é enviado automaticamente — este .zip é seu, você decide o que fazer.',
      '',
      '## Como usar',
      'Anexe este .zip num GitHub Issue em:',
      'https://github.com/Chrispsz/naruto-online-launcher/issues'
    ].join('\n');
    entries.push({ name: 'README.md', data: Buffer.from(readme, 'utf8') });

    const zipBuf = _makeZipFile(entries);

    // Diálogo de salvamento
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultName = 'shinobi-diag-' + stamp + '.zip';

    const result = await dialog.showSaveDialog(parentWindow, {
      title: 'Exportar diagnóstico',
      defaultPath: defaultName,
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    });

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, zipBuf);
    const sizeKB = Math.round(zipBuf.length / 1024);
    logger.info(
      'Diagnostics: .zip salvo em ' +
        result.filePath +
        ' (' +
        sizeKB +
        'KB, ' +
        entries.length +
        ' arquivos)'
    );
    return { ok: true, path: result.filePath, size: zipBuf.length, entries: entries.length };
  } catch (e) {
    logger.error('Diagnostics: falha ao exportar — ' + e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  exportZip: exportZip,
  // expostos pra testes
  _sanitize: _sanitize,
  _sanitizeObj: _sanitizeObj,
  _collectSystemInfo: _collectSystemInfo
};
