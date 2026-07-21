/**
 * Testes para src/app/FlashUpdater.js (Fase 2)
 *
 * Foco em funções PURAS (sem rede): pickAsset, cache queries, isCacheStale.
 * ensureLatest/refreshIfStale dependem de rede e são testadas manualmente.
 */

const fs = require('fs');
const FlashUpdater = require('../FlashUpdater');

describe('FlashUpdater.js', () => {
  describe('pickAsset', () => {
    // Assets reais do darktohka/clean-flash-builds
    // Windows: v1.54 (ChineseFlash-Patched-Win-34.0.0.376.7z)
    // Linux: v1.7 (flash_player_patched_ppapi_linux.x86_64.tar.gz) — última com asset Linux
    const release = {
      tag_name: 'v1.54',
      assets: [
        {
          name: 'ChineseFlash-Patched-Win-34.0.0.376.7z',
          browser_download_url: 'https://x/win.7z',
          size: 29689253
        },
        {
          name: 'ChineseFlash-PPAPI-PepperFlashPlayer.zip',
          browser_download_url: 'https://x/mac.zip',
          size: 9000000
        },
        {
          name: 'ChineseFlash-NPAPI-FlashPlayer-10.6.zip',
          browser_download_url: 'https://x/mac-npapi.zip',
          size: 8000000
        },
        {
          name: 'flash_player_patched_ppapi_linux.x86_64.tar.gz',
          browser_download_url: 'https://x/linux.tar.gz',
          size: 8499275
        }
      ]
    };

    test('seleciona asset Windows (.7z) quando platform=win32', () => {
      const a = FlashUpdater.pickAsset(release, 'win32');
      expect(a).not.toBeNull();
      expect(a.name).toBe('ChineseFlash-Patched-Win-34.0.0.376.7z');
    });

    test('seleciona asset Linux (.tar.gz) quando platform=linux', () => {
      const a = FlashUpdater.pickAsset(release, 'linux');
      expect(a).not.toBeNull();
      expect(a.name).toBe('flash_player_patched_ppapi_linux.x86_64.tar.gz');
    });

    test('retorna null para Mac (não suportado pelo launcher)', () => {
      const a = FlashUpdater.pickAsset(release, 'darwin');
      expect(a).toBeNull();
    });

    test('retorna null quando nenhum asset casa com a plataforma', () => {
      const a = FlashUpdater.pickAsset(
        { tag_name: 'v1', assets: [{ name: 'readme.md' }] },
        'win32'
      );
      expect(a).toBeNull();
    });

    test('retorna null quando release não tem assets', () => {
      expect(FlashUpdater.pickAsset({}, 'win32')).toBeNull();
      expect(FlashUpdater.pickAsset(null, 'win32')).toBeNull();
    });

    test('retorna null para plataforma desconhecida', () => {
      const a = FlashUpdater.pickAsset(release, 'freebsd');
      expect(a).toBeNull();
    });

    test('default platform = process.platform', () => {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const a = FlashUpdater.pickAsset(release);
      expect(a).not.toBeNull();
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });
  });

  describe('cache path helpers', () => {
    test('getCacheDir termina com flash-cache', () => {
      const dir = FlashUpdater.getCacheDir();
      expect(dir.endsWith('flash-cache')).toBe(true);
    });

    test('getCachedPluginPath aponta para libpepflashplayer.so no Linux', () => {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const p = FlashUpdater.getCachedPluginPath();
      expect(p.endsWith('libpepflashplayer.so')).toBe(true);
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });

    test('getCachedPluginPath aponta para pepflashplayer.dll no Windows', () => {
      const orig = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const p = FlashUpdater.getCachedPluginPath();
      expect(p.endsWith('pepflashplayer.dll')).toBe(true);
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    });
  });

  describe('hasCachedPlugin', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('retorna false quando o arquivo não existe', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(FlashUpdater.hasCachedPlugin()).toBe(false);
    });

    test('retorna false quando o arquivo é menor que 1MB (corrompido)', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 500 * 1024 });
      expect(FlashUpdater.hasCachedPlugin()).toBe(false);
    });

    test('retorna true quando o arquivo existe e é maior que 1MB', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 17 * 1024 * 1024 });
      expect(FlashUpdater.hasCachedPlugin()).toBe(true);
    });
  });

  describe('getCacheInfo', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('retorna null quando cache-manifest.json não existe', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(FlashUpdater.getCacheInfo()).toBeNull();
    });

    test('retorna null quando manifest é JSON inválido', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{not json');
      expect(FlashUpdater.getCacheInfo()).toBeNull();
    });

    test('retorna null quando manifest não tem downloadDate', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ version: '34.0.0.137' }));
      expect(FlashUpdater.getCacheInfo()).toBeNull();
    });

    test('retorna objeto parsed quando manifest é válido', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const data = {
        version: '34.0.0.137',
        downloadDate: '2026-01-01T00:00:00.000Z',
        assetName: 'clean-flash-linux.tar.xz'
      };
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(data));
      const info = FlashUpdater.getCacheInfo();
      expect(info).not.toBeNull();
      expect(info.version).toBe('34.0.0.137');
      expect(info.assetName).toBe('clean-flash-linux.tar.xz');
    });
  });

  describe('isCacheStale', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('retorna true quando não há cache info', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(FlashUpdater.isCacheStale()).toBe(true);
    });

    test('retorna true quando cache tem mais de STALE_DAYS', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const old = new Date(
        Date.now() - (FlashUpdater.STALE_DAYS + 1) * 24 * 60 * 60 * 1000
      ).toISOString();
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ downloadDate: old }));
      expect(FlashUpdater.isCacheStale()).toBe(true);
    });

    test('retorna false quando cache é recente', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const fresh = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min atrás
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ downloadDate: fresh }));
      expect(FlashUpdater.isCacheStale()).toBe(false);
    });
  });

  describe('constants', () => {
    test('CACHE_SUBDIR é flash-cache', () => {
      expect(FlashUpdater.CACHE_SUBDIR).toBe('flash-cache');
    });
    test('STALE_DAYS é 7', () => {
      expect(FlashUpdater.STALE_DAYS).toBe(7);
    });
  });

  describe('ensureLatest — binário committed', () => {
    test('PINNED_RELEASES tem tags corretas para Linux e Windows', () => {
      // Flash EOL: tags fixas em vez de "latest"
      // Verifica que as constantes estão configuradas corretamente
      // (não testa ensureLatest diretamente pois depende de rede/app.getAppPath)
      // Accessamos via require para inspecionar as constantes internas
      const src = fs.readFileSync(require('path').join(__dirname, '..', 'FlashUpdater.js'), 'utf8');
      expect(src).toContain("tag: 'v1.7'");
      expect(src).toContain("tag: 'v1.54'");
      expect(src).toContain('flash_player_patched_ppapi_linux\\.x86_64\\.tar\\.gz');
      expect(src).toContain('ChineseFlash-Patched-Win-.*\\.7z');
    });
  });

  describe('_findFileRecursive', () => {
    const os = require('os');
    const path = require('path');
    test('encontra arquivo no root', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-'));
      fs.writeFileSync(path.join(tmp, 'pepflashplayer.dll'), 'fake');
      const found = FlashUpdater._findFileRecursive(tmp, 'pepflashplayer.dll');
      expect(found).toBe(path.join(tmp, 'pepflashplayer.dll'));
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('encontra arquivo aninhado em subdiretório', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-'));
      fs.mkdirSync(path.join(tmp, 'a', 'b'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'a', 'b', 'libpepflashplayer.so'), 'fake');
      const found = FlashUpdater._findFileRecursive(tmp, 'libpepflashplayer.so');
      expect(found).toBe(path.join(tmp, 'a', 'b', 'libpepflashplayer.so'));
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('é case-insensitive', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-'));
      fs.writeFileSync(path.join(tmp, 'PEPFLASHPLAYER.DLL'), 'fake');
      const found = FlashUpdater._findFileRecursive(tmp, 'pepflashplayer.dll');
      expect(found).toBe(path.join(tmp, 'PEPFLASHPLAYER.DLL'));
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('retorna null quando não encontra', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shinobi-'));
      const found = FlashUpdater._findFileRecursive(tmp, 'nope.dll');
      expect(found).toBeNull();
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });
});
