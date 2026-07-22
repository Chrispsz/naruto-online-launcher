      // In the real launcher these come from the main process via preload.js.
      // This block is injected ONLY for the Next.js preview (/public/launcher.html).
      // v5.25.0: mock events aligned with new EventTimers schema (days, daily,
      // name_pt/name_en, durationMin, serverTimeLabel, startsAtMs, endsAtMs).
      (function installPreviewMock() {
        var MOCK_PROFILES = [
          { id: 'p1', name: 'Hokage_BR', server: 's1', region: 'br', color: '#FF8C00', favorite: true, hasVault: true, launchCount: 142, totalPlayMs: 54000000, lastUsed: Date.now() - 3600000, notes: 'Conta principal' },
          { id: 'p2', name: 'Anbu_NA', server: 's2', region: 'na', color: '#DC2626', favorite: false, hasVault: false, launchCount: 38, totalPlayMs: 12000000, lastUsed: Date.now() - 86400000 * 2, notes: '' },
          { id: 'p3', name: 'Sannin_EU', server: 's3', region: 'eu', color: '#10B981', favorite: true, hasVault: true, launchCount: 87, totalPlayMs: 31000000, lastUsed: Date.now() - 86400000, notes: 'Build PvE' },
          { id: 'p4', name: 'Genin_HK', server: 's1', region: 'hk', color: '#F59E0B', favorite: false, hasVault: false, launchCount: 12, totalPlayMs: 3000000, lastUsed: Date.now() - 86400000 * 5, notes: '' },
          { id: 'p5', name: 'Jounin_BR', server: 's2', region: 'br', color: '#8B5CF6', favorite: false, hasVault: true, launchCount: 55, totalPlayMs: 18000000, lastUsed: Date.now() - 86400000 * 3, notes: 'Alt' },
          { id: 'p6', name: 'Kage_BR', server: 's4', region: 'br', color: '#06B6D4', favorite: false, hasVault: false, launchCount: 23, totalPlayMs: 7000000, lastUsed: Date.now() - 86400000 * 7, notes: '' }
        ];
        var MOCK_MEMORY = { totalMB: 412, thresholdMB: 614, manualGCCount: 3, autoGCCount: 12, heapUsedMB: 412, heapTotalMB: 768 };

        // v5.25.0: Mock events match new EventTimers.js schema (4 regions only).
        // Each event has: id, name (localized), name_pt, name_en, days[], daily,
        // hours[], category, remindMin, durationMin, region, nextFireMs,
        // nextFireLabel, userTimeLabel, serverTimeLabel, startsAtMs, endsAtMs.
        function buildMockEvents() {
          var now = Date.now();
          function ev(opts) {
            var startsAt = opts.startsAt;
            var endsAt = startsAt + opts.durationMin * 60000;
            var nextFireMs = startsAt - now;
            return {
              id: opts.id,
              name: opts.name_en,
              name_pt: opts.name_pt,
              name_en: opts.name_en,
              days: opts.days || [],
              daily: !opts.days || opts.days.length === 0,
              hours: opts.hours,
              category: opts.category,
              remindMin: opts.remindMin || 5,
              durationMin: opts.durationMin,
              region: opts.region,
              nextFireMs: nextFireMs,
              nextFireLabel: formatCountdown(nextFireMs),
              userTimeLabel: opts.userTime || '18:00',
              serverTimeLabel: opts.serverTime || '21:00',
              startsAtMs: startsAt,
              endsAtMs: endsAt
            };
          }
          function formatCountdown(ms) {
            if (ms < 0) return 'agora';
            var totalMin = Math.floor(ms / 60000);
            var h = Math.floor(totalMin / 60);
            var m = totalMin % 60;
            if (h > 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
            if (h > 0) return h + 'h ' + m + 'min';
            if (m > 0) return m + 'min';
            return Math.floor(ms / 1000) + 's';
          }

          return {
            byRegion: {
              br: [
                ev({ id: 'br-boss', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], category: 'boss', durationMin: 60, region: 'br', startsAt: now + 1800000, userTime: '12:00', serverTime: '12:00' }),
                ev({ id: 'br-arena', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], category: 'arena', durationMin: 60, region: 'br', startsAt: now + 5400000, userTime: '18:00', serverTime: '18:00' }),
                ev({ id: 'br-dungeon', name_pt: 'Dungeon em Time', name_en: 'Team Dungeon', days: [], hours: [14, 21], category: 'dungeon', durationMin: 90, region: 'br', startsAt: now + 7200000, userTime: '14:00', serverTime: '14:00' }),
                ev({ id: 'br-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], category: 'escort', durationMin: 60, region: 'br', startsAt: now + 3600000, userTime: '11:00', serverTime: '11:00' }),
                ev({ id: 'br-instancia', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], category: 'instance', durationMin: 60, region: 'br', startsAt: now + 10800000, userTime: '22:00', serverTime: '22:00' }),
                ev({ id: 'br-treinamento', name_pt: 'Treinamento Ninja', name_en: 'Ninja Training', days: [], hours: [6, 12, 18], category: 'instance', durationMin: 45, region: 'br', startsAt: now + 9000000, userTime: '12:00', serverTime: '12:00' }),
                ev({ id: 'br-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [20], category: 'social', durationMin: 120, region: 'br', startsAt: now + 86400000, userTime: '20:00', serverTime: '20:00' }),
                ev({ id: 'br-guild-arena', name_pt: 'Arena de Guildas', name_en: 'Guild Arena', days: [2, 4, 6], hours: [19], category: 'arena_guild', durationMin: 60, region: 'br', startsAt: now + 172800000, userTime: '19:00', serverTime: '19:00' }),
                ev({ id: 'br-bond', name_pt: 'Bond / Check-in Diário', name_en: 'Bond / Daily Check-in', days: [], hours: [5], category: 'social', durationMin: 30, region: 'br', startsAt: now + 21600000, userTime: '05:00', serverTime: '05:00' }),
                ev({ id: 'br-desafio', name_pt: 'Desafio Diário (meia-noite)', name_en: 'Daily Challenge (midnight)', days: [], hours: [0], category: 'reset', durationMin: 5, region: 'br', startsAt: now + 64800000, userTime: '00:00', serverTime: '00:00' }),
                ev({ id: 'br-reset', name_pt: 'Reset Diário (5h)', name_en: 'Daily Reset (5 AM)', days: [], hours: [5], category: 'reset', durationMin: 5, region: 'br', startsAt: now + 21600000, userTime: '05:00', serverTime: '05:00' })
              ],
              na: [
                ev({ id: 'na-boss', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [11, 19], category: 'boss', durationMin: 60, region: 'na', startsAt: now + 3600000, userTime: '11:00', serverTime: '14:00' }),
                ev({ id: 'na-arena', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [17], category: 'arena', durationMin: 60, region: 'na', startsAt: now + 7200000, userTime: '17:00', serverTime: '20:00' }),
                ev({ id: 'na-clan-war', name_pt: 'Guerra de Clã', name_en: 'Clan War', days: [6, 0], hours: [19], category: 'social', durationMin: 120, region: 'na', startsAt: now + 86400000, userTime: '19:00', serverTime: '22:00' }),
                ev({ id: 'na-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [10, 18], category: 'escort', durationMin: 60, region: 'na', startsAt: now + 5400000, userTime: '10:00', serverTime: '13:00' })
              ],
              eu: [
                ev({ id: 'eu-boss', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], category: 'boss', durationMin: 60, region: 'eu', startsAt: now + 5400000, userTime: '08:00', serverTime: '12:00' }),
                ev({ id: 'eu-arena', name_pt: 'Arena 3v3 (PvP)', name_en: 'Arena 3v3 (PvP)', days: [], hours: [18], category: 'arena', durationMin: 60, region: 'eu', startsAt: now + 10800000, userTime: '14:00', serverTime: '18:00' }),
                ev({ id: 'eu-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], category: 'escort', durationMin: 60, region: 'eu', startsAt: now + 7200000, userTime: '07:00', serverTime: '11:00' })
              ],
              hk: [
                ev({ id: 'hk-boss', name_pt: 'Boss Mundial', name_en: 'World Boss', days: [], hours: [12, 20], category: 'boss', durationMin: 60, region: 'hk', startsAt: now + 7200000, userTime: '04:00', serverTime: '12:00' }),
                ev({ id: 'hk-escolta', name_pt: 'Escolta', name_en: 'Escort', days: [], hours: [11, 19], category: 'escort', durationMin: 60, region: 'hk', startsAt: now + 9000000, userTime: '03:00', serverTime: '11:00' }),
                ev({ id: 'hk-instancia', name_pt: 'Instância Ninja', name_en: 'Ninja Instance', days: [], hours: [10, 22], category: 'instance', durationMin: 60, region: 'hk', startsAt: now + 12600000, userTime: '04:00', serverTime: '22:00' })
              ]
            }
          };
        }
        var MOCK_EVENTS = buildMockEvents();
        // v5.25.0: default to Portuguese (user-facing preview language)
        var mockLang = 'pt';

        function mockInvoke(channel, a, b, c) {
          switch (channel) {
            case 'profiles:export-file':
            case 'profiles:export-encrypted': return Promise.resolve({ ok: true });
            case 'profiles:import-file':
            case 'profiles:import-encrypted': return Promise.resolve({ ok: true, imported: 3 });
            case 'memory:stats':
            case 'memory:force-gc': return Promise.resolve(MOCK_MEMORY);
            case 'servers:fetch': return Promise.resolve([{ id: 's1', name: 'Server 1' }, { id: 's2', name: 'Server 2' }, { id: 's3', name: 'Server 3' }, { id: 's4', name: 'Server 4' }]);
            case 'events:get':
              // v5.25.0: return events for the requested region (with localized names)
              var regionEvents = (MOCK_EVENTS.byRegion[a] || []).slice();
              // Localize names based on current language (tracked in mockLang)
              var lang = mockLang || 'pt';
              regionEvents.forEach(function (e) {
                e.name = lang === 'pt' ? e.name_pt : e.name_en;
              });
              return Promise.resolve(regionEvents);
            case 'launcher:get-version': return Promise.resolve('v1.0.0');
            case 'i18n:get-lang': return Promise.resolve(mockLang);
            case 'i18n:get-all':
              // v5.25.0: full PT dict — human-friendly, no technical jargon
              if (mockLang === 'pt') return Promise.resolve({
                'nav.accounts': 'Contas', 'nav.events': 'Eventos', 'nav.settings': 'Configurações',
                'topbar.new': 'Nova conta',
                'settings.general': 'Geral', 'settings.language': 'Idioma',
                'settings.language.desc': 'Idioma da interface do launcher',
                'settings.optimization': 'Otimização', 'settings.optimization.hint': 'Automática',
                'settings.advanced': 'Avançado',
                'settings.notifications': 'Notificações',
                'settings.notifications.desc': 'Avisar antes dos eventos começarem',
                'settings.remind': 'Tempo de lembrete',
                'settings.remind.desc': 'Quantos minutos antes avisar',
                'settings.lowpc': 'Modo PC Fraco',
                'settings.lowpc.desc': 'Para PCs antigos ou com menos de 4GB de RAM. Libera memória e descansa a placa de vídeo.',
                'settings.cpu_render': 'Forçar renderização por CPU',
                'settings.cpu_render.desc': 'Para GPUs com problema. Usa o processador — mais lento, mas mais estável.',
                'settings.restart': 'Reinício necessário', 'settings.restart.btn': 'Reiniciar agora',
                'settings.restart.desc': 'Reinicie o launcher para aplicar.',
                'settings.backup': 'Backup criptografado', 'settings.backup.desc': 'Salva suas contas e senhas em um arquivo seguro',
                'settings.diag': 'Exportar diagnóstico', 'settings.diag.desc': 'Arquivo com dados do sistema para suporte (sem senhas)', 'settings.diag.btn': 'Exportar .zip',
                'settings.about': 'Sobre',
                'about.tagline': 'Launcher Flash multi-conta para Naruto Online',
                'about.author': 'Autor', 'about.license': 'Licença', 'about.platform': 'Plataforma', 'about.runtime': 'Runtime', 'about.report': 'Reportar problema',
                'profile.name': 'Nome', 'profile.region': 'Região', 'profile.server': 'Servidor',
                'modal.search': 'Buscar', 'modal.server_hint': 'Digite o número do servidor ou clique em Buscar.',
                'modal.auto_create': 'Criar automaticamente',
                'modal.vault_title': 'Credenciais', 'modal.vault_subtitle': 'Salvo com segurança — preenchido quando o login expirar', 'modal.vault_user': 'Usuário', 'modal.vault_pass': 'Senha',
                'modal.vault_remove': 'Remover', 'modal.vault_hint': 'Salvo com segurança neste computador. Preenchido automaticamente quando sua sessão expirar.',
                'common.save': 'Salvar', 'common.cancel': 'Cancelar', 'common.export': 'Exportar',
                'common.import': 'Importar'
              });
              return Promise.resolve({
                'nav.accounts': 'Accounts', 'nav.events': 'Events', 'nav.settings': 'Settings',
                'topbar.new': 'New account',
                'settings.general': 'General', 'settings.language': 'Language',
                'settings.language.desc': 'Launcher interface language',
                'settings.optimization': 'Optimization', 'settings.optimization.hint': 'Automatic',
                'settings.advanced': 'Advanced',
                'settings.notifications': 'Notifications',
                'settings.notifications.desc': 'Alert me before events start',
                'settings.remind': 'Reminder time',
                'settings.remind.desc': 'Minutes before each event to notify',
                'settings.lowpc': 'Low-end PC mode',
                'settings.lowpc.desc': 'For old PCs or under 4GB RAM. Frees up memory and rests the GPU.',
                'settings.cpu_render': 'Force CPU rendering',
                'settings.cpu_render.desc': 'For GPUs with issues. Uses the processor instead — slower, but more stable.',
                'settings.restart': 'Restart required', 'settings.restart.btn': 'Restart now',
                'settings.restart.desc': 'Restart the launcher to apply this change.',
                'settings.backup': 'Encrypted backup', 'settings.backup.desc': 'Save your accounts and passwords to a secure file',
                'settings.diag': 'Export diagnostics', 'settings.diag.desc': 'System info file for support (no passwords included)', 'settings.diag.btn': 'Export .zip',
                'settings.about': 'About',
                'about.tagline': 'Multi-account Flash launcher for Naruto Online',
                'about.author': 'Author', 'about.license': 'License', 'about.platform': 'Platform', 'about.runtime': 'Runtime', 'about.report': 'Report issue',
                'profile.name': 'Name', 'profile.region': 'Region', 'profile.server': 'Server',
                'modal.search': 'Search', 'modal.server_hint': 'Type the server number or click Search.',
                'modal.auto_create': 'Create automatically',
                'modal.vault_title': 'Credentials', 'modal.vault_subtitle': 'Saved securely — auto-filled when login expires', 'modal.vault_user': 'Username', 'modal.vault_pass': 'Password',
                'modal.vault_remove': 'Remove', 'modal.vault_hint': 'Saved securely on this computer. Filled in automatically when your session expires.',
                'common.save': 'Save', 'common.cancel': 'Cancel', 'common.export': 'Export',
                'common.import': 'Import'
              });
            case 'i18n:set-lang':
              if (a === 'pt' || a === 'en') mockLang = a;
              return Promise.resolve(mockLang);
            case 'app:quit': return Promise.resolve({ ok: true });
            case 'session:check': return Promise.resolve({ valid: true, profileId: a });
            case 'vault:get': return Promise.resolve(null);
            case 'vault:set': return Promise.resolve({ ok: true });
            case 'vault:remove': return Promise.resolve({ ok: true });
            case 'window:get-always-on-top': return Promise.resolve(false);
            case 'window:toggle-always-on-top': return Promise.resolve(true);
            case 'window:toggle-maximize': return Promise.resolve(true);
            case 'profile:set-favorite': return Promise.resolve({ ok: true });
            case 'profile:duplicate': return Promise.resolve({ ok: true, id: 'dup-' + Date.now() });
            case 'profile:clear-launch-log': return Promise.resolve({ ok: true });
            case 'profile:launch-timeline': return Promise.resolve([]);
            case 'tempmail:create': return Promise.resolve({ email: 'preview-' + Date.now() + '@shinobi.dev', id: 'tm-' + Date.now() });
            case 'tempmail:login': return Promise.resolve({ ok: true, uid: '12345', gc: 1 });
            case 'tempmail:servers': return Promise.resolve([{ id: 's1', name: 'Server 1' }]);
            case 'inspector:enable':
            case 'inspector:disable':
            case 'inspector:clear': return Promise.resolve({ ok: true });
            case 'inspector:entries': return Promise.resolve([]);
            case 'dev:get-page-source': return Promise.resolve('<html>preview</html>');
            case 'dev:get-cookies': return Promise.resolve([]);
            case 'dev:reload-game':
            case 'dev:toggle-devtools': return Promise.resolve({ ok: true });
            case 'diagnostics:export': return Promise.resolve('/preview/diagnostics.zip');
            case 'profile:create': return Promise.resolve({ ok: true });
            case 'profile:delete': return Promise.resolve({ ok: true });
            case 'profile:launch': return Promise.resolve({ ok: true });
            case 'window:minimize': return Promise.resolve({ ok: true });
            case 'optimization:get-status': return Promise.resolve({
              preset: 'balanced',
              advancedMode: window.__mockAdvancedMode === true,
              cpuRender: window.__mockCpuRender === true,
              gpu: { vendor: 'nvidia', description: 'NVIDIA GeForce RTX 3060', isPrime: false, allGpus: [{ vendor: 'nvidia' }] },
              cpu: { totalCores: 8, isHybrid: false, pCores: 0, eCores: 0, appliedPids: 0 },
              systemRamGb: 16,
              isWayland: false
            });
            case 'optimization:set-preset': return Promise.resolve({ ok: true });
            case 'optimization:set-lowpc':
              window.__mockAdvancedMode = (a === true);
              return Promise.resolve({ ok: true, previous: !window.__mockAdvancedMode, current: window.__mockAdvancedMode, changed: true });
            case 'optimization:set-cpu-render':
              window.__mockCpuRender = (a === true);
              return Promise.resolve({ ok: true, previous: !window.__mockCpuRender, current: window.__mockCpuRender, changed: true });
            default: return Promise.resolve(undefined);
          }
        }
        var handlers = {};
        function mockOn(channel, cb) {
          if (!handlers[channel]) handlers[channel] = [];
          handlers[channel].push(cb);
          setTimeout(function () {
            try {
              if (channel === 'profiles:updated') cb({}, JSON.parse(JSON.stringify(MOCK_PROFILES)));
              else if (channel === 'memory:update') cb({}, MOCK_MEMORY);
              else if (channel === 'events:update') cb({}, MOCK_EVENTS);
            } catch (e) { /* preview — ignore */ }
          }, 120);
        }
        function broadcastProfiles() {
          var list = handlers['profiles:updated'];
          if (!list) return;
          list.forEach(function (cb) {
            try {
              cb({}, JSON.parse(JSON.stringify(MOCK_PROFILES)));
            } catch (e) {
              /* preview — ignore */
            }
          });
        }
        function mockSend(channel, payload) {
          // Simulate backend mutations so the preview reflects create/update/delete.
          if (channel === 'profile:delete') {
            MOCK_PROFILES = MOCK_PROFILES.filter(function (p) {
              return p.id !== payload;
            });
            broadcastProfiles();
          } else if (channel === 'profile:create') {
            var id = 'p' + (MOCK_PROFILES.length + 1) + '-' + Date.now();
            var np = Object.assign({ id: id, favorite: false, hasVault: false, launchCount: 0, totalPlayMs: 0, lastUsed: Date.now() }, payload);
            MOCK_PROFILES.push(np);
            broadcastProfiles();
          } else if (channel === 'profile:update') {
            MOCK_PROFILES = MOCK_PROFILES.map(function (p) {
              return p.id === payload.id ? Object.assign({}, p, payload) : p;
            });
            broadcastProfiles();
          }
        }
        window.require = function (mod) {
          if (mod === 'electron') {
            return {
              ipcRenderer: {
                invoke: mockInvoke,
                on: mockOn,
                once: mockOn,
                off: function () {},
                send: mockSend,
                removeAllListeners: function () {}
              }
            };
          }
          return {};
        };
        // v5.9.43: flag body as web-preview so the launcher hides Electron-only chrome
        document.addEventListener('DOMContentLoaded', function () {
          document.body.classList.add('web-preview');
        });
        if (document.body) document.body.classList.add('web-preview');
      })();
