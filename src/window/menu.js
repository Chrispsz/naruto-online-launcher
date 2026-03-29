/**
 * Menu da Aplicação
 * Usa dialogs.js para evitar dependência circular
 */

'use strict';

const { dialog, Menu } = require('electron');
const logger = require('../utils/logger');
const { showRegionSelector, showHardwareSelector } = require('./dialogs');

function setupMenu(config, saveConfig, mainWindowGetter) {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Sair', accelerator: 'Alt+F4', click: () => require('electron').app.exit(0) }
      ]
    },
    {
      label: 'Opções',
      submenu: [
        { 
          label: '🚀 Hardware Moderno', 
          type: 'radio', 
          checked: config.hardwareProfile === 'modern',
          click: () => {
            config.hardwareProfile = 'modern';
            saveConfig(config);
            dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' });
          }
        },
        { 
          label: '🔧 Hardware Antigo', 
          type: 'radio', 
          checked: config.hardwareProfile === 'legacy',
          click: () => {
            config.hardwareProfile = 'legacy';
            saveConfig(config);
            dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' });
          }
        },
        { 
          label: '💻 CPU Only', 
          type: 'radio', 
          checked: config.hardwareProfile === 'cpu',
          click: () => {
            config.hardwareProfile = 'cpu';
            saveConfig(config);
            dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' });
          }
        },
        { type: 'separator' },
        { 
          label: 'Trocar Região (F6)', 
          click: () => {
            const win = mainWindowGetter?.();
            if (win) showRegionSelector(win, config);
          }
        },
        { 
          label: 'Trocar Hardware (F7)', 
          click: () => {
            const win = mainWindowGetter?.();
            if (win) showHardwareSelector(win, config, saveConfig);
          }
        }
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
            message: 'F5 = Limpar Login\nF6 = Trocar Região\nF7 = Trocar Hardware\nF11 = Tela Cheia'
          })
        }
      ]
    }
  ];
  
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  logger.info('Menu configurado');
}

module.exports = { setupMenu };
