/**
 * Testes para src/utils/logger.js
 * Testa o wrapper do logger que formata e delega para electron-log
 */

// Requer electron-log mock do setup file
const electronLog = require('electron-log');
const logger = require('../logger');

describe('logger.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('info', () => {
    test('delega para electron-log.info', () => {
      logger.info('test message');
      expect(electronLog.info).toHaveBeenCalledTimes(1);
    });

    test('inclui prefixo [Launcher] na mensagem', () => {
      logger.info('test message');
      expect(electronLog.info).toHaveBeenCalledWith(expect.stringContaining('[Launcher]'));
    });

    test('inclui a mensagem original', () => {
      logger.info('test message');
      expect(electronLog.info).toHaveBeenCalledWith(expect.stringContaining('test message'));
    });

    test('aceita dados adicionais', () => {
      logger.info('test message', { key: 'value' });
      expect(electronLog.info).toHaveBeenCalledWith(expect.stringContaining('test message'), {
        key: 'value'
      });
    });
  });

  describe('warn', () => {
    test('delega para electron-log.warn', () => {
      logger.warn('warning message');
      expect(electronLog.warn).toHaveBeenCalledTimes(1);
    });

    test('inclui ícone de aviso', () => {
      logger.warn('warning message');
      expect(electronLog.warn).toHaveBeenCalledWith(expect.stringContaining('[Launcher]'));
    });

    test('aceita dados adicionais', () => {
      logger.warn('warning message', { key: 'value' });
      expect(electronLog.warn).toHaveBeenCalledWith(expect.stringContaining('warning message'), {
        key: 'value'
      });
    });
  });

  describe('error', () => {
    test('delega para electron-log.error', () => {
      logger.error('error message');
      expect(electronLog.error).toHaveBeenCalledTimes(1);
    });

    test('aceita dados adicionais', () => {
      logger.error('error message', 'extra data');
      expect(electronLog.error).toHaveBeenCalledWith(
        expect.stringContaining('error message'),
        'extra data'
      );
    });
  });

  describe('debug', () => {
    test('delega para electron-log.debug', () => {
      logger.debug('debug message');
      expect(electronLog.debug).toHaveBeenCalledTimes(1);
    });

    test('aceita dados adicionais', () => {
      logger.debug('debug message', { ctx: 'test' });
      expect(electronLog.debug).toHaveBeenCalledWith(expect.stringContaining('debug message'), {
        ctx: 'test'
      });
    });
  });
});
