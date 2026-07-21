'use strict';

const mms = require('../mms');

// eslint-disable-next-line no-unused-vars
const fs = require('fs');

jest.mock('fs');
jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return {
    ...actual,
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn(() => '/mock/dir')
  };
});
jest.mock('os', () => ({ homedir: jest.fn(() => '/home/test') }));
jest.mock('../../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('src/flash/mms.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createMmsCfg', () => {
    it('retorna true e escreve config quando sucesso', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      const result = mms.createMmsCfg('modern');

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const written = fs.writeFileSync.mock.calls[0][1];
      expect(written).toContain('OverrideGPUValidation=1');
      expect(written).toContain('EnableHardwareAcceleration=1');
    });

    it('usa perfil modern quando hardwareProfile é vazio', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      mms.createMmsCfg('');

      const written = fs.writeFileSync.mock.calls[0][1];
      expect(written).toContain('EnableHardwareAcceleration=1');
    });

    it('desativa GPU para perfil cpu', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      mms.createMmsCfg('cpu');

      const written = fs.writeFileSync.mock.calls[0][1];
      expect(written).toContain('EnableHardwareAcceleration=0');
    });

    it('inclui configs avançadas reais (sem placebo) com advancedMode', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      mms.createMmsCfg('modern', { advancedMode: true });

      const written = fs.writeFileSync.mock.calls[0][1];
      // v5.20.0: only real Adobe-documented mms.cfg keys for PPAPI Flash 34.
      expect(written).toContain('AssetCacheSize=0');
      expect(written).toContain('AutoUpdateDisable=1');
      // advancedMode also forces software rendering (EnableHardwareAcceleration=0).
      expect(written).toContain('EnableHardwareAcceleration=0');
      // Placebo keys removed — PPAPI silently ignores these.
      expect(written).not.toContain('StageQuality');
      expect(written).not.toContain('OverrideFPS');
      expect(written).not.toContain('EnableSockets');
      expect(written).not.toContain('FontSmoothingType');
      expect(written).not.toContain('DisableHardwareAcceleration');
    });

    it('não duplica EnableHardwareAcceleration quando cpu + advancedMode', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      mms.createMmsCfg('cpu', { advancedMode: true });

      const written = fs.writeFileSync.mock.calls[0][1];
      const matches = written.match(/EnableHardwareAcceleration=/g) || [];
      expect(matches.length).toBe(1);
      expect(written).toContain('EnableHardwareAcceleration=0');
    });

    it('faz backup de mms.cfg existente', () => {
      fs.existsSync.mockImplementation(p => p.includes('mms.cfg') && !p.endsWith('.bak'));
      fs.copyFileSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      mms.createMmsCfg('modern');

      expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
      expect(fs.copyFileSync.mock.calls[0][1]).toMatch(/\.bak$/);
    });

    it('retorna false quando write falha', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('permission denied');
      });

      const result = mms.createMmsCfg('modern');

      expect(result).toBe(false);
    });
  });

  describe('restoreMmsCfg', () => {
    it('restaura backup e remove arquivo .bak', () => {
      fs.existsSync.mockImplementation(p => p.endsWith('.bak'));
      fs.copyFileSync.mockImplementation(() => {});
      fs.unlinkSync.mockImplementation(() => {});

      const result = mms.restoreMmsCfg();

      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    });

    it('retorna false quando não há backup', () => {
      fs.existsSync.mockReturnValue(false);

      const result = mms.restoreMmsCfg();

      expect(result).toBe(false);
    });

    it('retorna false quando restore falha', () => {
      fs.existsSync.mockImplementation(p => p.endsWith('.bak'));
      fs.copyFileSync.mockImplementation(() => {
        throw new Error('read error');
      });

      const result = mms.restoreMmsCfg();

      expect(result).toBe(false);
    });
  });
});
