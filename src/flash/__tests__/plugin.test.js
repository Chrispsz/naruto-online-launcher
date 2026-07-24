/**
 * Tests for src/flash/plugin.js
 *
 * Mocka fs (existsSync, readFileSync, statSync) e controla process.platform /
 * process.resourcesPath pra testar:
 *   - getFlashVersion (manifest.json + fallbacks por plataforma)
 *   - findFlashPlugin (busca em múltiplos paths, validação de tamanho, plataforma)
 *
 * Nota: process.resourcesPath é undefined em Node puro (só existe em Electron
 * runtime). Setamos um stub em beforeEach pra evitar path.join(undefined, ...)
 * — em produção, Electron garante esse valor.
 */

'use strict';

const fs = require('fs');
const plugin = require('../plugin');

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_RESOURCES_PATH = process.resourcesPath;

function setPlatform(p) {
  Object.defineProperty(process, 'platform', {
    value: p,
    configurable: true,
    writable: true
  });
}

function setResourcesPath(p) {
  Object.defineProperty(process, 'resourcesPath', {
    value: p,
    configurable: true,
    writable: true
  });
}

describe('plugin.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Stub process.resourcesPath (undefined em Node puro, definido em Electron)
    setResourcesPath('/tmp/naruto-test/resources');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setPlatform(ORIGINAL_PLATFORM);
    setResourcesPath(ORIGINAL_RESOURCES_PATH);
  });

  describe('getFlashVersion', () => {
    test('retorna manifest.linux_version quando presente (linux)', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          version: '34.0.0.300',
          linux_version: '34.0.0.137'
        })
      );
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.137');
    });

    test('retorna manifest.version quando linux_version ausente (linux)', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          version: '34.0.0.300'
        })
      );
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.300');
    });

    test('retorna manifest.version no win32 (ignora linux_version)', () => {
      setPlatform('win32');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          version: '34.0.0.376',
          linux_version: '34.0.0.137'
        })
      );
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.376');
    });

    test('retorna fallback linux (34.0.0.137) quando manifest não existe', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.137');
    });

    test('retorna fallback win32 (34.0.0.376) quando manifest não existe', () => {
      setPlatform('win32');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.376');
    });

    test('retorna 34.0.0.0 para plataforma desconhecida sem manifest', () => {
      setPlatform('darwin');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.0');
    });

    test('retorna fallback quando JSON.parse falha (manifest corrompido)', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('not valid json');
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.137');
    });

    test('retorna fallback quando manifest não tem version nem linux_version', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ name: 'flash' }));
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.137');
    });

    test('retorna fallback win32 quando manifest não tem version', () => {
      setPlatform('win32');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ name: 'flash' }));
      expect(plugin.getFlashVersion('/flash/dir')).toBe('34.0.0.376');
    });
  });

  describe('findFlashPlugin', () => {
    test('retorna null em plataforma não suportada (darwin)', () => {
      setPlatform('darwin');
      expect(plugin.findFlashPlugin()).toBeNull();
    });

    test('retorna null em plataforma não suportada (aix)', () => {
      setPlatform('aix');
      expect(plugin.findFlashPlugin()).toBeNull();
    });

    test('retorna null quando nenhum path tem o binário (linux)', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(plugin.findFlashPlugin()).toBeNull();
    });

    test('retorna null quando nenhum path tem o binário (win32)', () => {
      setPlatform('win32');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(plugin.findFlashPlugin()).toBeNull();
    });

    test('retorna o path quando binário existe e > 1MB (linux)', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 2 * 1024 * 1024 }); // 2MB
      const result = plugin.findFlashPlugin();
      expect(result).not.toBeNull();
      expect(result).toContain('libpepflashplayer.so');
    });

    test('retorna o path quando binário existe e > 1MB (win32)', () => {
      setPlatform('win32');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5 * 1024 * 1024 });
      const result = plugin.findFlashPlugin();
      expect(result).not.toBeNull();
      expect(result).toContain('pepflashplayer.dll');
    });

    test('pula arquivo menor que 1MB e continua buscando', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSync = jest.spyOn(fs, 'statSync');
      statSync.mockReturnValueOnce({ size: 100 * 1024 }); // 100KB - too small
      statSync.mockReturnValueOnce({ size: 2 * 1024 * 1024 }); // 2MB - OK
      const result = plugin.findFlashPlugin();
      expect(result).not.toBeNull();
      expect(result).toContain('libpepflashplayer.so');
    });

    test('retorna null quando TODOS os arquivos são pequenos demais', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 100 }); // 100 bytes
      expect(plugin.findFlashPlugin()).toBeNull();
    });

    test('não aceita arquivo com size exatamente igual a MIN_FLASH_SIZE (1MB)', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1 * 1024 * 1024 }); // exactly 1MB
      expect(plugin.findFlashPlugin()).toBeNull();
    });

    test('continua buscando quando statSync lança erro', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSync = jest.spyOn(fs, 'statSync');
      statSync.mockImplementationOnce(() => {
        throw new Error('EACCES');
      });
      statSync.mockReturnValueOnce({ size: 2 * 1024 * 1024 });
      const result = plugin.findFlashPlugin();
      expect(result).not.toBeNull();
    });

    test('procura no cache on-demand (userData/flash-cache/)', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockImplementation(p => {
        return typeof p === 'string' && p.indexOf('flash-cache') !== -1;
      });
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 2 * 1024 * 1024 });
      const result = plugin.findFlashPlugin();
      expect(result).not.toBeNull();
      expect(result).toContain('flash-cache');
      expect(result).toContain('libpepflashplayer.so');
    });

    test('retorna o primeiro path válido encontrado', () => {
      setPlatform('linux');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 2 * 1024 * 1024 });
      const result = plugin.findFlashPlugin();
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });
  });
});
