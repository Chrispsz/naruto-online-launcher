// Dynamic scale — set <html> font-size based on screen width so the
// whole UI (built in rem) grows on larger/higher-DPI displays. Mirrors the
// @media breakpoints in CSS as a JS fallback (window.screen.width is the
// physical display width, more reliable than innerWidth for an Electron window).
(function applyDynamicScale() {
  var w = window.screen && window.screen.width ? window.screen.width : window.innerWidth;
  var base = 14;
  if (w >= 2560) base = 18;
  else if (w >= 1920) base = 16;
  else if (w >= 1366) base = 15;
  document.documentElement.style.fontSize = base + 'px';
})();

const { ipcRenderer } = require('electron');
// tiny debounce helper (zero deps) used to coalesce bursty IPC
// events that each rebuild the entire profile grid (DOM thrash). See
// src/utils/throttle.js for the implementation + tests.
const { debounce } = require('../utils/throttle');
// 6 real Naruto Online server clusters (br/na/de/es/pl/fr).
// Each cluster has its own language and event schedule. Legacy codes (eu/hk/pt/en)
// are accepted by the backend (regions.js + store.js) and auto-migrated:
// eu→na, hk→na, pt→br, en→na. Old profiles load without error.
// Flags are inline SVG (not emoji) — regional-indicator flag emojis do
// NOT render on Windows (show as letter-pairs/tofu). SVG renders identically on
// every platform (Windows/Linux/macOS), so the mock print matches the real app.
const FLAG_SVG = {
  br: '<svg viewBox="0 0 20 15"><rect width="20" height="15" fill="#009b3a"/><path d="M10 2.5L18 7.5L10 12.5L2 7.5Z" fill="#fedf00"/><circle cx="10" cy="7.5" r="3" fill="#002776"/></svg>',
  na: '<svg viewBox="0 0 20 15"><rect width="20" height="15" fill="#fff"/><rect width="20" height="3" fill="#b22234"/><rect y="6" width="20" height="3" fill="#b22234"/><rect y="12" width="20" height="3" fill="#b22234"/><rect width="8" height="8" fill="#3c3b6e"/></svg>',
  de: '<svg viewBox="0 0 20 15"><rect width="20" height="5" fill="#000"/><rect y="5" width="20" height="5" fill="#dd0000"/><rect y="10" width="20" height="5" fill="#ffce00"/></svg>',
  es: '<svg viewBox="0 0 20 15"><rect width="20" height="15" fill="#c60b1e"/><rect y="3.75" width="20" height="7.5" fill="#ffc400"/></svg>',
  pl: '<svg viewBox="0 0 20 15"><rect width="20" height="7.5" fill="#fff"/><rect y="7.5" width="20" height="7.5" fill="#dc143c"/></svg>',
  fr: '<svg viewBox="0 0 20 15"><rect width="6.67" height="15" fill="#0055a4"/><rect x="6.67" width="6.67" height="15" fill="#fff"/><rect x="13.33" width="6.67" height="15" fill="#ef4135"/></svg>'
};
const REGIONS = {
  br: '<span class="flag">' + FLAG_SVG.br + '</span>BR',
  na: '<span class="flag">' + FLAG_SVG.na + '</span>NA',
  de: '<span class="flag">' + FLAG_SVG.de + '</span>DE',
  es: '<span class="flag">' + FLAG_SVG.es + '</span>ES',
  pl: '<span class="flag">' + FLAG_SVG.pl + '</span>PL',
  fr: '<span class="flag">' + FLAG_SVG.fr + '</span>FR'
};

window.api = {
  fetchServers: r => ipcRenderer.invoke('servers:fetch', r),
  // Auto-create account flow (profile modal "Create automatically" button)
  createTempmail: opts => ipcRenderer.invoke('tempmail:create', opts),
  // Export diagnostics zip (logs + config + system info, sanitized)
  exportDiag: () => ipcRenderer.invoke('diagnostics:export'),
  // Optimization (GPU + CPU + lowpc toggle)
  getOptimizationStatus: () => ipcRenderer.invoke('optimization:get-status')
};

let profiles = [];
let selectedRegion = 'br';
let editingId = null;
let vaultId = null;
let notificationsMuted = false;
// Track open game windows and auto-login status per profile (real-time)
let openWindows = {}; // { profileId: true }
let autoLoginStatus = {}; // { profileId: 'idle'|'loading'|'success'|'error' }
// i18n strings (loaded from main process on init)
let i18nStrings = {};
let currentLang = 'pt';

// i18n helper — t(key) returns translated string
function t(key) {
  return i18nStrings[key] || key;
}

// Apply i18n to all elements with data-i18n attribute
// Only set textContent on leaf elements (no element children) —
// otherwise we'd wipe SVG icons inside nav-items / buttons that carry data-i18n
// on their parent for accessibility. Non-leaf elements get their first text node updated.
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    var val = t(key);
    if (el.children.length === 0) {
      el.textContent = val;
    } else {
      // Update only the first text node, preserve child elements
      var firstText = null;
      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
          firstText = el.childNodes[i];
          break;
        }
      }
      if (firstText) {
        firstText.nodeValue = val;
      } else {
        // No text node — prepend one
        el.insertBefore(document.createTextNode(val), el.firstChild);
      }
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    var key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
    var key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
}

// Coalesce bursty status-driven re-renders into a single
// trailing-edge render (~1 frame). State mutations stay synchronous; only
// the DOM rebuild is debounced. See renderProfiles() for the render body
// and the IPC handlers below for the call sites.
//
// Why: When a game launches, 3-5 IPC events fire in <100ms
// (game-window:status open → auto-login:status loading → success →
// possibly profiles:updated). Each uncoalesced call rebuilds the whole
// grid (innerHTML reset + N card createElement + addEventListener per
// card). Debouncing collapses the burst into one render.
//
// leading:false + trailing:true (default) — we don't need a leading fire
// because the burst always settles within ~50ms and we want the LAST
// status to be the one rendered.
var debouncedRenderProfiles = debounce(function () {
  renderProfiles();
}, 16);

// ── IPC ──
ipcRenderer.on('profiles:updated', (_e, list) => {
  profiles = list;
  renderProfiles();
  renderRegionTabs();
});
ipcRenderer.on('events:update', (_e, data) => renderEvents(data));
ipcRenderer.on('profile:toast', (_e, t) => toast(t.msg, t.type));
ipcRenderer.on('auto-login:result', (_e, data) => {
  var p = profiles.find(function (x) {
    return x.id === data.profileId;
  });
  var name = p ? p.name : data.profileId;
  if (data.result === 'filled') {
    toast('Auto-login: credentials injected (' + name + ')', 'ok');
  } else if (data.result === 'clicked') {
    toast('Auto-login: button clicked (' + name + ')', 'ok');
  } else if (data.result === 'error') {
    toast('Auto-login: error (' + name + ')', 'err');
  }
});
// Real-time status updates for auto-login and window open state.
// Simpler — just re-render the affected card to keep DOM + state in sync.
// Debounced — these handlers fire in bursts of 3-5 events when
// a game launches. State (autoLoginStatus, openWindows) is mutated
// synchronously above; only renderProfiles is debounced so the LAST status
// in the burst wins. See debouncedRenderProfiles above.
ipcRenderer.on('auto-login:status', (_e, data) => {
  if (!data || !data.profileId) return;
  autoLoginStatus[data.profileId] = data.status || 'idle';
  debouncedRenderProfiles();
});
ipcRenderer.on('game-window:status', (_e, data) => {
  if (!data || !data.profileId) return;
  if (data.open) openWindows[data.profileId] = true;
  else {
    delete openWindows[data.profileId];
    delete autoLoginStatus[data.profileId];
  }
  debouncedRenderProfiles();
});

// ── Navigation ──
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    const view = item.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');
    // Title from the span[data-i18n] inside the nav-item, so the badge
    // count doesn't leak into the topbar title.
    var labelSpan = item.querySelector('span[data-i18n]');
    document.getElementById('viewTitle').textContent = labelSpan
      ? labelSpan.textContent.trim()
      : item.textContent.trim();
    // "Nova conta" button only makes sense on Accounts view — hide elsewhere.
    var newBtn = document.getElementById('newBtn');
    if (newBtn) newBtn.style.display = view === 'accounts' ? '' : 'none';
    if (view === 'settings') loadSettings();
  });
});

// The account-count chip in the toolbar shows the total count.

// ── Render: Profiles ──
function renderProfiles() {
  const grid = document.getElementById('profileGrid');
  grid.className = 'grid';
  let filtered = applySorting(profiles.slice());
  var countEl = document.getElementById('accountCount');
  if (countEl) {
    var total = profiles.length;
    var label = currentLang === 'pt' ? (total === 1 ? 'conta' : 'contas') : (total === 1 ? 'account' : 'accounts');
    countEl.textContent = total + ' ' + label;
  }
  if (!profiles.length) {
    var emptyTitle = currentLang === 'pt' ? 'Nenhuma conta ainda' : 'No accounts yet';
    var emptyBody =
      currentLang === 'pt'
        ? 'Crie sua primeira conta para começar sua jornada shinobi.'
        : 'Create your first account to start your shinobi journey.';
    var emptyBtnText = currentLang === 'pt' ? '+ Nova conta' : '+ New account';
    // VLM-flagged empty state — added shuriken SVG mark + glow CTA.
    grid.innerHTML =
      '<div class="empty">' +
      '<svg class="empty-mark" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>' +
      '<h3>' + emptyTitle + '</h3>' +
      '<p>' + emptyBody + '</p>' +
      '<button class="btn primary" id="emptyNewBtn">' + emptyBtnText + '</button>' +
      '</div>';
    var emptyBtn = document.getElementById('emptyNewBtn');
    if (emptyBtn)
      emptyBtn.addEventListener('click', function () {
        document.getElementById('newBtn').click();
      });
    return;
  }
  if (!filtered.length) {
    grid.innerHTML = '';
    return;
  }
  grid.innerHTML = '';
  // Batch cards into a DocumentFragment and append once — avoids N separate
  // reflows (one per grid.appendChild) for ~30-card profile grids. Layout is
  // computed a single time after all cards are in the fragment. Standard DOM
  // optimization, critical on the launcher's low-spec target machines.
  const frag = document.createDocumentFragment();
  filtered.forEach(function (p) {
    const card = document.createElement('div');
    card.tabIndex = 0;
    card.className = 'card' + (p.hasVault ? ' has-vault' : '');
    card.setAttribute('data-card-id', p.id);
    var editLabel = currentLang === 'pt' ? 'Editar' : 'Edit';
    var vaultLabel = currentLang === 'pt' ? 'Credenciais' : 'Credentials';
    var delLabel = currentLang === 'pt' ? 'Excluir' : 'Delete';
    var openLabel = currentLang === 'pt' ? 'aberta' : 'open';
    var playLabel = currentLang === 'pt' ? 'Jogar' : 'Play';
    var serverText = p.server ? esc(p.server.toUpperCase()) : (currentLang === 'pt' ? 'sem servidor' : 'no server');
    var statusDotHtml = '';
    if (openWindows[p.id]) {
      // Window open → green dot + "open" label inline.
      statusDotHtml =
        '<span class="card-status open"><span class="dot"></span>' + openLabel + '</span>';
    } else if (p.hasVault && autoLoginStatus[p.id] && autoLoginStatus[p.id] !== 'idle') {
      // Auto-login in flight (loading/success/error) — show subtle status text.
      var st = autoLoginStatus[p.id];
      var stLabel = getStatusLabel(st);
      statusDotHtml =
        '<span class="card-status ' + st + '"><span class="dot"></span>' + stLabel + '</span>';
    }
    card.innerHTML = `
      <div class="card-head">
        <div class="card-head-info">
          <div class="name-row">
            <span class="name">${esc(p.name)}</span>${p.hasVault ? '<span class="lock" title="Auto-login ativo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>' : ''}
          </div>
          <div class="meta-row">
            <span class="region">${REGIONS[p.region] || '—'}</span>
            <span class="meta-sep">·</span>
            <span class="server-text">${serverText}</span>
            ${statusDotHtml ? '<span class="meta-sep">·</span>' + statusDotHtml : ''}
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn sm btn-play" data-act="launch"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${playLabel}</button>
        <div class="secondary-actions">
          <button class="btn sm btn-icon-only" data-act="edit" data-tip="${editLabel}" title="${editLabel}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn sm btn-icon-only" data-act="vault" data-tip="${vaultLabel}" title="${vaultLabel}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></button>
          <button class="btn sm btn-icon-only btn-danger-ghost" data-act="del" data-tip="${delLabel}" title="${delLabel}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      </div>`;
    card.addEventListener('click', () => launch(p.id));
    card.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'launch') launch(p.id);
        else if (act === 'edit') edit(p.id);
        else if (act === 'vault') openVault(p.id);
        else if (act === 'del') del(p.id);
      });
    });
    frag.appendChild(card);
  });
  grid.appendChild(frag);
}

// Sort profiles alphabetically by name.
function applySorting(list) {
  var sorted = list.slice();
  sorted.sort(function (a, b) {
    return (a.name || '').localeCompare(b.name || '');
  });
  return sorted;
}

// Helper — human label for auto-login card-status indicator
function getStatusLabel(status) {
  switch (status) {
    case 'loading':
      return currentLang === 'pt' ? 'preenchendo' : 'filling';
    case 'success':
      return currentLang === 'pt' ? 'logado' : 'logged in';
    case 'error':
      return currentLang === 'pt' ? 'falhou' : 'failed';
    case 'idle':
    default:
      return currentLang === 'pt' ? 'pronto' : 'ready';
  }
}

// ── Render: Events ──
// renderEventsSingle is assigned later in this file as an expanded bilingual
// implementation (DocumentFragment batching + Date.now() hoist). Declared here
// as a module-scope var so the assignment site can overwrite it without
// triggering no-undef. All callers (region-tab switch, renderEvents, events:get
// promise resolution) resolve to the expanded version after top-level execution.
var renderEventsSingle;

function renderRegionTabs() {
  const tabs = document.getElementById('regionTabs');
  const active = [...new Set(profiles.map(p => p.region))];
  const regions = active.length ? active : ['br'];
  if (!regions.includes(selectedRegion)) selectedRegion = regions[0];
  tabs.innerHTML = '';
  regions.forEach(r => {
    const t = document.createElement('span');
    t.className = 'tab' + (r === selectedRegion ? ' active' : '');
    t.innerHTML = REGIONS[r] || r;
    t.addEventListener('click', () => {
      selectedRegion = r;
      renderRegionTabs();
      ipcRenderer.invoke('events:get', selectedRegion).then(renderEventsSingle);
    });
    tabs.appendChild(t);
  });
}

function renderEvents(data) {
  if (!data || !data.byRegion) return;
  // store globally for updateEventBadge (active events count)
  lastEventsByRegion = data.byRegion;
  renderEventsSingle(data.byRegion[selectedRegion] || data.byRegion['br'] || []);
  updateEventBadge();
}

// ── Actions ──
function launch(id) {
  ipcRenderer.send('profile:launch', id);
  var p = profiles.find(function (x) {
    return x.id === id;
  });
  if (p) {
    localStorage.setItem('shinobi-last-profile', id);
  }
}
function edit(id) {
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = currentLang === 'pt' ? 'Editar conta' : 'Edit account';
  document.getElementById('fName').value = p.name;
  document.getElementById('fServer').value = p.server;
  document.getElementById('fRegion').value = p.region;
  // hide auto-create button in edit mode
  document.getElementById('autoCreateBtn').style.display = 'none';
  document.getElementById('profileModal').classList.add('show');
}
async function del(id) {
  if (!confirm(currentLang === 'pt' ? 'Excluir esta conta? Cookies e credenciais serão apagados.' : 'Delete this account? Cookies and credentials will be cleared.')) return;
  ipcRenderer.send('profile:delete', id);
  // If last profile was this one, clear
  if (localStorage.getItem('shinobi-last-profile') === id) {
    localStorage.removeItem('shinobi-last-profile');
  }
}
async function openVault(id) {
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  vaultId = id;
  // show the profile name + server in the modal subtitle.
  var nameEl = document.getElementById('vaultProfileName');
  if (nameEl) {
    nameEl.textContent = p.name + (p.server ? ' • ' + p.server : '');
  }
  const creds = await ipcRenderer.invoke('vault:get', id);
  document.getElementById('fVaultUser').value = creds ? creds.user : '';
  document.getElementById('fVaultPass').value = creds ? creds.pass : '';
  // Reset password visibility
  document.getElementById('fVaultPass').type = 'password';
  document.getElementById('eyeIcon').innerHTML =
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  document.getElementById('vaultModal').classList.add('show');
}

// ── Modal: Profile ──
document.getElementById('newBtn').onclick = () => {
  editingId = null;
  document.getElementById('modalTitle').textContent = currentLang === 'pt' ? 'Nova conta' : 'New account';
  document.getElementById('fName').value = '';
  document.getElementById('fServer').value = '';
  document.getElementById('fRegion').value = 'br';
  // show auto-create button in create mode
  document.getElementById('autoCreateBtn').style.display = '';
  document.getElementById('profileModal').classList.add('show');
};
document.getElementById('cancelProfile').onclick = () =>
  document.getElementById('profileModal').classList.remove('show');
// modal close button (X) — same behavior as Cancel
(function () {
  var closeBtn = document.getElementById('closeProfileModal');
  if (closeBtn) {
    closeBtn.onclick = () =>
      document.getElementById('profileModal').classList.remove('show');
  }
})();
document.getElementById('saveProfile').onclick = () => {
  const opts = {
    name: document.getElementById('fName').value.trim(),
    server: document.getElementById('fServer').value.trim(),
    region: document.getElementById('fRegion').value
  };
  if (!opts.name) {
    toast(currentLang === 'pt' ? 'Informe um nome' : 'Name is required', 'err');
    return;
  }
  if (editingId) {
    ipcRenderer.send('profile:update', Object.assign({ id: editingId }, opts));
  } else {
    ipcRenderer.send('profile:create', opts);
  }
  document.getElementById('profileModal').classList.remove('show');
};

// Auto-create account — tempmail + register + vault + auto-login
document.getElementById('autoCreateBtn').onclick = async function () {
  var name = document.getElementById('fName').value.trim();
  var server = document.getElementById('fServer').value.trim();
  var region = document.getElementById('fRegion').value;
  if (!name) {
    toast(currentLang === 'pt' ? 'Informe um nome' : 'Name is required', 'err');
    return;
  }
  if (!server) {
    toast(currentLang === 'pt' ? 'Informe o servidor (ex.: S1)' : 'Enter the server (e.g.: S1)', 'err');
    return;
  }
  if (editingId) {
    toast(currentLang === 'pt' ? 'Use "Salvar" para editar perfis existentes' : 'Use "Save" to edit existing profiles', 'err');
    return;
  }
  var btn = document.getElementById('autoCreateBtn');
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    var result = await window.api.createTempmail({
      name: name,
      server: server,
      region: region,
      language: currentLang || 'pt'
    });
    if (result && result.ok) {
      document.getElementById('profileModal').classList.remove('show');
    }
  } catch (e) {
    toast(currentLang === 'pt' ? 'Falha ao criar conta: ' + (e && e.message ? e.message : e) : 'Failed to create account: ' + (e && e.message ? e.message : e), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

// ── Modal: Vault ──
document.getElementById('cancelVault').onclick = () =>
  document.getElementById('vaultModal').classList.remove('show');
// modal close button (X) for vault — same behavior as Cancel
(function () {
  var closeBtn = document.getElementById('closeVaultModal');
  if (closeBtn) {
    closeBtn.onclick = () =>
      document.getElementById('vaultModal').classList.remove('show');
  }
})();
document.getElementById('saveVault').onclick = async () => {
  const u = document.getElementById('fVaultUser').value;
  const p = document.getElementById('fVaultPass').value;
  if (!u || !p) {
    toast(currentLang === 'pt' ? 'Usuário e senha obrigatórios' : 'Username and password are required', 'err');
    return;
  }
  await ipcRenderer.invoke('vault:set', vaultId, u, p);
  toast(currentLang === 'pt' ? 'Credenciais salvas' : 'Credentials saved', 'ok');
  document.getElementById('vaultModal').classList.remove('show');
};
document.getElementById('removeVault').onclick = async () => {
  if (!confirm(currentLang === 'pt' ? 'Remover credenciais?' : 'Remove credentials?')) return;
  await ipcRenderer.invoke('vault:remove', vaultId);
  toast(currentLang === 'pt' ? 'Credenciais removidas' : 'Credentials removed', 'ok');
  document.getElementById('vaultModal').classList.remove('show');
};

// ── Password visibility toggle ──
document.getElementById('togglePass').onclick = function () {
  const inp = document.getElementById('fVaultPass');
  const icon = document.getElementById('eyeIcon');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.innerHTML =
      '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    inp.type = 'password';
    icon.innerHTML =
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
};

// ── Settings ──
async function loadSettings() {
  document.getElementById('setNotifications').classList.toggle('on', !notificationsMuted);
  // load optimization panel (GPU + CPU + presets)
  loadOptimization().catch(function (e) {
    console.error('loadOptimization failed:', e);
  });
}

// ── Optimization Panel ──────────────────────────────────────────
// Two functional toggles: Force CPU rendering (for broken/weak GPUs) and
// Low-end PC mode (sacrifice Flash quality for FPS).
// All optimizations are REAL — applied by CpuOptimizer.js / GpuDetector /
// main/flags.js. Smart optimization is always on (no row needed — the
// section header carries an "Automatic" hint instead).
async function loadOptimization() {
  const status = await window.api.getOptimizationStatus();
  if (!status) return;

  // Force CPU rendering toggle — reflects persisted hardwareProfile.
  const cpuRenderToggle = document.getElementById('setCpuRender');
  if (cpuRenderToggle) {
    cpuRenderToggle.classList.toggle('on', status.cpuRender === true);
  }

  // Low-end PC mode toggle — reflects persisted advancedMode state.
  const lowpcToggle = document.getElementById('setLowpc');
  if (lowpcToggle) {
    lowpcToggle.classList.toggle('on', status.advancedMode === true);
  }
}

// Force CPU rendering toggle handler.
// Toggles config.hardwareProfile between 'auto' and 'cpu' via IPC. When 'cpu',
// flags.js applies --disable-gpu + --use-gl=swiftshader (Linux). This is a REAL
// functional change for users with broken/very weak GPUs. Requires restart.
(function wireCpuRenderToggle() {
  var toggle = document.getElementById('setCpuRender');
  if (!toggle) return;
  toggle.addEventListener('click', async function () {
    var currentlyOn = toggle.classList.contains('on');
    var next = !currentlyOn;
    try {
      var res = await ipcRenderer.invoke('optimization:set-cpu-render', next);
      if (res && res.ok) {
        toggle.classList.toggle('on', next);
        var hint = document.getElementById('presetRestartHint');
        if (hint && res.changed) hint.style.display = 'flex';
        toast(
          next
            ? (currentLang === 'pt' ? 'Renderização por CPU ativada — reinicie para aplicar' : 'CPU rendering enabled — restart to apply')
            : (currentLang === 'pt' ? 'GPU reativada — reinicie para aplicar' : 'GPU re-enabled — restart to apply'),
          'ok'
        );
      } else {
        toast('Error: ' + (res && res.error ? res.error : 'failed'), 'err');
      }
    } catch (e) {
      toast('Error: ' + e.message, 'err');
    }
  });
})();

// Low-end PC mode toggle handler.
// Toggles config.advancedMode via IPC; backend re-creates mms.cfg immediately.
// Restart hint shows because the Flash plugin reads mms.cfg at game-launch time
// (existing open windows won't pick up the change until relaunched).
(function wireLowpcToggle() {
  var toggle = document.getElementById('setLowpc');
  if (!toggle) return;
  toggle.addEventListener('click', async function () {
    var currentlyOn = toggle.classList.contains('on');
    var next = !currentlyOn;
    try {
      var res = await ipcRenderer.invoke('optimization:set-lowpc', next);
      if (res && res.ok) {
        toggle.classList.toggle('on', next);
        var hint = document.getElementById('presetRestartHint');
        if (hint && res.changed) hint.style.display = 'flex';
        toast(
          next
            ? (currentLang === 'pt' ? 'Modo PC Fraco ativado — reabra o jogo para aplicar' : 'Low-end PC mode enabled — reopen the game to apply')
            : (currentLang === 'pt' ? 'Modo PC Fraco desativado' : 'Low-end PC mode disabled'),
          'ok'
        );
      } else {
        toast('Error: ' + (res && res.error ? res.error : 'failed'), 'err');
      }
    } catch (e) {
      toast('Error: ' + e.message, 'err');
    }
  });
})();

// Restart button (applies to either toggle's restart hint)
document.getElementById('btnRestartForPreset').onclick = function () {
  require('electron').ipcRenderer.send('app:relaunch');
};

// ──────────────────────────────────────────────────────────────────────────

// Encrypted backup (uses existing IPC handlers from controller.js)
document.getElementById('advBackupExport').onclick = async function () {
  var pwd = prompt(currentLang === 'pt' ? 'Digite uma senha para criptografar o backup (mín. 6 caracteres):' : 'Enter a password to encrypt the backup (min. 6 characters):');
  if (!pwd) return;
  if (pwd.length < 6) {
    toast('Password too short', 'err');
    return;
  }
  this.disabled = true;
  this.textContent = 'Exporting...';
  try {
    var res = await ipcRenderer.invoke('profiles:export-encrypted', pwd);
    if (res && res.ok) {
      toast('Backup saved: ' + res.count + ' profiles', 'ok');
    } else if (res && res.canceled) {
      // user canceled save dialog
    } else {
      toast('Error: ' + (res && res.error ? res.error : 'failed'), 'err');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
  this.disabled = false;
  this.textContent = 'Export';
};

document.getElementById('advBackupImport').onclick = async function () {
  var pwd = prompt(currentLang === 'pt' ? 'Digite a senha do backup:' : 'Enter the backup password:');
  if (!pwd) return;
  this.disabled = true;
  this.textContent = 'Importing...';
  try {
    var res = await ipcRenderer.invoke('profiles:import-encrypted', pwd);
    if (res && res.ok) {
      toast('Imported: ' + res.imported + ' | Skipped: ' + res.skipped, 'ok');
    } else if (res && res.canceled) {
      // user canceled open dialog
    } else {
      toast('Error: ' + (res && res.error ? res.error : 'failed'), 'err');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
  this.disabled = false;
  this.textContent = 'Import';
};

// Export diagnostics zip — controller handles save dialog + success/error toast
// (emitted via profile:toast IPC). Here we only guard the button state + catch unexpected errors.
document.getElementById('advExportDiag').onclick = async function () {
  this.disabled = true;
  this.textContent = currentLang === 'pt' ? 'Gerando .zip...' : 'Generating .zip...';
  try {
    await window.api.exportDiag();
  } catch (e) {
    toast('Failed to export diagnostics: ' + e.message, 'err');
  }
  this.disabled = false;
  this.textContent = currentLang === 'pt' ? 'Exportar .zip' : 'Export .zip';
};

// Open GitHub repo  ·  also wire the "Report issue" link
(function wireAboutLinks() {
  var repo = document.getElementById('advAboutRepo');
  if (repo) {
    repo.onclick = function (e) {
      e.preventDefault();
      try {
        require('electron').shell.openExternal(
          'https://github.com/Chrispsz/naruto-online-launcher'
        );
      } catch (_) {
        toast('Abra: github.com/Chrispsz/naruto-online-launcher', 'ok');
      }
    };
  }
  var issues = document.getElementById('advAboutIssues');
  if (issues) {
    issues.onclick = function (e) {
      e.preventDefault();
      try {
        require('electron').shell.openExternal(
          'https://github.com/Chrispsz/naruto-online-launcher/issues'
        );
      } catch (_) {
        toast('Abra: github.com/Chrispsz/naruto-online-launcher/issues', 'ok');
      }
    };
  }
})();

// Notifications toggle — wired to BOTH the Settings switch and the
// mute button on the Events header. They stay in sync.
function toggleNotificationsMute() {
  notificationsMuted = !notificationsMuted;
  var setN = document.getElementById('setNotifications');
  if (setN) setN.classList.toggle('on', !notificationsMuted);
  var mb = document.getElementById('muteBtn');
  if (mb) mb.classList.toggle('on', notificationsMuted);
  ipcRenderer.send('events:set-muted', notificationsMuted);
  toast(
    notificationsMuted
      ? (currentLang === 'pt' ? 'Notificações mudadas' : 'Notifications muted')
      : (currentLang === 'pt' ? 'Notificações ativas' : 'Notifications active'),
    'info'
  );
}
document.getElementById('setNotifications').onclick = toggleNotificationsMute;
(function wireMuteBtn() {
  var mb = document.getElementById('muteBtn');
  if (!mb) return;
  mb.addEventListener('click', toggleNotificationsMute);
})();

// Optimization preset cards (performance/balanced/quality) — single source of truth.

// Reminder time selector — fires notifications N minutes before event start.
// Stored in config via IPC, defaults to 5 min.
document.getElementById('setRemind').onchange = async function () {
  var min = parseInt(this.value, 10);
  if (isNaN(min) || min < 0) return;
  try {
    await ipcRenderer.invoke('events:set-remind', min);
    toast(
      currentLang === 'pt'
        ? 'Reminder set to ' + min + ' min before'
        : 'Reminder set to ' + min + ' min before',
      'ok'
    );
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
};

// ── Server Selector ──
document.getElementById('btnPickServer').onclick = async () => {
  const region = document.getElementById('fRegion').value;
  const btn = document.getElementById('btnPickServer');
  const hint = document.getElementById('serverHint');
  btn.disabled = true;
  btn.textContent = currentLang === 'pt' ? 'Buscando...' : 'Searching...';
  hint.textContent = currentLang === 'pt' ? 'Carregando servidores...' : 'Loading servers...';
  try {
    const servers = await window.api.fetchServers(region);
    if (!servers || !servers.length) {
      hint.textContent = currentLang === 'pt' ? 'Nenhum servidor encontrado.' : 'No servers found.';
    } else {
      const recent = servers
        .slice(0, 20)
        .map(s => 'S' + s.number)
        .join(' ');
      hint.innerHTML =
        '<strong>' + (currentLang === 'pt' ? 'Recentes:' : 'Recent:') + '</strong> ' +
        esc(recent) +
        '<br><span style="color:var(--text-faint);font-size:var(--font-xs)">' +
        servers.length +
        ' ' + (currentLang === 'pt' ? 'servidores total' : 'servers total') + '</span>';
    }
  } catch (e) {
    hint.textContent = 'Error: ' + e.message;
  }
  btn.disabled = false;
  btn.textContent = currentLang === 'pt' ? 'Buscar' : 'Search';
};

// ── Keyboard ──

// ── Utils ──
// Hoisted to module scope — avoids creating a new object literal on every
// regex match inside esc(). The map is identical across all esc() calls,
// so allocating it per-match was pure waste (1 allocation per special char).
var _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
var _ESC_REGEX = /[&<>"']/g;
function esc(s) {
  return String(s || '').replace(_ESC_REGEX, c => _ESC_MAP[c]);
}
// Toast timing (ms). TOAST_VISIBLE_MS controls how long the toast stays on
// screen before starting its fade-out; TOAST_FADE_MS matches the CSS transition
// duration on .toast.hiding — must stay in sync with styles.css.
const TOAST_VISIBLE_MS = 2800;
const TOAST_FADE_MS = 200;
let toastT;
function toast(msg, type) {
  const t = document.getElementById('toast');
  const iconSvg =
    type === 'ok'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      : type === 'err'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        : '';
  t.innerHTML =
    (iconSvg ? '<span class="toast-icon">' + iconSvg + '</span>' : '') +
    '<span class="toast-msg">' +
    esc(msg) +
    '</span>' +
    '<div class="toast-progress"></div>';
  t.className = 'toast show ' + (type || '');
  clearTimeout(toastT);
  toastT = setTimeout(function () {
    t.classList.remove('show');
    t.classList.add('hiding');
    setTimeout(function () {
      t.classList.remove('hiding');
    }, TOAST_FADE_MS);
  }, TOAST_VISIBLE_MS);
}

// ── i18n ──
// defaults to 'en' (more global) when no preference is set.
async function initI18n() {
  try {
    currentLang = await ipcRenderer.invoke('i18n:get-lang');
    if (!currentLang) currentLang = 'en';
    i18nStrings = (await ipcRenderer.invoke('i18n:get-all')) || {};
    // Apply translations to elements with data-i18n attributes
    applyI18n();
    // Update language selector in settings
    var setLang = document.getElementById('setLang');
    if (setLang) setLang.value = currentLang;
    // Update <html lang> attribute for accessibility
    document.documentElement.lang = currentLang === 'pt' ? 'pt-BR' : 'en';
    // Update view title to localized string
    var activeNav = document.querySelector('.nav-item.active');
    if (activeNav) {
      var titleEl = activeNav.querySelector('span[data-i18n]');
      if (titleEl) {
        document.getElementById('viewTitle').textContent = titleEl.textContent.trim();
      }
    }
    // Re-render profiles + events to apply new language to dynamic content
    if (profiles.length > 0) renderProfiles();
    ipcRenderer.invoke('events:get', selectedRegion).then(renderEventsSingle);
  } catch (e) {
    currentLang = 'en';
    i18nStrings = {};
  }
}

// Language change handler in settings
// also refreshes event names (which depend on language) and re-renders profiles.
document.getElementById('setLang').onchange = async function () {
  var newLang = this.value;
  await ipcRenderer.invoke('i18n:set-lang', newLang);
  currentLang = newLang;
  i18nStrings = (await ipcRenderer.invoke('i18n:get-all')) || {};
  applyI18n();
  // Update <html lang> for a11y
  document.documentElement.lang = newLang === 'pt' ? 'pt-BR' : 'en';
  // Update view title (nav-item label may have changed)
  var activeNav = document.querySelector('.nav-item.active');
  if (activeNav) {
    var titleEl = activeNav.querySelector('span[data-i18n]');
    if (titleEl) {
      document.getElementById('viewTitle').textContent = titleEl.textContent.trim();
    }
  }
  // Re-render dynamic content with new language
  if (profiles.length > 0) renderProfiles();
  ipcRenderer.invoke('events:get', selectedRegion).then(renderEventsSingle);
  toast(
    newLang === 'pt' ? 'Idioma: Português' : 'Language: English',
    'ok'
  );
};

// ── Notification Badge on Events ──
// badge now shows ACTIVE events at the moment (within the duration
// window), instead of activity log count. Much less confusing — the number
// on the Events button means "X events are running now".
// Uses lastEventsByRegion (populated by the IPC events:update).
var lastEventsByRegion = {};

function updateEventBadge() {
  var badge = document.getElementById('eventBadge');
  if (!badge) return;
  var activeCount = 0;
  Object.keys(lastEventsByRegion).forEach(function (region) {
    var events = lastEventsByRegion[region];
    if (!events || !events.length) return;
    events.forEach(function (ev) {
      var durationMin = ev.durationMin || 60;
      if (
        ev.nextFireMs !== undefined &&
        ev.nextFireMs < 0 &&
        ev.nextFireMs > -(durationMin * 60000)
      ) {
        activeCount++;
      }
    });
  });
  // Guard against redundant DOM mutations — updateEventBadge runs every 30s
  // via setInterval. Without these guards, badge.textContent and classList
  // would be mutated on every tick even when the count/visibility hasn't
  // changed, causing unnecessary layout invalidations.
  var shouldShow = activeCount > 0 && !notificationsMuted;
  var newLabel = shouldShow ? (activeCount > 9 ? '9+' : String(activeCount)) : '';
  if (badge.textContent !== newLabel) {
    badge.textContent = newLabel;
  }
  var isShown = badge.classList.contains('show');
  if (shouldShow && !isShown) {
    badge.classList.add('show');
  } else if (!shouldShow && isShown) {
    badge.classList.remove('show');
  }
}


// Track which profiles were open in last session for relaunch-all
var LAST_SESSION_KEY = 'shinobi-last-session';
ipcRenderer.on('game-window:status', function (_e, data) {
  if (!data || !data.profileId) return;
  var lastSession = JSON.parse(localStorage.getItem(LAST_SESSION_KEY) || '[]');
  if (data.open) {
    if (lastSession.indexOf(data.profileId) === -1) lastSession.push(data.profileId);
  } else {
    lastSession = lastSession.filter(function (id) {
      return id !== data.profileId;
    });
  }
  localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(lastSession));
});

// keyboard handler simplified — only Esc closes modals.
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.getElementById('profileModal').classList.remove('show');
    document.getElementById('vaultModal').classList.remove('show');
  }
});

// ── Drag-and-Drop Profile Reorder ──
var dragSrcId = null;

function initDragDrop() {
  var grid = document.getElementById('profileGrid');
  grid.addEventListener('dragstart', function (e) {
    var card = e.target.closest('.card[data-card-id]');
    if (!card) {
      e.preventDefault();
      return;
    }
    dragSrcId = card.getAttribute('data-card-id');
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcId);
  });
  grid.addEventListener('dragend', function (e) {
    var card = e.target.closest('.card[data-card-id]');
    if (card) card.classList.remove('dragging');
    dragSrcId = null;
    // Remove all drag-over states
    grid.querySelectorAll('.drag-over').forEach(function (c) {
      c.classList.remove('drag-over');
    });
  });
  grid.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var card = e.target.closest('.card[data-card-id]');
    if (card && card.getAttribute('data-card-id') !== dragSrcId) {
      // Clear other drag-overs
      grid.querySelectorAll('.drag-over').forEach(function (c) {
        c.classList.remove('drag-over');
      });
      card.classList.add('drag-over');
    }
  });
  grid.addEventListener('dragleave', function (e) {
    var card = e.target.closest('.card[data-card-id]');
    if (card) card.classList.remove('drag-over');
  });
  grid.addEventListener('drop', function (e) {
    e.preventDefault();
    var targetCard = e.target.closest('.card[data-card-id]');
    if (!targetCard || !dragSrcId) return;
    var targetId = targetCard.getAttribute('data-card-id');
    if (targetId === dragSrcId) return;
    // Reorder profiles array
    var srcIdx = profiles.findIndex(function (p) {
      return p.id === dragSrcId;
    });
    var tgtIdx = profiles.findIndex(function (p) {
      return p.id === targetId;
    });
    if (srcIdx === -1 || tgtIdx === -1) return;
    var moved = profiles.splice(srcIdx, 1)[0];
    profiles.splice(tgtIdx, 0, moved);
    // Persist order via IPC
    var order = profiles.map(function (p) {
      return p.id;
    });
    ipcRenderer.send('profile:reorder', order);
    renderProfiles();
    toast('Profile reordered', 'ok');
  });
}

// Make cards draggable after render
var origRenderProfiles = renderProfiles;
renderProfiles = function () {
  origRenderProfiles();
  document.querySelectorAll('.card[data-card-id]').forEach(function (card) {
    card.setAttribute('draggable', 'true');
  });
};

// ── Event Rendering (bilingual + days/daily + duration) ──
// Each event now shows:
//   - Icon (by category: boss/arena/dungeon/social/reset)
//   - Name (in current launcher language: EN or PT)
//   - Schedule: "Daily" or weekday names (e.g., "Sat, Sun")
//   - Time: HH:MM local + HH:MM server (with timezone context)
//   - Duration: e.g., "60 min"
//   - Status: "starts in X" / "live · ends in Y" / "ended"
// Active events are highlighted with a gold left accent bar.
renderEventsSingle = function (list) {
  var el = document.getElementById('eventList');
  // Update the events meta header with the next upcoming event.
  var metaEl = document.getElementById('eventsMetaText');
  // Hoist Date.now() to function top — previously called per-event inside the
  // forEach loop (~11 calls per render) AND inside the meta-header loop.
  // All events in a single render pass use the same "now" reference, so
  // calling it once at function entry is semantically equivalent and avoids
  // N redundant syscalls. Critical for low-spec machines rendering events.
  var now = Date.now();
  if (metaEl) {
    var nextEv = null;
    var nextDelta = Infinity;
    if (list && list.length) {
      for (var i = 0; i < list.length; i++) {
        var ev = list[i];
        var startsAt = ev.startsAtMs || (now + (ev.nextFireMs || 0));
        if (startsAt > now && startsAt - now < nextDelta) {
          nextDelta = startsAt - now;
          nextEv = ev;
        }
      }
    }
    if (nextEv && nextEv.nextFireLabel) {
      metaEl.innerHTML = '<span class="events-meta-name">' + esc(nextEv.name) +
        '</span> <span class="events-meta-sep">·</span> <span class="events-meta-time">' +
        esc(nextEv.nextFireLabel) + '</span>';
    } else {
      metaEl.textContent = currentLang === 'pt'
        ? 'Nenhum evento programado'
        : 'No events scheduled';
    }
  }
  if (!list || !list.length) {
    el.innerHTML =
      '<div class="event-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      '<p>' + (currentLang === 'pt' ? 'Nenhum evento.' : 'No events.') + '</p>' +
      '</div>';
    return;
  }
  el.innerHTML = '';
  // Batch event items into a DocumentFragment and append once — avoids N
  // separate reflows (one per el.appendChild) for ~11-event region lists.
  // Same pattern as renderProfiles() (cycle 50). Layout is computed a single
  // time after all items are in the fragment.
  var frag = document.createDocumentFragment();
  // Increased from 12 to 20 — expanded event list now has 11 events per region.
  // `now` is declared at function top (hoisted) — reused across meta-header
  // loop + this forEach to avoid N redundant Date.now() syscalls.
  list.slice(0, 20).forEach(function (ev) {
    var category = ev.category || 'daily';
    var iconSvg = getEventIconSvg(category);
    var durationMin = ev.durationMin || 60;

    // Compute status — active (within duration window) vs upcoming vs ended
    // EventTimers returns nextFireMs (ms until next reminder fire).
    // startsAtMs = when event actually starts (without remind offset)
    // endsAtMs = startsAtMs + durationMin
    var startsAt = ev.startsAtMs || (now + (ev.nextFireMs || 0));
    var endsAt = ev.endsAtMs || (startsAt + durationMin * 60000);
    var isActive = now >= startsAt && now < endsAt;
    var isEnded = now >= endsAt;
    // Cleaner countdown — just the time, color carries the context.
    // gold = upcoming, green = live, faint = ended. No verbose prefixes.
    var statusLabel;
    var statusClass;
    if (isActive) {
      statusLabel = formatCountdown(endsAt - now);
      statusClass = 'active';
    } else if (isEnded) {
      statusLabel = currentLang === 'pt' ? 'encerrado' : 'ended';
      statusClass = 'ended';
    } else {
      statusLabel = ev.nextFireLabel || '';
      statusClass = '';
    }

    // Schedule label: "Daily" or weekday names
    var scheduleLabel;
    if (ev.daily || !ev.days || !ev.days.length) {
      scheduleLabel = currentLang === 'pt' ? 'Diário' : 'Daily';
    } else {
      var wd = currentLang === 'pt' ? WEEKDAYS_PT : WEEKDAYS_EN;
      scheduleLabel = ev.days
        .slice()
        .sort(function (a, b) {
          return a - b;
        })
        .map(function (d) {
          return wd[d] || '';
        })
        .join(', ');
    }

    // Lean meta line — schedule · time · duration only.
    // Server-time and raw hours dropped (redundant with local time, adds clutter).
    var localTime = ev.userTimeLabel || '';
    var metaParts = [];
    metaParts.push('<span class="event-schedule">' + scheduleLabel + '</span>');
    if (localTime) {
      metaParts.push('<span class="event-time">' + localTime + '</span>');
    } else if (ev.hours && ev.hours.length > 1) {
      metaParts.push(
        '<span class="event-hours">' +
          ev.hours
            .map(function (h) {
              return String(h).padStart(2, '0') + 'h';
            })
            .join(' / ') +
          '</span>'
      );
    }
    metaParts.push('<span class="event-duration">' + durationMin + 'min</span>');

    var item = document.createElement('div');
    item.className = 'event' + (isActive ? ' event-active' : '');
    item.setAttribute('data-type', category);
    item.innerHTML =
      '<div class="event-icon ' +
      category +
      '">' +
      iconSvg +
      '</div>' +
      '<div class="info">' +
      '<div class="n">' +
      esc(ev.name) +
      '</div>' +
      '<div class="t">' +
      metaParts.join('<span class="event-sep">·</span>') +
      '</div>' +
      '</div>' +
      '<div class="cd' +
      (statusClass ? ' cd-' + statusClass : '') +
      '">' +
      statusLabel +
      '</div>';
    frag.appendChild(item);
  });
  el.appendChild(frag);
};

// SVG icons per event category (inline for self-containment)
// Added escort + instance categories (Escort, Ninja Instance, Training)
// Weekday name arrays hoisted to module scope — previously re-declared inside
// renderEventsSingle on every call (per region tab switch). These are
// identical across all calls, so allocating them once at module load avoids
// 2 array allocations per render.
var WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
var WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function getEventIconSvg(category) {
  switch (category) {
    case 'boss':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
    case 'arena':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    case 'arena_guild':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="2.5"/><path d="M9 11v-1a3 3 0 0 1 6 0v1"/></svg>';
    case 'dungeon':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>';
    case 'escort':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M16 21h5v-5"/><path d="M8 21H3v-5"/><circle cx="12" cy="12" r="3"/><path d="M12 9v6M9 12h6"/></svg>';
    case 'instance':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>';
    case 'social':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    case 'reset':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    default:
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  }
}

// ── Relative time helper ──
// Local formatCountdown for the event renderer (EventTimers.js has
// its own in the backend, but the renderer needs one too).
function formatCountdown(ms) {
  if (ms < 0) return 'now';
  var totalMin = Math.floor(ms / 60000);
  var h = Math.floor(totalMin / 60);
  var m = totalMin % 60;
  var s = Math.floor((ms % 60000) / 1000);
  if (h > 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  if (h > 0) return h + 'h ' + m + 'min';
  if (m > 0) return m + 'min ' + s + 's';
  return s + 's';
}

// ── Init ──
ipcRenderer.send('manager:ready');
initI18n();
initDragDrop();
updateEventBadge();
// Card state changes (openWindows, autoLoginStatus) are pushed via IPC
// and already trigger renderProfiles() — no polling needed.
// Refresh event badge + active event countdowns periodically. Coarse interval
// is fine — event start/end times are minute-granular and StateBroadcaster
// pushes immediate updates when the schedule changes.
const EVENT_BADGE_INTERVAL_MS = 30000;
var _eventBadgeTimer = setInterval(function () {
  updateEventBadge();
}, EVENT_BADGE_INTERVAL_MS);

// Cleanup lifetime-bound intervals on unload
window.addEventListener('beforeunload', function () {
  clearInterval(_eventBadgeTimer);
});

// ── Loading Skeleton ──
function showSkeletonLoader() {
  var grid = document.getElementById('profileGrid');
  if (!grid) return;
  var skeletonHtml = '';
  for (var i = 0; i < 6; i++) {
    skeletonHtml +=
      '<div class="skeleton-card">' +
      '<div class="skel-row"><div class="skel-circle"></div><div style="flex:1"><div class="skel-line w60"></div><div class="skel-line w30"></div></div></div>' +
      '<div class="skel-line w80"></div>' +
      '<div class="skel-line w40"></div>' +
      '</div>';
  }
  grid.innerHTML = '<div class="skeleton-grid">' + skeletonHtml + '</div>';
}

// ── Init sequence ──
// Show skeleton briefly on first load
showSkeletonLoader();
setTimeout(function () {
  if (profiles.length > 0) renderProfiles();
}, 300);

// ── Replace sidebar version text with a version pill ──
(function wireVersionPill() {
  var versionEl = document.getElementById('version');
  if (!versionEl) return;
  var txt = versionEl.textContent.trim();
  if (/^v\d+\.\d+\.\d+/.test(txt)) {
    versionEl.innerHTML = '<span class="version-pill">' + txt + '</span>';
  }
})();
