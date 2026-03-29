/**
 * Testes para src/utils/logger.js
 */

const logger = require('../logger');

// Mock console methods
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
});

describe('logger.js', () => {
  describe('info', () => {
    test('chama console.log', () => {
      logger.info('test message');
      expect(console.log).toHaveBeenCalled();
    });

    test('inclui a mensagem no output', () => {
      logger.info('test message');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('test message')
      );
    });
  });

  describe('warn', () => {
    test('chama console.warn', () => {
      logger.warn('warning message');
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('error', () => {
    test('chama console.error', () => {
      logger.error('error message');
      expect(console.error).toHaveBeenCalled();
    });

    test('aceita dados adicionais', () => {
      logger.error('error message', 'extra data');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('error message'),
        'extra data'
      );
    });
  });

  describe('debug', () => {
    test('não loga por padrão (LOG_LEVEL não é debug)', () => {
      logger.debug('debug message');
      // Por padrão, debug não loga
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('setLevel', () => {
    test('existe como função', () => {
      expect(typeof logger.setLevel).toBe('function');
    });
  });
});
