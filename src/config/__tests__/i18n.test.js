/**
 * Testes para src/config/i18n.js — Internationalization
 */

'use strict';

const i18n = require('../i18n');

describe('i18n.js', () => {
  beforeEach(() => {
    i18n.setLanguage('pt');
  });

  describe('t', () => {
    test('retorna string em português para chave válida', () => {
      expect(i18n.t('common.save')).toBe('Salvar');
    });

    test('fallback para português quando idioma atual não tem a chave', () => {
      i18n.setLanguage('en');
      // Chave que só existe em pt
      expect(i18n.t('common.save')).toBeTruthy();
    });

    test('retorna a própria chave quando não encontrada em nenhum idioma', () => {
      expect(i18n.t('nonexistent.key.here')).toBe('nonexistent.key.here');
    });
  });

  describe('tl', () => {
    test('retorna string no idioma especificado', () => {
      expect(i18n.tl('common.save', 'en')).toBe('Save');
    });

    test('fallback para pt quando idioma especificado não tem a chave', () => {
      expect(i18n.tl('common.save', 'invalid_lang')).toBeTruthy();
    });

    test('retorna a própria chave quando não encontrada', () => {
      expect(i18n.tl('missing.key', 'pt')).toBe('missing.key');
    });
  });

  describe('setLanguage / getLanguage', () => {
    test('setLanguage muda o idioma atual', () => {
      i18n.setLanguage('en');
      expect(i18n.getLanguage()).toBe('en');
    });

    test('setLanguage ignora idioma inválido', () => {
      i18n.setLanguage('pt');
      i18n.setLanguage('xx_invalid');
      expect(i18n.getLanguage()).toBe('pt');
    });
  });

  describe('getAll', () => {
    test('retorna dicionário do idioma atual', () => {
      const dict = i18n.getAll();
      expect(dict).toBeDefined();
      expect(dict['common.save']).toBe('Salvar');
    });

    test('retorna dicionário do idioma especificado', () => {
      const dict = i18n.getAll('en');
      expect(dict).toBeDefined();
      expect(dict['common.save']).toBe('Save');
    });

    test('fallback para pt quando idioma inválido', () => {
      const dict = i18n.getAll('invalid');
      expect(dict['common.save']).toBe('Salvar');
    });
  });
});
