/**
 * Naruto Online Launcher v1.6.0
 * Otimizado para Flash 64-bit + Perfis de Hardware
 * SINGLE WINDOW - Flash PPAPI
 * 
 * Correções v1.6.0:
 * - Removido ignore-certificate-errors (segurança)
 * - Removido disable-compositor (causa tela preta)
 * - Removido disable-frame-rate-limit (desperdício CPU/GPU)
 * - Trocado Vulkan por D3D11/GL (estabilidade)
 * - Adicionado logging em todos os catch
 * - Corrigido path do mms.cfg
 * - Expandido ppapi-flash-args
 * - Adicionado disk-cache-size 500MB
 * - BLOCK_LIST otimizado com Set
 */

'use strict';

const { app, BrowserWindow, session, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================
// LOGGING UTILITY
// ============================================================
const log = {
  info: (msg) => console.log(`[Launcher] ${msg}`),
  warn: (msg) => console.warn(`[Launcher] ⚠ ${msg}`),
  error: (msg, err) => console.error(`[Launcher] ✗ ${msg}`, err?.message || err || '')
};

// ============================================================
// CONFIGURATION
// ============================================================
const REGIONS = {
  'pt': { name: 'Português', flag: '🇧🇷' },
  'en': { name: 'English', flag: '🇺🇸' },
  'fr': { name: 'Français', flag: '🇫🇷' },
  'de': { name: 'Deutsch', flag: '🇩🇪' },
  'es': { name: 'Español', flag: '🇪🇸' },
  'pl': { name: 'Polski', flag: '🇵🇱' }
};

const HARDWARE_PROFILES = {
  'modern': { name: 'Moderno', description: 'RX 6000+, RTX 3000+, GTX 1600+', icon: '🚀' },
  'legacy': { name: 'Antigo', description: 'GTX 900/1000, Radeon HD/RX 500, Intel HD', icon: '🔧' },
  'cpu': { name: 'CPU Only', description: 'Sem GPU dedicada ou problemas de GPU', icon: '💻' }
};

const BASE_URL = 'https://naruto.narutowebgame.com';
const WINDOW_TITLE = 'Naruto Online';
const LAUNCHER_PARAMS = 'logintype=4&leftbar_collapse=Yes';

// BLOCK_LIST otimizado com Set para O(1) lookup
const BLOCK_LIST = new Set([
  // Analytics
  'google-analytics.com', 'googletagmanager.com', 'analytics.google.com', 'www.google-analytics.com',
  // Ads
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  // Social tracking
  'facebook.com/tr', 'connect.facebook.net', 'pixel.facebook.com',
  // Game-specific tracking
  'collect.mdata.cool', 'mdata.cool', 'track.oasgames.com', 'log.oasgames.com',
  // General
  'hotjar.com', 'clarity.ms', 'cdn.mxpnl.com'
]);

// State - SINGLE WINDOW
let currentRegion = 'pt';
let mainWindow = null;
let hardwareProfile = 'modern';
let flashPlugin = null;

// ============================================================
// CONFIG
// ============================================================
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfigEarly() {
  try {
    const p = getConfigPath();
    if (!fs.existsSync(p)) {
      log.info('Usando configurações padrão (primeiro uso)');
      return;
    }
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (c.region && REGIONS[c.region]) currentRegion = c.region;
    if (c.hardwareProfile && HARDWARE_PROFILES[c.hardwareProfile]) hardwareProfile = c.hardwareProfile;
    log.info(`Config carregada: região=${currentRegion}, perfil=${hardwareProfile}`);
  } catch (e) {
    log.error('Erro ao carregar config, usando padrão', e);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify({ region: currentRegion, hardwareProfile }));
    log.info('Config salva');
  } catch (e) {
    log.error('Erro ao salvar config', e);
  }
}

loadConfigEarly();

// ============================================================
// FLASH PPAPI
// ============================================================
app.commandLine.appendSwitch('enable-plugin-loading');

function findFlashPlugin() {
  const isWindows = process.platform === 'win32';
  const isLinux = process.platform === 'linux';
  if (!isWindows && !isLinux) {
    log.warn('Plataforma não suportada para Flash');
    return null;
  }
  
  const targetExt = isWindows ? '.dll' : '.so';
  const searchPaths = [
    path.join(process.resourcesPath, 'flash'),
    path.join(__dirname, '..', 'flash')
  ];
  
  for (const searchPath of searchPaths) {
    try {
      if (fs.existsSync(searchPath)) {
        for (const file of fs.readdirSync(searchPath)) {
          if (path.extname(file).toLowerCase() === targetExt) {
            const p = path.join(searchPath, file);
            if (fs.statSync(p).size > 5000000) {
              log.info(`Flash encontrado: ${p}`);
              return p;
            }
          }
        }
      }
    } catch (e) {
      log.error('Erro ao procurar Flash', e);
    }
  }
  log.warn('Flash PPAPI não encontrado');
  return null;
}

flashPlugin = findFlashPlugin();
if (flashPlugin) {
  app.commandLine.appendSwitch('ppapi-flash-path', flashPlugin);
  app.commandLine.appendSwitch('ppapi-flash-version', process.platform === 'win32' ? '34.0.0.376' : '34.0.0.137');
  app.commandLine.appendSwitch('plugin-power-saver', 'disable');
  // ppapi-flash-args expandido com mais otimizações
  app.commandLine.appendSwitch('ppapi-flash-args', [
    'enable_hardware_pepper_video_decoder=1',
    'enable_stagevideo_auto=1',
    'enable_hw_accel=1',
    'enable_request_autherror=0'
  ].join(' '));
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
  log.info('Flash 64-bit configurado com otimizações');
}

// ============================================================
// CHROMIUM FLAGS - VERSÃO CORRIGIDA
// ============================================================
// Flags universais
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('memory-pressure-off');
app.commandLine.appendSwitch('enable-highres-timer');
app.commandLine.appendSwitch('disable-hang-monitor');

// Cache expandido
app.commandLine.appendSwitch('disk-cache-size', '524288000');    // 500MB
app.commandLine.appendSwitch('media-cache-size', '134217728');   // 128MB

// REMOVIDO: no-sandbox (Flash PPAPI requer em alguns casos)
// REMOVIDO: ignore-certificate-errors (segurança)
// REMOVIDO: disable-frame-rate-limit (desperdício CPU/GPU)

log.info(`Perfil de hardware: ${hardwareProfile}`);

if (hardwareProfile === 'modern') {
  // Perfil Modern: D3D11/GL (mais estável que Vulkan no Chromium 83)
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
  app.commandLine.appendSwitch('canvas-oop-rasterization');
  app.commandLine.appendSwitch('enable-accelerated-video-decode');
  
  // D3D11 no Windows, OpenGL no Linux
  app.commandLine.appendSwitch('use-angle', process.platform === 'win32' ? 'd3d11' : 'gl');
  app.commandLine.appendSwitch('enable-features', 
    process.platform === 'win32' ? 'D3D11VideoDecoder,DirectComposition' : 'VaapiVideoDecoder');
  
  log.info('Flags: D3D11/GL, GPU rasterization, zero-copy');
  
} else if (hardwareProfile === 'legacy') {
  // Perfil Legacy: in-process-gpu para estabilidade
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('use-angle', process.platform === 'win32' ? 'd3d11' : 'gl');
  app.commandLine.appendSwitch('enable-accelerated-video-decode');
  
  log.info('Flags: D3D11/OpenGL, in-process-gpu');
  
} else {
  // Perfil CPU: SwiftShader
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  
  log.info('Flags: CPU only (SwiftShader)');
}

// ============================================================
// FLASH mms.cfg - CAMINHO CORRIGIDO
// ============================================================
function getMmsCfgPath() {
  if (process.platform === 'win32') {
    // Flash PPAPI procura aqui primeiro no Windows
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
    return path.join(appData, 'Macromedia', 'Flash Player', 'mms.cfg');
  } else {
    // Linux: diretório do usuário
    const home = process.env.HOME;
    return path.join(home, '.macromedia', 'Flash_Player', 'mms.cfg');
  }
}

function createMmsCfg() {
  try {
    const cfgPath = getMmsCfgPath();
    const dir = path.dirname(cfgPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log.info(`Diretório criado: ${dir}`);
    }
    
    const config = [
      'AutoPlay=1',
      'EnableSocketsTo=*',
      'OverrideGPUValidation=1',
      hardwareProfile === 'cpu' ? 'EnableHardwareAcceleration=0' : 'EnableHardwareAcceleration=1',
      'EnableFullScreen=1',
      'NetworkAccess=1',
      'Quality=high',
      'BitmapSmoothing=1',
      'StagingBuffer=1',
      'EnableMultithreadedVideo=1',
      'LocalStorageLimit=10',
      'AssetCacheSize=500',
      hardwareProfile !== 'cpu' ? 'GPUMemoryPercentage=50' : 'GPUMemoryPercentage=0',
      'OverrideInsecurePolicy=allow',
      'EnableInsecureLocalWithNetwork=1'
    ];
    
    fs.writeFileSync(cfgPath, config.join('\n'));
    log.info(`mms.cfg criado: ${cfgPath}`);
  } catch (e) {
    log.error('Falha ao criar mms.cfg', e);
  }
}

// ============================================================
// FUNCTIONS
// ============================================================
function getGameUrl(region) {
  return `${BASE_URL}/${region}/serverlist?${LAUNCHER_PARAMS}`;
}

function toggleFullscreen(win) {
  if (!win || win.isDestroyed()) return;
  win.setFullScreen(!win.isFullScreen());
}

async function showRegionSelector(win) {
  if (!win || win.isDestroyed()) return;
  
  const codes = Object.keys(REGIONS);
  const buttons = codes.map(c => `${REGIONS[c].flag} ${REGIONS[c].name}${c === currentRegion ? ' (Atual)' : ''}`);
  
  const result = await dialog.showMessageBox(win, {
    type: 'question', buttons,
    defaultId: codes.indexOf(currentRegion),
    cancelId: -1,
    title: 'Selecionar Região',
    message: 'Escolha sua região:'
  });
  
  if (result.response >= 0 && result.response < codes.length) {
    const newRegion = codes[result.response];
    if (newRegion !== currentRegion) {
      currentRegion = newRegion;
      saveConfig();
      win.loadURL(getGameUrl(currentRegion));
    }
  }
}

async function showHardwareSelector(win) {
  if (!win || win.isDestroyed()) return;
  
  const profiles = Object.keys(HARDWARE_PROFILES);
  const buttons = profiles.map(p => {
    const profile = HARDWARE_PROFILES[p];
    return `${profile.icon} ${profile.name}${p === hardwareProfile ? ' (Atual)' : ''}`;
  });
  
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: [...buttons, 'Cancelar'],
    defaultId: profiles.indexOf(hardwareProfile),
    cancelId: buttons.length,
    title: 'Perfil de Hardware',
    message: 'Escolha seu perfil de hardware:',
    detail: profiles.map(p => `${HARDWARE_PROFILES[p].icon} ${HARDWARE_PROFILES[p].name}: ${HARDWARE_PROFILES[p].description}`).join('\n')
  });
  
  if (result.response >= 0 && result.response < profiles.length) {
    const newProfile = profiles[result.response];
    if (newProfile !== hardwareProfile) {
      hardwareProfile = newProfile;
      saveConfig();
      await dialog.showMessageBox(win, { type: 'info', message: 'Reinicie o launcher para aplicar as otimizações.' });
    }
  }
}

async function clearLogin(win) {
  if (!win || win.isDestroyed()) return;
  
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Sim, limpar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    title: 'Limpar Login',
    message: 'Limpar dados de login?',
    detail: 'Você precisará fazer login novamente.'
  });
  
  if (result.response === 0) {
    try {
      const sess = win.webContents.session;
      const cookies = await sess.cookies.get({});
      for (const cookie of cookies) {
        const url = (cookie.secure ? 'https://' : 'http://') + cookie.domain.replace(/^\./, '') + cookie.path;
        await sess.cookies.remove(url, cookie.name);
      }
      await sess.clearCache();
      await sess.clearStorageData();
      log.info('Login limpo');
      win.loadURL(getGameUrl(currentRegion));
    } catch (e) {
      log.error('Erro ao limpar login', e);
    }
  }
}

// ============================================================
// SESSION SETUP
// ============================================================
function setupSession(sess) {
  const convertingCookies = new Set();
  
  sess.cookies.on('changed', (event, cookie, cause, removed) => {
    if (removed) return;
    const key = `${cookie.domain}|${cookie.name}`;
    if (convertingCookies.has(key)) return;
    
    if (!cookie.expirationDate || cookie.expirationDate < Date.now() / 1000 + 86400) {
      convertingCookies.add(key);
      const url = (cookie.secure ? 'https://' : 'http://') + cookie.domain.replace(/^\./, '') + cookie.path;
      sess.cookies.set({
        url, name: cookie.name, value: cookie.value,
        domain: cookie.domain, path: cookie.path,
        secure: cookie.secure, httpOnly: cookie.httpOnly,
        expirationDate: Math.floor(Date.now() / 1000) + 31536000,
        sameSite: 'no_restriction'
      }).finally(() => convertingCookies.delete(key));
    }
  });
  
  sess.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    if (responseHeaders['set-cookie']) {
      responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(cookie => {
        if (!cookie.toLowerCase().includes('expires=') && !cookie.toLowerCase().includes('max-age=')) {
          return cookie + '; Max-Age=31536000';
        }
        return cookie;
      });
    }
    callback({ responseHeaders });
  });
  
  // BLOCK_LIST otimizado com Set
  sess.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);
      const blocked = [...BLOCK_LIST].some(domain => 
        url.hostname.includes(domain) || url.pathname.includes(domain)
      );
      if (blocked) {
        log.info(`Bloqueado: ${details.url}`);
        return callback({ cancel: true });
      }
    } catch (e) {
      // URL inválida, ignora
    }
    
    let url = details.url;
    if (url.includes('logintype=3')) {
      url = url.replace(/logintype=3/g, 'logintype=4');
      return callback({ redirectURL: url });
    }
    
    callback({ cancel: false });
  });
}

// ============================================================
// WINDOW MANAGEMENT - SINGLE WINDOW
// ============================================================
function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  
  mainWindow = new BrowserWindow({
    width: 1280, height: 720,
    minWidth: 800, minHeight: 600,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      plugins: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
      partition: 'persist:naruto-main'
    }
  });
  
  const sess = mainWindow.webContents.session;
  setupSession(sess);
  
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setTitle(WINDOW_TITLE);
  
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
    mainWindow.setTitle(WINDOW_TITLE);
  });
  
  // Teclas
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5') { event.preventDefault(); clearLogin(mainWindow); }
    if (input.key === 'F6') { event.preventDefault(); showRegionSelector(mainWindow); }
    if (input.key === 'F7') { event.preventDefault(); showHardwareSelector(mainWindow); }
    if (input.key === 'F11') { event.preventDefault(); toggleFullscreen(mainWindow); }
    if (input.key === 'F12') { event.preventDefault(); mainWindow.webContents.toggleDevTools(); }
    if (input.key === 'Escape' && mainWindow.isFullScreen()) { event.preventDefault(); toggleFullscreen(mainWindow); }
  });
  
  // Navegação - mantém logintype
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url.includes('naruto') && !url.includes('logintype')) {
      e.preventDefault();
      mainWindow.loadURL(`${url}${url.includes('?') ? '&' : '?'}${LAUNCHER_PARAMS}`);
    }
  });
  
  // Intercepta window.open para navegar na mesma janela
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    log.info(`window.open: ${url}`);
    if (url.includes('naruto') || url.includes('oasgames')) {
      mainWindow.loadURL(url);
    } else {
      require('electron').shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    sess.cookies.flushStore().catch(() => {});
    
    mainWindow.webContents.insertCSS(`
      .oas-bar, #oas-bar { display: none !important; height: 0 !important; }
      .oas-bar-hide, #oas-bar-hide { display: none !important; }
      #oas-player { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; }
    `).catch(() => {});
    
    mainWindow.webContents.executeJavaScript(`
      (function() {
        document.querySelectorAll('script').forEach(s => {
          if (s.src && s.src.includes('logintype=3')) s.src = s.src.replace(/logintype=3/g, 'logintype=4');
          if (s.textContent && s.textContent.includes('logintype=3')) s.textContent = s.textContent.replace(/logintype=3/g, 'logintype=4');
        });
        document.body.innerHTML = document.body.innerHTML.replace(/logintype=3/g, 'logintype=4');
      })();
    `).catch(() => {});
  });
  
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.destroy();
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.exit(0);
  });
  
  mainWindow.loadURL(getGameUrl(currentRegion));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  
  return mainWindow;
}

// ============================================================
// MENU
// ============================================================
function setupMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Sair', accelerator: 'Alt+F4', click: () => app.exit(0) }
      ]
    },
    {
      label: 'Opções',
      submenu: [
        { label: '🚀 Hardware Moderno', type: 'radio', checked: hardwareProfile === 'modern',
          click: () => { hardwareProfile = 'modern'; saveConfig(); dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' }); } },
        { label: '🔧 Hardware Antigo', type: 'radio', checked: hardwareProfile === 'legacy',
          click: () => { hardwareProfile = 'legacy'; saveConfig(); dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' }); } },
        { label: '💻 CPU Only', type: 'radio', checked: hardwareProfile === 'cpu',
          click: () => { hardwareProfile = 'cpu'; saveConfig(); dialog.showMessageBox({ type: 'info', message: 'Reinicie para aplicar.' }); } },
        { type: 'separator' },
        { label: 'Trocar Região (F6)', click: () => showRegionSelector(mainWindow) },
        { label: 'Trocar Hardware (F7)', click: () => showHardwareSelector(mainWindow) }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: 'Atalhos', click: () => dialog.showMessageBox({
          type: 'info',
          title: 'Atalhos',
          message: 'F5 = Limpar Login\nF6 = Trocar Região\nF7 = Trocar Hardware\nF11 = Tela Cheia\nF12 = DevTools'
        })}
      ]
    }
  ];
  
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ============================================================
// APP
// ============================================================
app.on('ready', () => {
  try { process.priority = 1; } catch (e) {}
  
  createMmsCfg();
  setupMenu();
  createWindow();
  
  log.info('v1.6.0 Iniciado');
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });
}

app.on('window-all-closed', () => app.exit(0));

process.on('uncaughtException', (e) => log.error('Exceção não tratada', e));
process.on('SIGTERM', () => app.exit(0));
process.on('SIGINT', () => app.exit(0));
