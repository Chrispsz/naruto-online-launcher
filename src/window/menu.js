/**
 * Menu da Aplicação
 */

'use strict';

const { dialog, Menu } = require('electron');
const logger = require('../utils/logger');
const { showRegionSelector, showHardwareSelector } = require('./create');

function setupMenu(config, saveConfig) {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Sair', accelerator: 'Alt+F4', click: () => require('electron').app.exit(0) }
      ]
    },
    {
      label: 'Op\u00E7\u00F5es',
      submenu: [
        { 
          label: '\u{1F680} Hardware Moderno', 
          type: 'radio', 
          checked: config.hardwareProfile === 'modern',
          click: () => {
            config.hardwareProfile = 'modern';
            saveConfig(config);
            dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' });
          }
        },
        { 
          label: '\u{1F527} Hardware Antigo', 
          type: 'radio', 
          checked: config.hardwareProfile === 'legacy',
          click: () => {
            config.hardwareProfile = 'legacy';
            saveConfig(config);
            dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' });
          }
        },
        { 
          label: '\u{1F4BB} CPU Only', 
          type: 'radio', 
          checked: config.hardwareProfile === 'cpu',
          click: () => {
            config.hardwareProfile = 'cpu';
            saveConfig(config);
            dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' });
          }
        },
        { type: 'separator' },
        { label: 'Trocar Regi\u00E3o (F6)', click: () => showRegionSelector(config) },
        { label: 'Trocar Hardware (F7)', click: () => showHardwareSelector(config, saveConfig) }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        { 
          label: 'Atalhos', 
          click: () => dialog.showMessageBox({
            type: 'info',
            title: 'Atalhos',
            message: 'F5 = Limpar Login\nF6 = Trocar Regi\u00E3o\nF7 = Trocar Hardware\nF11 = Tela Cheia\nF12 = DevTools'
          })
        }
      ]
    }
  ];
  
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  logger.info('Menu configurado');
}

module.exports = { setupMenu };
