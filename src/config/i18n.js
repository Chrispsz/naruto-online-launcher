/**
 * config/i18n.js — Internationalization (EN + PT)
 * v5.23.0 — clean bilingual dictionary, human-friendly copy.
 *
 * Only keys actually referenced by the UI are kept.
 * Setup/mode keys preserved for the first-run setup window in main.js.
 * No technical jargon — plain language for end users.
 */

'use strict';

const DICTIONARY = {
  en: {
    'setup.title': 'Welcome to Shinobi Launcher',
    'setup.subtitle': 'Set up your experience in 30 seconds',
    'setup.language.label': 'Language',
    'setup.mode.title': 'Performance Mode',
    'setup.mode.default.body':
      'Recommended for everyone — always on, always safe.',
    'setup.mode.lowpc.body':
      'For old PCs or under 4GB RAM. Frees up memory and rests the GPU.',
    'setup.save': 'Start playing',
    'mode.default': 'Optimized Default',
    'mode.lowpc': 'Low-end PC Mode',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.export': 'Export',
    'common.import': 'Import',
    'profile.name': 'Name',
    'profile.server': 'Server',
    'profile.region': 'Region',
    // Launcher UI strings
    'nav.accounts': 'Accounts',
    'nav.events': 'Events',
    'nav.settings': 'Settings',
    'topbar.new': 'New account',
    'modal.search': 'Search',
    'modal.server_hint': 'Type the server number or click Search.',
    'modal.auto_create': 'Create automatically',
    'modal.vault_title': 'Credentials',
    'modal.vault_subtitle': 'Saved securely — auto-filled when login expires',
    'modal.vault_user': 'Username',
    'modal.vault_pass': 'Password',
    'modal.vault_remove': 'Remove',
    'modal.vault_hint':
      'Saved securely on this computer. Filled in automatically when your session expires.',
    'settings.general': 'General',
    'settings.language': 'Language',
    'settings.language.desc': 'Launcher interface language',
    'settings.optimization': 'Optimization',
    'settings.optimization.hint': 'Automatic',
    'settings.advanced': 'Advanced',
    'settings.notifications': 'Notifications',
    'settings.notifications.desc': 'Alert me before events start',
    'settings.remind': 'Reminder time',
    'settings.remind.desc': 'Minutes before each event to notify',
    'settings.restart': 'Restart required',
    'settings.restart.desc':
      'Restart the launcher to apply this change.',
    'settings.restart.btn': 'Restart now',
    'settings.lowpc': 'Low-end PC mode',
    'settings.lowpc.desc':
      'For old PCs or under 4GB RAM. Frees up memory and rests the GPU.',
    'settings.cpu_render': 'Force CPU rendering',
    'settings.cpu_render.desc':
      'For GPUs with issues. Uses the processor — slower, but more stable.',
    'settings.backup': 'Encrypted backup',
    'settings.backup.desc':
      'Save your accounts and passwords to a secure file',
    'settings.diag': 'Export diagnostics',
    'settings.diag.desc':
      'System info file for support (no passwords included)',
    'settings.diag.btn': 'Export .zip',
    'settings.about': 'About',
    'about.tagline': 'Multi-account Flash launcher for Naruto Online',
    'about.author': 'Author',
    'about.license': 'License',
    'about.platform': 'Platform',
    'about.runtime': 'Runtime',
    'about.report': 'Report issue',
    delete_confirm: 'Delete this account? Cookies and credentials will be cleared.',
    vault_remove_confirm: 'Remove credentials?'
  },

  pt: {
    'setup.title': 'Bem-vindo ao Shinobi Launcher',
    'setup.subtitle': 'Configure sua experiência em 30 segundos',
    'setup.language.label': 'Idioma',
    'setup.mode.title': 'Modo de Desempenho',
    'setup.mode.default.body':
      'Recomendado para todos — sempre ativo, sempre seguro.',
    'setup.mode.lowpc.body':
      'Para PCs antigos ou com menos de 4GB RAM. Libera memória e descansa a placa de vídeo.',
    'setup.save': 'Começar a jogar',
    'mode.default': 'Padrão Otimizado',
    'mode.lowpc': 'Modo PC Fraco',
    'common.save': 'Salvar',
    'common.cancel': 'Cancelar',
    'common.close': 'Fechar',
    'common.export': 'Exportar',
    'common.import': 'Importar',
    'profile.name': 'Nome',
    'profile.server': 'Servidor',
    'profile.region': 'Região',
    // Launcher UI strings
    'nav.accounts': 'Contas',
    'nav.events': 'Eventos',
    'nav.settings': 'Configurações',
    'topbar.new': 'Nova conta',
    'modal.search': 'Buscar',
    'modal.server_hint': 'Digite o número do servidor ou clique em Buscar.',
    'modal.auto_create': 'Criar automaticamente',
    'modal.vault_title': 'Credenciais',
    'modal.vault_subtitle': 'Salvo com segurança — preenchido quando o login expirar',
    'modal.vault_user': 'Usuário',
    'modal.vault_pass': 'Senha',
    'modal.vault_remove': 'Remover',
    'modal.vault_hint':
      'Salvo com segurança neste computador. Preenchido automaticamente quando sua sessão expirar.',
    'settings.general': 'Geral',
    'settings.language': 'Idioma',
    'settings.language.desc': 'Idioma da interface do launcher',
    'settings.optimization': 'Otimização',
    'settings.optimization.hint': 'Automática',
    'settings.advanced': 'Avançado',
    'settings.notifications': 'Notificações',
    'settings.notifications.desc': 'Avisar antes dos eventos começarem',
    'settings.remind': 'Tempo de lembrete',
    'settings.remind.desc': 'Quantos minutos antes avisar',
    'settings.restart': 'Reinício necessário',
    'settings.restart.desc':
      'Reinicie o launcher para aplicar esta alteração.',
    'settings.restart.btn': 'Reiniciar agora',
    'settings.lowpc': 'Modo PC Fraco',
    'settings.lowpc.desc':
      'Para PCs antigos ou com menos de 4GB de RAM. Libera memória e descansa a placa de vídeo.',
    'settings.cpu_render': 'Forçar renderização por CPU',
    'settings.cpu_render.desc':
      'Para GPUs com problema. Usa o processador — mais lento, mas mais estável.',
    'settings.backup': 'Backup criptografado',
    'settings.backup.desc':
      'Salva suas contas e senhas em um arquivo seguro',
    'settings.diag': 'Exportar diagnóstico',
    'settings.diag.desc':
      'Arquivo com dados do sistema para suporte (sem senhas)',
    'settings.diag.btn': 'Exportar .zip',
    'settings.about': 'Sobre',
    'about.tagline': 'Launcher Flash multi-conta para Naruto Online',
    'about.author': 'Autor',
    'about.license': 'Licença',
    'about.platform': 'Plataforma',
    'about.runtime': 'Runtime',
    'about.report': 'Reportar problema',
    delete_confirm: 'Excluir esta conta? Cookies e credenciais serão apagados.',
    vault_remove_confirm: 'Remover credenciais?'
  }
};

let _currentLang = 'en';

/**
 * Define o idioma atual. Ignora silenciosamente se o idioma não existir no dicionário.
 * @param {string} lang — código do idioma (ex: 'pt', 'en')
 */
function setLanguage(lang) {
  if (DICTIONARY[lang]) {
    _currentLang = lang;
  }
}

/** Retorna o idioma atual. @returns {string} */
function getLanguage() {
  return _currentLang;
}

/** Traduz uma chave para o idioma atual, com fallback para en/pt. @param {string} key @returns {string} */
function t(key) {
  const dict = DICTIONARY[_currentLang] || DICTIONARY.en;
  return dict[key] || DICTIONARY.en[key] || DICTIONARY.pt[key] || key;
}

/** Traduz uma chave para um idioma específico, com fallback para en/pt. @param {string} key @param {string} lang @returns {string} */
function tl(key, lang) {
  const dict = DICTIONARY[lang] || DICTIONARY.en;
  return dict[key] || DICTIONARY.en[key] || DICTIONARY.pt[key] || key;
}

/** Retorna o dicionário completo para um idioma (ou o atual). @param {string} [lang] @returns {Object} */
function getAll(lang) {
  const l = lang || _currentLang;
  return DICTIONARY[l] || DICTIONARY.pt;
}

module.exports = {
  setLanguage: setLanguage,
  getLanguage: getLanguage,
  t: t,
  tl: tl,
  getAll: getAll
};
