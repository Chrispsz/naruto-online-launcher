/**
 * Shinobi Network Monitor — cole no console do DevTools (F12)
 * ============================================================
 *
 * O QUE FAZ:
 *   - Intercepta TODAS as requisições XHR + fetch da página
 *   - Loga cada uma com: método, URL, status, tempo, tamanho, tipo
 *   - Categoriza por tipo: auth, game, api, telemetry, asset, other
 *   - Destaca falhas (4xx/5xx) e SWFs
 *   - Cria um painel flutuante no canto superior direito com estatísticas
 *   - Detecta stall (loader travado): se 45s sem resposta = aviso
 *   - Captura JWT do cookie oas_user automaticamente
 *
 * COMO USAR:
 *   1. Abra o jogo no launcher (ou no navegador)
 *   2. Abra DevTools (F12) → Console
 *   3. Cole este script inteiro e dê Enter
 *   4. O painel aparece no canto superior direito
 *   5. Para parar: digite __shinobiNet.stop()
 *   6. Para exportar log: digite __shinobiNet.export()
 *
 * COMPATÍVEL COM:
 *   - Chrome / Chromium / Electron DevTools
 *   - Não usa APIs externas — só XHR/fetch override + PerformanceObserver
 */
(function () {
  if (window.__shinobiNet) {
    console.log('%c[ShinobiNet] já ativo — use __shinobiNet.stop() antes de reativar.', 'color:#f59e0b;font-weight:bold');
    return;
  }

  var state = {
    requests: [],
    stats: {
      total: 0,
      byType: { auth: 0, game: 0, api: 0, telemetry: 0, asset: 0, other: 0 },
      byStatus: { ok: 0, redirect: 0, clientErr: 0, serverErr: 0, blocked: 0, pending: 0 },
      failed: [],
      swfErrors: [],
      totalBytes: 0,
      startedAt: Date.now(),
    },
    lastActivityAt: Date.now(),
    jwtCaptured: null,
    panel: null,
    intervalId: null,
    stallWarned: false,
    stopped: false,
  };

  // ── Categorização ──────────────────────────────────────────────────────
  var PATH_SIGS = [
    { re: /ScriptLoginManager/i, type: 'auth', label: 'Login Manager' },
    { re: /Scriptpad-zeropadding/i, type: 'auth', label: 'Login Crypto' },
    { re: /passport\.oasgames/i, type: 'auth', label: 'Passport' },
    { re: /query_svr_info/i, type: 'game', label: 'Server Info' },
    { re: /oss_report\.fcgi/i, type: 'telemetry', label: 'iMSDK Telemetry' },
    { re: /crossdomain\.xml/i, type: 'telemetry', label: 'Flash Policy' },
    { re: /odp3\.oasgames/i, type: 'api', label: 'Odp3 API' },
    { re: /naruto-..\.oasgames/i, type: 'game', label: 'Game Backend' },
    { re: /googletagmanager|google-analytics|doubleclick|mdata\.cool|pin\.oasgames/i, type: 'telemetry', label: 'Tracker' },
    { re: /\.swf(\?|$|#)/i, type: 'asset', label: 'SWF' },
    { re: /\.(js|css|png|jpg|jpeg|gif|webp|woff2?|mp3|mp4|flv|ogg|wav|ttf|eot)(\?|$)/i, type: 'asset', label: 'Asset' },
  ];

  function classify(url) {
    try {
      for (var i = 0; i < PATH_SIGS.length; i++) {
        if (PATH_SIGS[i].re.test(url)) {
          return { type: PATH_SIGS[i].type, label: PATH_SIGS[i].label };
        }
      }
      return { type: 'other', label: 'other' };
    } catch (e) {
      return { type: 'other', label: '?' };
    }
  }

  function statusCategory(code) {
    if (!code) return 'pending';
    if (code >= 200 && code < 300) return 'ok';
    if (code >= 300 && code < 400) return 'redirect';
    if (code >= 400 && code < 500) return 'clientErr';
    if (code >= 500) return 'serverErr';
    return 'other';
  }

  // ── JWT capture ─────────────────────────────────────────────────────────
  function tryCaptureJwt() {
    if (state.jwtCaptured) return;
    try {
      var cookies = document.cookie;
      var m = cookies.match(/oas_user=([^;]+)/);
      if (m) {
        var parts = m[1].split('.');
        if (parts.length === 3) {
          var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          state.jwtCaptured = {
            token: m[1].slice(0, 40) + '...',
            playerId: payload.id || payload.uid || '?',
            nickname: payload.nickname || '?',
            exp: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : '?',
          };
        }
      }
    } catch (e) {}
  }

  // ── Log request ─────────────────────────────────────────────────────────
  function logRequest(entry) {
    state.requests.push(entry);
    if (state.requests.length > 500) state.requests.shift();

    state.stats.total++;
    state.stats.byType[entry.type] = (state.stats.byType[entry.type] || 0) + 1;
    var sc = statusCategory(entry.status);
    state.stats.byStatus[sc] = (state.stats.byStatus[sc] || 0) + 1;
    if (entry.bytes) state.stats.totalBytes += entry.bytes;
    state.lastActivityAt = Date.now();
    state.stallWarned = false;

    if (entry.isSwf && entry.status && entry.status >= 400) {
      state.stats.swfErrors.push(entry);
    }
    if (entry.status && (entry.status >= 400 || entry.status === 0)) {
      state.stats.failed.push(entry);
    }

    // Console log with color
    var color = '#8a8a96';
    if (entry.status === 0) color = '#ef4444';
    else if (entry.status >= 500) color = '#ef4444';
    else if (entry.status >= 400) color = '#f59e0b';
    else if (entry.isSwf) color = '#c8a23d';
    else if (entry.type === 'auth') color = '#10b981';
    else if (entry.type === 'telemetry') color = '#6b7280';

    var statusStr = entry.status ? ('[' + entry.status + ']') : '[...]';
    var timeStr = entry.durationMs ? (entry.durationMs + 'ms') : '';
    var sizeStr = entry.bytes ? (formatBytes(entry.bytes)) : '';
    console.log(
      '%c[Net] ' + statusStr + ' ' + entry.method + ' ' + entry.type + ' ' + entry.label +
      (timeStr ? ' ' + timeStr : '') + (sizeStr ? ' ' + sizeStr : ''),
      'color:' + color
    );
    console.log('      ' + entry.url.slice(0, 150));
  }

  function formatBytes(b) {
    if (b < 1024) return b + 'B';
    if (b < 1048576) return (b / 1024).toFixed(1) + 'KB';
    return (b / 1048576).toFixed(2) + 'MB';
  }

  // ── XHR interceptor ─────────────────────────────────────────────────────
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._shinobiMethod = method;
    this._shinobiUrl = url;
    this._shinobiStart = 0;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var self = this;
    var info = classify(this._shinobiUrl);
    this._shinobiStart = Date.now();
    tryCaptureJwt();

    this.addEventListener('loadend', function () {
      var entry = {
        method: self._shinobiMethod || 'GET',
        url: self._shinobiUrl,
        status: self.status,
        statusText: self.statusText,
        type: info.type,
        label: info.label,
        isSwf: /\.swf/i.test(self._shinobiUrl || ''),
        durationMs: Date.now() - self._shinobiStart,
        bytes: 0,
        timestamp: Date.now(),
      };
      try {
        var cl = self.getResponseHeader('content-length');
        if (cl) entry.bytes = parseInt(cl, 10) || 0;
        else if (self.responseText) entry.bytes = self.responseText.length;
      } catch (e) {}
      logRequest(entry);
    });

    this.addEventListener('error', function () {
      var entry = {
        method: self._shinobiMethod || 'GET',
        url: self._shinobiUrl,
        status: 0,
        statusText: 'ERR',
        type: info.type,
        label: info.label,
        isSwf: /\.swf/i.test(self._shinobiUrl || ''),
        durationMs: Date.now() - self._shinobiStart,
        bytes: 0,
        timestamp: Date.now(),
        error: true,
      };
      logRequest(entry);
    });

    return origSend.apply(this, arguments);
  };

  // ── Fetch interceptor ───────────────────────────────────────────────────
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '?';
      var method = (init && init.method) || (input && input.method) || 'GET';
      var info = classify(url);
      var start = Date.now();
      tryCaptureJwt();

      return origFetch.apply(this, arguments).then(
        function (resp) {
          var cl = resp.headers.get('content-length');
          var entry = {
            method: method,
            url: url,
            status: resp.status,
            statusText: resp.statusText,
            type: info.type,
            label: info.label,
            isSwf: /\.swf/i.test(url),
            durationMs: Date.now() - start,
            bytes: cl ? parseInt(cl, 10) : 0,
            timestamp: Date.now(),
          };
          logRequest(entry);
          return resp;
        },
        function (err) {
          var entry = {
            method: method,
            url: url,
            status: 0,
            statusText: 'ERR',
            type: info.type,
            label: info.label,
            isSwf: /\.swf/i.test(url),
            durationMs: Date.now() - start,
            bytes: 0,
            timestamp: Date.now(),
            error: true,
          };
          logRequest(entry);
          throw err;
        }
      );
    };
  }

  // ── Stall detector ───────────────────────────────────────────────────────
  function checkStall() {
    if (state.stopped) return;
    var inactiveFor = Date.now() - state.lastActivityAt;
    if (inactiveFor > 45000 && !state.stallWarned && state.stats.total > 5) {
      state.stallWarned = true;
      console.warn(
        '%c[ShinobiNet] STALL DETECTED — ' + Math.round(inactiveFor / 1000) +
        's sem atividade de rede. Loader pode estar travado.',
        'color:#ef4444;font-weight:bold;font-size:13px'
      );
    }
  }

  // ── Floating panel ──────────────────────────────────────────────────────
  function createPanel() {
    var panel = document.createElement('div');
    panel.id = '__shinobi_net_panel';
    panel.style.cssText = [
      'position:fixed',
      'top:10px',
      'right:10px',
      'z-index:2147483647',
      'background:#0f0f14',
      'color:#f0ede6',
      'font-family:ui-monospace,"Cascadia Code","Fira Code",monospace',
      'font-size:11px',
      'line-height:1.5',
      'padding:10px 12px',
      'border:1px solid #c8a23d',
      'border-radius:8px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.6)',
      'max-width:320px',
      'min-width:220px',
      'pointer-events:auto',
    ].join(';');
    document.body.appendChild(panel);
    state.panel = panel;
  }

  function updatePanel() {
    if (!state.panel || state.stopped) return;
    var s = state.stats;
    var uptime = Math.round((Date.now() - s.startedAt) / 1000);
    var inactiveFor = Math.round((Date.now() - state.lastActivityAt) / 1000);
    var reqPerMin = s.total / Math.max(1, uptime / 60);

    var jwtHtml = state.jwtCaptured
      ? '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #333">' +
        '<div style="color:#10b981;font-weight:bold">JWT capturado</div>' +
        '<div>player: ' + esc(state.jwtCaptured.nickname) + ' (' + state.jwtCaptured.playerId + ')</div>' +
        '<div>expira: ' + state.jwtCaptured.exp + '</div>' +
        '</div>'
      : '';

    var swfHtml = s.swfErrors.length
      ? '<div style="color:#ef4444;font-weight:bold;margin-top:4px">SWF ERR: ' + s.swfErrors.length + ' falharam</div>'
      : '';

    var stallHtml = inactiveFor > 30
      ? '<div style="color:#f59e0b;font-weight:bold;margin-top:4px">' + inactiveFor + 's sem rede</div>'
      : '';

    state.panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
      '<span style="color:#c8a23d;font-weight:bold">Shinobi Net Monitor</span>' +
      '<span style="color:#6a6a78;cursor:pointer;text-decoration:underline" onclick="window.__shinobiNet.stop()">[X]</span>' +
      '</div>' +
      '<div>requests: <b>' + s.total + '</b> (' + reqPerMin.toFixed(1) + '/min)</div>' +
      '<div>bytes: <b>' + formatBytes(s.totalBytes) + '</b></div>' +
      '<div>uptime: <b>' + uptime + 's</b></div>' +
      '<div style="margin-top:4px">' +
      '<span style="color:#10b981">ok:' + s.byStatus.ok + '</span> ' +
      '<span style="color:#f59e0b">err:' + (s.byStatus.clientErr + s.byStatus.serverErr + s.byStatus.blocked) + '</span> ' +
      '<span style="color:#6a6a78">pend:' + s.byStatus.pending + '</span>' +
      '</div>' +
      '<div style="margin-top:4px;color:#8a8a96">' +
      'auth:' + s.byType.auth + ' game:' + s.byType.game + ' api:' + s.byType.api +
      '<br>asset:' + s.byType.asset + ' telemetry:' + s.byType.telemetry + ' other:' + s.byType.other +
      '</div>' +
      swfHtml + stallHtml + jwtHtml;
  }

  function esc(s) {
    return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Public API ───────────────────────────────────────────────────────────
  window.__shinobiNet = {
    stop: function () {
      state.stopped = true;
      if (state.intervalId) clearInterval(state.intervalId);
      if (state.panel) state.panel.remove();
      XMLHttpRequest.prototype.open = origOpen;
      XMLHttpRequest.prototype.send = origSend;
      if (origFetch) window.fetch = origFetch;
      console.log('%c[ShinobiNet] parado. ' + state.stats.total + ' requests capturadas.', 'color:#c8a23d;font-weight:bold');
    },
    export: function () {
      var data = JSON.stringify({
        stats: state.stats,
        requests: state.requests,
        jwt: state.jwtCaptured,
      }, null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'shinobi-net-' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      console.log('[ShinobiNet] exportado ' + state.requests.length + ' requests.');
    },
    getStats: function () { return state.stats; },
    getRequests: function (filter) {
      if (!filter) return state.requests.slice();
      return state.requests.filter(function (r) {
        if (filter.type && r.type !== filter.type) return false;
        if (filter.failed && r.status < 400 && r.status !== 0) return false;
        if (filter.swf && !r.isSwf) return false;
        return true;
      });
    },
    clear: function () {
      state.requests = [];
      state.stats = {
        total: 0,
        byType: { auth: 0, game: 0, api: 0, telemetry: 0, asset: 0, other: 0 },
        byStatus: { ok: 0, redirect: 0, clientErr: 0, serverErr: 0, blocked: 0, pending: 0 },
        failed: [],
        swfErrors: [],
        totalBytes: 0,
        startedAt: Date.now(),
      };
      state.lastActivityAt = Date.now();
      console.log('[ShinobiNet] log limpo.');
    },
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  createPanel();
  state.intervalId = setInterval(function () {
    checkStall();
    updatePanel();
  }, 1000);

  console.log(
    '%c[ShinobiNet] ativo! Monitorando ' + PATH_SIGS.length + ' patterns. ' +
    'Pare com __shinobiNet.stop() · Exporte com __shinobiNet.export()',
    'color:#c8a23d;font-weight:bold;font-size:12px'
  );
  console.log(
    '%cComandos: __shinobiNet.getStats() · __shinobiNet.getRequests({failed:true}) · __shinobiNet.getRequests({swf:true}) · __shinobiNet.clear()',
    'color:#8a8a96;font-size:10px'
  );
})();
