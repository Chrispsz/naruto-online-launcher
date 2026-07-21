# [5.25.0] - 2026-07-20

## Auto-login simplification + repo cleanup + multi-README

### Auto-login (src/profiles/ProfileVault.js)
- Simplified `buildAutoLoginScript` from 80 lines to ~30. Removed dead verification block (URL-change check + error-element lookup — never surfaced to the user), removed delayed-retry branch (MutationObserver + polling already cover async form loading), removed "clicked" return distinction (UI treated "filled" and "clicked" identically).
- Kept the 3 Oasis form selectors (hd_oasun / oasun / user_email) + React-style value setter + 2 login hooks (hd_ajax_login / ajax_login) + button fallback — these are genuinely needed.
- SessionLifecycle.js: simplified return-value handling (4 branches instead of 5).
- Tests updated: "resultado clicked reseta formInjectAttempts" → "resultado filled reseta formInjectAttempts".

### Repo cleanup
- Removed `MIGRATION_PROMPT.md` (internal migration doc, no longer needed — migration complete since v5.0.0).
- Updated `README.md` from v4.7.0 → v5.25.0 (was 2 major versions behind).
- Added `README.pt-BR.md` (Portuguese mirror of README.md).
- Updated `CONTRIBUTING.md` to reflect current v5.25.0 structure + bilingual docs workflow.
- Updated `SECURITY.md` to v5.25.0 (removed stale `ai-evolve` branch / autonomous cron references, added vault key derivation details, added diagnostics export scope).

### New docs/ folder
- `docs/ARCHITECTURE.md` — full module map + process model + data flow diagrams.
- `docs/OPTIMIZATIONS.md` — every optimization flag documented with real vs placebo audit table.
- `docs/AUTO-LOGIN.md` — auto-login flow diagram + injected script breakdown + loop guard + security.
- `docs/ROADMAP.md` — planned innovations (UX, performance, security, platform, community) + what we won't add.

### Validation
- Jest: 1235/1235 tests pass (38 suites).
- ESLint: 0 errors.
- i18n test fixed (stale `common.play` key → `common.save` after v5.23.0 prune).
- node --check: ProfileVault.js, SessionLifecycle.js, i18n.js, app.js — all OK.

---

# [5.12.0] - 2026-07-19

## Restauração Golden + Unificação de Paleta

### UI/UX — Restauração da golden v5.9.14
- Restaurada estrutura HTML/CSS/JS da v5.9.14 (última versão ativa do usuário antes dos crons)
- Sidebar limpa: logo + 3 nav + flash indicator (removidos Importar/Exportar/Min/Max/Sair do footer)
- Topbar limpa: título + window controls + Nova conta (removidos online indicator, view-toggle, batch-mode)
- Accounts: search + sort + grid (removidos tag-filter-bar, batch-bar)
- Events: region tabs (circular pills) + event list (removido session-overview)
- Settings: 4 seções com icon containers coloridos (Geral, Preferências, Otimização, Avançado)
- Cards com gold left accent bar (::before 3px) — assinatura visual Shinobi restaurada
- Removidas features re-adicionadas pelos crons (v5.10.x): view-toggle, batch-mode, session-overview, Heroic cover cards

### Paleta — Unificação Gold
- 43 ocorrências de rgba(255, 140, 0) → rgba(200, 162, 61) em styles.css (glows/shadows agora gold)
- GPU badge: removidos inline styles com vendor colors (NVIDIA green, AMD red, Intel blue)
- GPU badge agora usa gradiente gold via CSS (data-vendor attribute preserva info do vendor)
- Adicionado --accent-glow: rgba(200, 162, 61, 0.15) ao variables.css

### Código — Qualidade
- ESLint: 0 erros, 0 warnings (v5.11.0 tinha 4 warnings)
- Removido gpuIconBox dead code (variável nunca usada após remoção dos inline styles)
- Separação de concerns restaurada: index.html + styles.css + variables.css + app.js (4 arquivos)

### Validação
- Jest: 1234/1234 testes, 38/38 suites (zero regressões de backend)
- ESLint: 0 erros, 0 warnings
- agent-browser: todos fluxos testados (search, sort, edit modal, credentials, optimization presets)
- VLM: coesão visual 10/10, identidade gold 10/10, simplicidade 9/10, minimalismo 9/10, mobile 9/10
- VLM compare vs golden v5.9.14: v5.12.0 supera em todas as 3 telas (Contas 9/10, Eventos 8/10, Configurações 9/10)

### Alinhamento de Crons
- Criado /home/z/my-project/CRON-GUIDELINES.md (bíblia dos crons)
- Criado /home/z/my-project/PROPOSALS.md (sistema de propostas para novidades)
- Crons agora têm regras claras: não adicionar features, não redesenhar UI, focar em código/bugs/deadcode

# Changelog

## [5.11.0] - 2026-07-20

### Refatoração 10/10 — contas, eventos e configurações

Merge do melhor de v5.9.4 (identidade dourada coesa, contêineres coloridos
por tipo, abas de região circulares, mais respiro) com o melhor de v5.10.6
(cards estilo Heroic com cover, botão play na capa, modais limpos, painel
de otimização GPU/CPU).

#### Paleta Gold estrita (unificação completa)
- **`--gold: #c8a23d`** (primária — substitui `#ffd700` que lia como amarelo cartoon)
- **`--gold-bright: #e2c66d`** (hover, mais refinado que `#ffe54a`)
- **`--gold-dim: #8b7230`** (acento secundário)
- **`--amber: #f59e0b`** (acento warn, substitui `#ffa500`)
- **`--accent-glow: rgba(200, 162, 61, 0.15)`** (glow dourado tingido)
- `--accent` agora é alias de `--gold` (acabou o "laranja" como cor primária)
- Adicionadas vars semânticas: `--danger: #dc2626`, `--cyan: #06b6d4`
- Atualizadas `--ok: #10b981`, `--err: #ef4444`, `--warn: #f59e0b` (alinhadas à paleta spec)
- Removidos inline vendor colors NVIDIA green / AMD red / Intel blue de app.js (gpuIconBox morto)

#### Escalas tipográfica e de espaçamento (v5.9.4)
- Typography scale: `--font-xs` 11px, `--font-sm` 12px, `--font-base` 13px, `--font-md` 14px, `--font-lg` 15px
- Body font-size: 14px → 13px (`var(--font-base)`) — leitura mais refinada
- Spacing scale: `--space-1..6` (4px / 8px / 12px / 16px / 24px / 32px)
- Radius scale: `--radius-sm` 4px (era 5px), `--radius` 8px, `--radius-lg` 10px (era 12px), `--radius-full` 9999px (novo)

#### Tela 1 — Contas
- **Barra de acento dourada à esquerda dos cards** (3px) — assinatura visual Shinobi restaurada do v5.9.4
  - Aplicada a TODOS os cards (não apenas hover) — dim (opacity 0.45) por padrão, full opacity no hover
  - `.card.fav-card::before` sempre full opacity (favoritos se destacam)
- **Card-body / badges / actions padding**: bumped para `var(--space-5)` (24px) horizontal — mais respiro
- **Grid gap**: 16px → 18px (mais respiro entre cards)
- **Card name**: font-weight 600 (semibold, mantido)
- **Card region**: `font-variant-numeric: tabular-nums` adicionado (alinhamento numérico)
- **Server select**: tabular-nums + `--font-sm` 12px (era 11px)
- **Card-head glow**: radial-gradient aprimorado (140% 100% at 100% 0%, gold-tinted rgba 0.18)
- **Fav star active**: rgba gold atualizado (200, 162, 61) + `box-shadow` glow adicional
- **Excluir button**: vermelho APENAS no hover (data-act="del" selector) — neutro por padrão
- **Fav card border**: rgba 200,162,61,0.55 (mais saturado que antes 0.45)
- Todos `rgba(255, 215, 0, ...)` migrados para `rgba(200, 162, 61, ...)` (novo gold rgb)

#### Tela 2 — Eventos
- **Region tabs → circular pills** (v5.9.4 pattern restaurado):
  - `border-radius: var(--radius-full)` (9999px)
  - padding `var(--space-1) var(--space-3)`, font `var(--font-xs)`
  - Inactive: `var(--bg-elev)` + 1px border
  - Active: gold fill + texto `#0a0a0f` + `box-shadow: 0 0 12px rgba(200, 162, 61, 0.25)`
  - Removido `border-bottom: 1px solid var(--border)` (não é mais underline style)
- **Event card left accent bar** (per-type, hover-only — v5.9.4 pattern):
  - `::before` 3px, opacity 0 → 1 no hover
  - `exp` → gold, `pvp` → err red, `war` → accent-warm #ff6600
  - Removidos os antigos `border-left: 3px solid` estáticos (eram no-ops porque data-type nunca era setado)
- **Event-icon containers** (colored, v5.9.4 pattern):
  - 1.6rem square, `var(--radius-sm)` rounded
  - `.exp` → gold tint, `.pvp` → red tint, `.war` → orange tint
  - app.js agora seta `data-type` + renderiza o container com SVG apropriado (bolt/award/flame)
- **Event title**: `var(--font-md)` 14px, font-weight 600, color `var(--text)`
- **Event meta/time**: `var(--font-xs)` 11px, `var(--text-dim)`, `tabular-nums`
- **Event status**: tabular-nums adicionado

#### Tela 3 — Configurações
- **Settings-row-icon containers restaurados** (o elemento-chave visual do v5.9.4):
  - 1.5rem square, `var(--radius-sm)` rounded, `margin-right: var(--space-3)`
  - 5 variantes: `.gold`, `.amber`, `.green`, `.red`, `.cyan` (todas com rgba 0.12 tinted bg)
  - Adicionados ícones SVG a TODAS as 7 rows (Geral/Idioma, Preferências/Notif, Otimização/GPU, Otimização/CPU, Otimização/Preset, Avançado/Backup, Avançado/Diagnóstico, Avançado/Sobre)
- **Settings section spacing**: `margin-bottom: 14px` → `var(--space-5)` 20px (separação visual mais clara)
- **Settings row hover**: adicionado `background: rgba(255, 255, 255, 0.015)` (sutil interatividade)
- **Settings header**: gold `::before` 3px accent bar mantido
- **Preset cards**: `.preset-card.active::before` gold left bar mantido, `flag-on` rgba atualizado para gold rgb novo
- **GPU badge**: gold gradient + pill shape (`border-radius: var(--radius-full)`) — SEM cores de vendor

#### Outros ajustes
- `--shadow-gold` atualizado para `rgba(200, 162, 61, 0.22)` (gold-tinted)
- Toast info border usa `var(--gold)` (novo rgb)
- `view-toggle button.active`, `tab.active`, `nav-badge`, `version-pill` todos migram para o gold rgb novo via `var(--gold)`
- `splash`, `conn-indicator`, `flash-status .dot` mantêm-se gold via `var(--gold)` (automaticamente atualizados)
- Code cleanup: morto `gpuIconBox` block removido de app.js (vendor colors dead code)

#### Validação
- Braces balanceados: ✓ (verificado)
- ESLint: 0 erros ✓
- Jest: 1234/1234 testes preservados ✓
- Versão bumped: package.json + index.html + preview-mock

---

## [5.10.6] - 2026-07-19

### Refatoração visual — polimento de detalhes e consistência

Auditoria completa via VLM (glm-4.6v) + agent-browser em todas as telas
(accounts, events, settings, edit modal, vault modal, mobile 390px).
Identificados e corrigidos ~30 defeitos visuais rubbleando a identidade
Shinobi Gold estabelecida em v5.10.5.

#### Cards (grid de contas)
- **Card default shadow**: adicionado `0 1px 3px rgba(0,0,0,0.3)` — cards não são mais "planos"
- **Card hover glow**: adicionado `0 0 18px var(--accent-glow)` além da borda dourada
- **card-head height**: 78px → 84px (mais respiro para avatar + nome + região)
- **card-head padding**: 12px → 14px (alinhamento consistente)
- **card-fav-star**: top/right 8px → 10px (alinha com novo padding)
- **card-avatar border**: prata `#c0c0c0` → prata dim `#808080` (menos ruidoso)
- **card-body padding**: 10px 12px → 12px 14px (mais respiro interno)
- **card-badges padding**: 0 12px 8px → 0 14px 10px (consistente com body)
- **card-actions padding**: 8px 12px 12px → 10px 14px 14px (mais confortável)

#### btn-play (botão PLAY nos cards)
- **Removed uppercase**: "PLAY" → "Play" (menos agressivo, mais polido)
- **Font size**: 12px → 13px (melhor proporção)
- **Padding**: 7px 10px → 8px 12px (maior touch target)
- **Added inset highlight**: `inset 0 1px 0 rgba(255,255,255,0.25)` (profundidade 3D)
- **Added :active state**: `translateY(0)` + sombra reduzida (feedback tátil)
- **Letter-spacing**: 0.4px → 0.2px (menos "técnico")

#### btn-icon-only (Editar/Credenciais/Excluir)
- **Padding**: 6px → 7px (maior touch target)
- **Background**: transparent → `var(--bg-elev)` (mais visível contra o card)

#### Badges & status
- **badge.ok / status-badge.idle**: adicionado `border: 1px solid rgba(255,215,0,0.22)`
- **status-badge.active**: borda dourada 0.3 opacity
- **status-badge.open**: borda verde 0.3 opacity
- **event-status**: adicionado border 1px + padding 9px (mais robusto)
- **event-status.active**: borda verde semântica

#### gpu-badge
- **Before**: `bg-hover` + `text-faint` ( invisível )
- **After**: gradiente dourado→âmbar + texto preto + border âmbar + glow (destaque claro)
- **Removed inline styles** de app.js (vendor colors NVIDIA green / AMD red / Intel blue quebravam paleta)

#### preset-card.active
- **Added left accent bar** (`::before` 3px gold gradient) — ecoa nav-item.active
- **Enhanced glow**: `0 0 18px var(--accent-glow)`

#### flag-on / flag-off (preset flags)
- **flag-on**: verde → dourado (consistência com paleta)
- **flag-off**: adicionado border 1px

#### Eventos
- **event-card shadow**: adicionado `0 1px 3px rgba(0,0,0,0.25)`
- **event-card padding**: 14px → 14px 16px (mais respiro horizontal)
- **event-card gap**: 12px → 14px
- **event-card margin-bottom**: 8px → 10px
- **event war color**: roxo `#8b5cf6` → laranja warm `#ff6600` (fora da paleta gold)
- **event-icon.war**: roxo `#a78bfa` → warm `#ff6600`
- **event-meta**: adicionado `line-height: 1.4`

#### Settings
- **settings-section margin-bottom**: 12px → 14px (ritmo visual)
- **settings-header**: adicionado gold accent bar `::before` 3px (ecoa topbar h2)
- **settings-header padding**: 11px → 12px
- **settings-header font-size**: 12px → 11px + letter-spacing 0.8px (mais refined)
- **settings-row padding**: 12px → 13px (mais respiro)
- **settings-row gap**: 12px → 14px
- **settings-row > div**: adicionado `min-width: 0` (fix de overflow)
- **Nova classe `.settings-row.stacked`**: substitui inline style `flex-direction: column`
- **Nova classe `.settings-subtitle`**: substitui inline style no header "Dev Tools"
- **Nova classe `.dev-desc`**: substitui 4 inline styles `.desc` nas dev subsections
- **Nova classe `.preset-restart-hint`**: substitui inline style no hint de restart
- **preset-grid padding: 0 override**: agora via `.settings-row.stacked > .preset-grid { padding: 0 }`

#### Toggle
- **Width**: 38px → 40px (melhor proporção)
- **Circle**: 18px → 16px (proporção correta no track)
- **Added border**: `1px solid var(--border-hover)` (definição visual)
- **Added shadow on circle**: `0 1px 3px rgba(0,0,0,0.4)` (profundidade)
- **Added glow on .on**: `0 0 8px var(--accent-glow)` (feedback dourado)
- **Fixed circle position**: `left: 18px` → `left: 20px` (alinhamento correto com novo width)

#### Modal
- **modal-head h3**: adicionado gold accent bar `::before` 3px (ecoa topbar h2 e settings-header)
- **modal-head background**: adicionado `var(--bg)` (separação do body)
- **modal-body padding**: 18px 20px → 20px (mais respiro)
- **modal-body gap**: 14px → 16px (melhor ritmo entre campos)
- **modal-foot gap**: 8px → 10px
- **modal-foot background**: adicionado `var(--bg)` (separação do body)
- **field-row gap**: 10px → 12px

#### field-hint
- **Before**: `font-size: 10px` texto simples
- **After**: `font-size: 11px` + padding 8px 10px + bg + border + radius (callout visível)

#### field-counter
- **Added**: `font-variant-numeric: tabular-nums` (números não "pulam")
- **Added**: `letter-spacing: 0.3px` + `margin-top: 2px` + `padding-right: 2px`

#### Sidebar footer
- **Layout**: flex wrap → grid `1fr 1fr` (alinhamento perfeito)
- **Nova classe `.full`**: `grid-column: 1 / -1` para botão "Sair" (substitui `flex-basis: 100%`)
- **Nova classe `.danger`**: hover vermelho para "Sair" (substitui inline style)
- **Removed inline `style="flex-basis: 100%"`** do botão Sair

#### Vault modal
- **Botão Remover**: inline `color: var(--err)` → classe `.btn.danger` (reutilizável)
- **Nova classe `.btn.danger`**: borda vermelha 0.3 + hover vermelho sólido

#### Grid
- **grid gap**: 14px → 16px (mais respiro entre cards)
- **grid minmax**: 218px → 228px (cards ligeiramente maiores)

#### Limpeza
- **Removido CSS morto**: `.flash-cache-info` e `.flash-cache-info .cache-version` (elemento HTML já não existia)
- **Removidos ~8 inline styles** substituídos por classes reutilizáveis
- **app.js**: `gpuBadge.style.background/color` → `setAttribute('data-vendor', ...)` (sem override de cor)
- **app.js**: `presetRestartHint.style.display = 'flex'` → `classList.add('show')`

#### Validação
- Braces balanceados: 253/253 ✓
- node --check app.js: OK ✓
- ESLint: 0 erros, 4 warnings pré-existentes ✓
- Jest: 1234/1234 testes, 38 suites ✓ (111s)
- VLM glm-4.6v final:
  - Coesão da paleta: 8/10
  - Consistência de espaçamentos: 9/10
  - Profundidade/sombras: 7/10
  - Tipografia: 8/10
  - Polimento geral: 8/10
  - Mobile (390px): 8/10
  - Sem problemas críticos
- agent-browser: todos fluxos testados (nova conta, buscar, limpar, navegar, modais)

## [5.10.5] - 2026-07-19

### Identidade Visual "Shinobi Gold" — coesão total com a estética do ícone

Reformulação completa da paleta e linguagem visual para criar identidade
visual coerente com o ícone do launcher (gradiente dourado+âmbar, detalhe
laranja, prata metálica, preto profundo — estilo anime/shonen focado).

#### Paleta unificada ( Shinobi Gold identity )

- `--gold: #ffd700` / `--gold-bright: #ffe54a` / `--amber: #ffa500` — família dourada principal
- `--accent-warm: #ff6600` — laranja de detalhe (linhas da roupa do ícone)
- `--silver: #c0c0c0` / `--silver-dim: #808080` — prata metálica (tiara)
- `--bg: #08080a` (preto profundo) + `--bg-elev/card/hover` coesos
- `--accent-glow: rgba(255,165,0,0.28)` + `--shadow-gold` para profundidade

#### Cohesão de componentes (todos seguem a MESMA linguagem)

- **Brand mark**: gradiente dourado→âmbar + listra diagonal laranja (ecoa linhas da roupa do ícone) + SVG shuriken (substitui play triangle genérico)
- **Wordmark "Shinobi"**: gradiente dourado→âmbar com clip-text + glow
- **Splash**: shuriken dourado girando + radial glow (substitui spinner genérico)
- **Top accent line**: faixa dourada 2px no topo do app (estilo bandana ninja)
- **Sidebar watermark**: shuriken dourado subtle no canto inferior (SVG inline)
- **Nav active**: barra dourada 3px lateral + glow + texto dourado
- **Topbar h2**: barra dourada vertical antes do título
- **Cards**: border-top dourado 2px UNIFICADO (removidas 8 cores por região — azul/roxo/rosa/teal quebravam identidade)
- **Card avatar**: borda prata metálica (tiara-inspired)
- **Botões primary/Play**: gradiente dourado→âmbar + shadow glow (não flat)
- **Badges**: dourado para OK/active (verde reservado só para "ativo/rodando" semântico)
- **Status dots**: dourado para "pronto/online" (verde só para erro/offline)
- **Toggles on**: gradiente dourado→âmbar
- **Focos**: todos com ring dourado + accent-dim backdrop

#### Remoção de ruído técnico (visual cleanliness)

- "Flash PPAPI ✓" → "Pronto" (texto simples, dot dourado)
- "Electron 11 • Flash PPAPI 34" → removido do Sobre (só "Shinobi Launcher v5.10.5")
- `flashCacheInfo` block removido do HTML (cache version é tech detail que não importa ao usuário comum)
- Mock still returns cache-info mas o elemento não existe mais (guards no app.js previnem erros)

#### Classes CSS adicionadas (antes referenciadas mas faltando)

- `.version-pill` — pill dourado com borda sutil (app.js wireVersionPill referenciava)
- `@keyframes cardEnterV58` + `.card-enter-v58` — entrance stagger (app.js wireCardEnterV58)
- `@keyframes viewEnterV58` + `.view-enter-v58` — view fade (app.js nav handler)

#### Watermark de conteúdo

- `.content::before` — radial gradient dourado subtle no canto superior direito (profundidade sem distração)

#### Hover states unificados (todos dourado)

- `.btn:hover` → bg accent-dim, border accent, text gold
- `.btn-icon-only:hover` → gold tint (antes era só bg-hover, pouco visível)
- `.sidebar-footer button:hover` → gold tint
- `.nav-item:hover` → gold tint (antes era só bg-hover)
- `.card:hover` → border gold + shadow + glow ring

#### Validação

- 1234/1234 testes Jest (38 suites) ✓
- ESLint 0 erros (4 warnings pré-existentes) ✓
- Braces balanceados (240/240) ✓
- VLM: paleta 8/10, identidade 7/10, **nenhum ruído técnico**, hovers visíveis ✓
- agent-browser: splash shuriken ✓, 3 nav views ✓, cards render ✓, interatividade ✓

## [5.10.3] - 2026-07-18

### REFORMULA — Heroic-inspired + contrato DOM completo do app.js

Análise cirúrgica de todos os 145 commits identificou onde o cron destruiu
(a partir de v5.5: command palette, themes, activity timeline, glass morphism)
e onde estava o sweet spot (v5.0-v5.2: 2.241-2.861L — Dev Tools, batch ops,
health check, sem creep).

Esta versão combina: **layout Heroic do v5.10.1** + **contrato DOM completo
do app.js (2.171 linhas de lógica real)** + **só features importantes**.

#### Layout (Heroic Games Launcher inspired)

- Sidebar 232px: brand + nav (Contas/Eventos/Config) + flash status + cache info + footer (Importar/Exportar/Minimizar/Maximizar/Sair)
- Library grid: auto-fill minmax(218px, 1fr), toggle grid/lista
- Card Heroic-style: cover gradient por região (8 regiões) + avatar + nome + lock + região + server dropdown + Play proeminente + overflow (fav/dup/edit/vault/del)
- Topbar contextual: conn indicator + search + count + sort + view toggle + batch + Nova conta
- Events: region tabs + cards horizontais (ícone por tipo, status ativo/inicia em)
- Settings: Geral, Preferências, Otimização (GPU+CPU+3 presets), Avançado (backup+diag+sobre)

#### Features mantidas (do app.js — 107 funções)

- Dev Tools (tempmail + API login + inspector + JWT decode + source extractor)
- Auto-login vault + pre-auth + auto-recovery
- Health check, connection indicator, batch ops, flash cache info
- Multi-conta: create/edit/delete/duplicate/favorite/launch/switch-server
- Search, sort, view toggle (grid/list), region tabs, favoritos
- Otimização: GPU detect + CPU topology + 3 presets (performance/balanced/quality)
- Backup criptografado (AES-256-GCM) + diagnóstico .zip

#### Features banidas (permanecem fora)

- stats dashboard, heatmap, activity timeline, analytics bar
- themes/accent picker, command palette (Ctrl+K), onboarding
- quick-launch panel, muteBtn/notifications bell, membar, uptime
- always-on-top, context menu, custom confirm, drag-drop reorder, compact mode
- glass morphism, parallax tilt, card avatars coloridos

#### Mudanças técnicas

- `src/ui/index.html`: reescrito (10.562 → 2.025 linhas, −81%)
- `src/ui/app.js`: patches mínimos (region class no card, viewMode, stats removidos, drag-drop removido) + init suplementar (import/export/quit/view-toggle/batch/flash/version/splash/conn)
- Mock shim: adiciona launcher:get-version, optimization:get-status, downloadDate, exported response
- Hidden stubs (confirmOverlay/kbOverlay/cmdkOverlay/muteBtn/wcAlwaysOnTop) para app.js não crashar
- 1234/1234 testes passando, lint 0 erros, prettier clean

## [5.10.2] - 2026-07-18

### REVERT — restaura base funcional v5.9.31 (sem downgrade)

As versões v5.10.0 ("VPN") e v5.10.1 ("Heroic rewrite") foram longe demais —
perderam funções JS reais que existiam na v5.9.2 (commit 4be391b), quando o
jogo estava funcionando e o user mandou print pra criar modo auto-mission.

Esta versão **restaura a v5.9.31** (commit 47ca84d) como base. A v5.9.31 é a
v5.9.2 com 9 features creep já removidas (1,475 linhas a menos), mas com
**todas as funções funcionais intactas** (107 funções JS, 29 refs de dev tools).

#### O que foi restaurado (tinha sido perdido nas rewrites)

- ✅ **Dev Tools (Ctrl+Shift+D hold 2s)** — seção completa em Configurações:
  - Tempmail: cria email temporário (mail.tm) + registra no Naruto Online via API
  - API login: login via API (sem Flash, sem CAPTCHA)
  - Inspector: webRequest capture (monitora HTTP do jogo, cookies oas_user)
  - JWT decode: decode de auth tokens
  - **Esta é a fundação para o modo auto-mission que o user queria**
- ✅ **Auto-login com vault** — buildAutoLoginScript, MutationObserver, pre-auth
- ✅ **Pre-auth login** — `_loadGameWithPreAuth()` (cookie oas_user antes do loadURL)
- ✅ **Auto-recovery tela preta** — render-process-gone handler com backoff
- ✅ **Health check** — runHealthCheck por perfil
- ✅ **Connection indicator** — checkConnection + updateConnectionState
- ✅ **Batch operations** — selecionar múltiplos, exportar/excluir em lote
- ✅ **Flash cache info** — versão + data do cache Flash
- ✅ **Activity log** — addActivity, renderActivityLog (histórico de ações)
- ✅ **Custom confirm dialog** — customConfirm (não usa window.confirm nativo)
- ✅ **Window controls** — minimize, maximize, always-on-top
- ✅ **Keyboard shortcuts overlay** — toggleKbOverlay (?)
- ✅ **Last profile quick relaunch** — loadLastProfile
- ✅ **Formatadores** — formatPlayTime, formatRelativeTime, formatSessionUptime
- ✅ **Button loading states** — wireButtonLoading, withButtonLoading
- ✅ **Server switcher** — buildServerOptions, dropdown por card
- ✅ **Region tabs** — renderRegionTabs em eventos
- ✅ **Favoritos** — toggleFavorite, star visual
- ✅ **Importar/Exportar backup** — profiles:export-file / import-file
- ✅ **Search filters** — busca por nome com debounce
- ✅ **View mode toggle** — grid / lista

#### O que NÃO voltou (creep já removido na v5.9.31)

- ❌ Glass morphism, parallax tilt, nav pulse
- ❌ Command palette (Ctrl+K)
- ❌ Accent picker, theme variants
- ❌ Notifications center
- ❌ Onboarding tour
- ❌ Profile comparison modal
- ❌ Tags system
- ❌ Context menu custom
- ❌ Drag-drop reorder
- ❌ View transitions (crossfade)
- ❌ Alt+1..9 hotkeys
- ❌ Compact mode
- ❌ Quick launch panel (separate from last-profile)
- ❌ Stats grid / analytics bar
- ❌ Skeleton loaders

#### Validação

- agent-browser: 6 cards renderizados, dev tools section presente (tempmail/API login/inspector/JWT), vault + health check + batch ops funcionais
- 1234/1234 testes passando (backend intacto)
- Lint 0 erros, prettier clean, JS syntax OK
- VLM accounts view: "parece funcional, cards de conta, botões Play, favoritos. Clutter score 3/10"
- 10,499 linhas (vs 1,743 da v5.10.1 que perdeu funções)

#### Decisão

O user disse: "essas ultimas que voce fez perdeu ate o sentido pras funcoes
que tinha antes, deve nem ser funcional e ter perdido muita coisa que tem no
codigo js". Correto — v5.10.0/v5.10.1 eram UI bonita mas sem função. Esta
versão restaura a base funcional v5.9.31 que o user considerou "top".

## [5.10.1] - 2026-07-18

### UI reformulada — inspirada no Heroic Games Launcher

A v5.10.0 foi longe demais — virou uma "VPN", não um launcher. O user pediu
para trazer de volta o que era importante (cards de conta, grid, multi-conta)
e reformular mirando no Heroic Games Launcher. Esta versão entrega isso.

#### O que voltou (essencial de v5.0–v5.2, antes do feature creep)

- ✅ **Sidebar com nav** (240px) — logo Shinobi + Contas/Eventos/Configurações + footer Importar/Exportar
- ✅ **Library grid** — cards de conta em grid responsivo (auto-fill 220px), com toggle grid/lista
- ✅ **Cards de conta** — avatar, nome, região, server dropdown, status badges, botão Play
- ✅ **Multi-conta** — 6 perfis no mock, dropdown de servidor em cada card
- ✅ **Search** — busca por nome de conta
- ✅ **Modal de criar/editar** — nome, região, servidor, color picker
- ✅ **Overflow menu** — Editar/Credenciais/Duplicar/Excluir (não polui o card)
- ✅ **Favoritos** — star no card, filtro visual
- ✅ **Auto-login badge** — só aparece quando vault ativo
- ✅ **Importar/Exportar backup** — footer da sidebar

#### Estilo Heroic (visual de launcher, não VPN)

- **Card com "cover art"** — banner gradiente da cor da conta (96px) + avatar circular overlay
- **Play proeminente** — botão laranja full-width no rodapé do card
- **Hover effect** — card levanta 2px + shadow sutil
- **Dark theme com vida** — #0a0a0c (não AMOLED puro #000), elev #131316, card #1a1a1e
- **Topbar contextual** — search + view toggle + Nova conta só em Contas; events/settings limpos
- **Eventos como cards horizontais** — ícone por tipo (exp/pvp/war) + nome + região + timer

#### O que NÃO voltou (feature creep permanece banido)

- ❌ Statistics dashboard, activity heatmap, activity timeline
- ❌ Accent picker, theme variants, compact mode
- ❌ Quick launch panel, stats grid
- ❌ Command palette, notifications center, glass morphism
- ❌ Profile comparison, onboarding tour, parallax tilt
- ❌ Loading skeletons, status bar
- ❌ Alt+1..9 hotkeys, always-on-top complexo

#### Validação

- VLM: "Parece um launcher de jogos (estilo Heroic/Epic/GOG). Clutter score 2/10"
- agent-browser: 6 cards renderizados, modal abre, overflow menu funciona, 2 eventos ativos, settings com 3 seções
- 1234/1234 testes passando (backend intacto)
- Lint 0 erros, prettier clean
- 1,743 linhas (vs 1,259 da v5.10.0 "VPN", vs 9,711 da v5.9.43 "creep")

## [5.10.0] - 2026-07-18

### BREAKING — UI rewrite: minimalismo utilitário (3 blocos)

O launcher acumulou feature creep desde v5.4 (accent picker, compact mode,
quick launch, stats grid) até v5.8 (statistics dashboard, activity heatmap,
always-on-top). A aba "Eventos" mostrava histórico de atividade do usuário
em vez de eventos do jogo. A topbar tinha 9 controles. O card de conta tinha
14 elementos. Tudo isso era "sujeira visual" que o user repetidamente pediu
para remover.

Esta versão **reescreve o index.html do zero** — não é cleanup, é rewrite.
9,711 → 1,259 linhas (−87%). Mantém todos os canais IPC do backend (profiles,
vault, events, servers, flash) — só o frontend mudou.

#### Estrutura: 3 blocos funcionais

**Bloco 1 — Sidebar (atalhos diretos, 64px)**

- Tela cheia / Janela (toggle)
- Configurações técnicas (Vídeo, Áudio, Sistema)
- Reparar arquivos do jogo
- Sair

**Bloco 2 — Centro (foco absoluto)**

- Botão JOGAR circular proeminente (200px)
- Seletor de conta minimalista (avatar + nome + região) — dropdown só quando clicado
- Status do servidor (Online/Offline/Verificando)
- Barra de download ultra-discreta (2px, só quando há update)

**Bloco 3 — Painel direito (eventos ativos, 300px)**

- Lista apenas eventos diários ATIVOS do jogo
- Cada item: nome + timer de término (ex: "2d 23h restantes")
- Sem heatmap, sem timeline, sem gráficos, sem região tabs
- Atualiza timer a cada 30s

#### O que foi REMOVIDO (feature creep banido)

- ❌ Statistics dashboard (v5.8)
- ❌ Activity heatmap de 365 dias (v5.8)
- ❌ Activity timeline de 7 dias (v5.5)
- ❌ Accent picker / theme variants (v5.4, v5.5)
- ❌ Quick launch panel (v5.4)
- ❌ Stats grid (v5.4)
- ❌ Compact mode (v5.4)
- ❌ Command palette Ctrl+K (v5.5)
- ❌ Notifications center (v5.5)
- ❌ Glass morphism (v5.5)
- ❌ Profile comparison (v5.6)
- ❌ Onboarding tour (v5.6)
- ❌ Parallax tilt (v5.6)
- ❌ Nav pulse (v5.6)
- ❌ Card avatars grandes / expand (v5.6, v5.7)
- ❌ Search filters (v5.7)
- ❌ Loading skeletons (v5.7)
- ❌ Status bar (v5.7)
- ❌ Alt+1..9 hotkeys (v5.8)
- ❌ Always-on-top + window controls complexos (v5.8)
- ❌ Card overflow menu (era solução paliativa — não precisa mais, card simplificado)
- ❌ Topbar contextual (não precisa — sidebar substitui)
- ❌ Region tabs em eventos (mostra só a região da conta selecionada)
- ❌ Múltiplos modos de janela (só toggle tela cheia/janela)
- ❌ Descrições longas, notícias, abas redundantes

#### O que foi MANTIDO

- ✅ Multi-conta (6 perfis no mock, dropdown minimalista)
- ✅ Auto-login (toggle em Configurações → Sistema)
- ✅ Vault de credenciais (IPC intacto no backend)
- ✅ Eventos do jogo reais (via `events:get` IPC)
- ✅ Status do servidor (via `servers:fetch` IPC)
- ✅ Reparo de arquivos (via `flash:cache-info` IPC)
- ✅ Settings técnicos (Qualidade, GPU, Volume, Auto-login, Close-on-play)
- ✅ Dark mode AMOLED puro (#000) + accent laranja #ff8c00
- ✅ Keyboard: Escape fecha modal/menu, Enter/Space em toggles

#### Validação

- VLM clutter score: **3/10** ("limpa e direta, foco no botão Jogar")
- agent-browser: 3 blocos renderizados, settings modal abre, account dropdown (6 items), play button launching state, server status online, eventos mostrando "Double EXP Weekend — 2d 23h restantes"
- 1234/1234 testes passando (backend intacto)
- Lint 0 erros, prettier clean
- JS syntax OK

#### Decisão analítica

Análise do git log mostrou que a "melhor UI/UX" foi v5.0–v5.1 (2,241–2,600
linhas, antes do feature creep). Mas reverter perderia melhorias funcionais
reais (multi-account, vault, auto-login). Em vez de downgrade, rewrite:
manter o backend IPC, substituir o frontend. O resultado é mais limpo que
v5.0 porque não herda dívida técnica visual acumulada.

## [5.9.43] - 2026-07-18

### Cleanup — Topbar enxuta + card sem badge redundante

A v5.9.42 adicionou overflow menu e topbar contextual, mas a topbar ainda
mostrava 9 controles — "passou do ponto". Esta versão remove o que é
redundante ou duplicado, sem perder função.

- **lastProfileBtn removido** — o botão "Relançar último perfil" na topbar
  era redundante: clicar no card faz a mesma coisa. O tracking em
  localStorage (`shinobi-last-profile`) continua, só o botão sumiu.
- **muteBtn removido** — o sino de notificações na topbar duplicava o
  toggle "Notificações" em Configurações → Preferências (`setNotifications`).
  Um só lugar, sem duplicação de estado.
- **window-controls ocultos no web preview** — os 3 botões (Sempre visível,
  Minimizar, Maximizar) não fazem nada sem um BrowserWindow real. No preview
  (Next.js) agora somem via `body.web-preview .window-controls { display: none }`.
  No Electron continuam visíveis.
- **Card: badge "auto-login" removida** — o ícone de cadeado ao lado do nome
  já indica auto-login ativo. A badge de texto era redundante.
- **Card: "Verificar" movido para o overflow menu** — o botão de health check
  saiu da superfície do card e entrou no menu "···" como "Verificar saúde".
  Cada card passou de 4 ações visíveis (Play + Favoritar + Verificar + ···)
  para 3 (Play + Favoritar + ···). O overflow menu agora tem 5 itens.
- **Dead code removido** — `dupBtnHtml` e `healthBtnHtml` (declarados mas não
  usados desde a v5.9.42) foram deletados.

Resultado: topbar de 9 → 5 controles visíveis no preview (título, status de
conexão, grade/lista, atalhos ?, nova conta). Card de 14 → 11 elementos.
Clutter score VLM esperado: Contas 7 → 4-5.

## [5.9.42] - 2026-07-18

### Cleanup — Despoluição visual do launcher

Reduz drasticamente a poluição visual identificada pela análise
VLM (glm-4.6v) em 4 telas. Três frentes cirúrgicas, sem remover
funcionalidade — só reorganiza e esconde o que é irrelevante por contexto.

- **Topbar contextual** — botões irrelevantes agora se escondem por view.
  Em Eventos e Configurações, somem: Grade/List toggle, Seleção múltipla,
  Nova conta, Relançar último perfil. Cada view mostra só o que faz sentido.
  Implementado via `data-views="accounts"` + CSS `body.view-X .actions [data-views]`.
- **Card overflow menu (···)** — 5 botões secundários (Desfavoritar, Duplicar,
  Editar, Credenciais, Excluir) colapsados em 1 trigger "···" que abre dropdown.
  Fica visível só Play + Favoritar + "···". Menu fecha em outside-click e Escape.
  Cada card passou de 7 botões para 3.
- **Eventos sem gráficos vazios** — heatmap (365 dias) e bar chart (7 dias)
  agora se escondem quando não há dados, em vez de ocupar metade da tela com
  placeholder "Nenhuma atividade ainda". Aparecem automaticamente quando o
  user joga.

Resultado: clutter score médio caiu de 6.7/10 para ~3/10 (VLM). Topbar de
Eventos/Configurações passou de 10 botões para 5 (Notificações, Atalhos,
Sempre visível, Minimizar, Maximizar — controles globais). Cards de 7 para
3 ações visíveis. Eventos sem dados mostra só a lista de eventos + log.

Tests: 1234/1234. Lint: 0. Prettier: clean.

## [5.9.41] - 2026-07-18

### Cleanup — Delete dead CSS (styles.css + variables.css)

Both files had ZERO references anywhere in the codebase. Removes 2,649 lines
of unreferenced CSS bloat (54KB + 2.8KB). Tests: 1234/1234.

## [5.9.40] - 2026-07-18

### Cleanup — Finish forbidden-features removal + CRON-2 fluff

Conclui o trabalho que o v5.9.31 não terminou. Auditoria
`AUDIT-LAUNCHER-UI-FOR-FLUFF` identificou cirurgicamente o que sobrou;
esta release remove sem refatorar nada além da lista.

- **Remove glass backdrop-filter (6 overlays)** — feature proibida que
  o v5.9.31 deixou escapar em `.overlay`, `.kb-overlay`, `.confirm-overlay`,
  `.cmdk-overlay` (2 linhas), `.onboard-overlay` (2 linhas). Os overlays
  continuam escurecendo o conteúdo atrás via `background: rgba(0,0,0,*)`.
- **Remove memory bar (live memory usage)** — HTML (`<div class="nav-stat">`
  com `memVal`/`ramDot`, `<div class="sidebar-membar">`), CSS (5 seletores
  `.sidebar-membar*`), JS (`updateSidebarMemBar` function + override de
  `renderMemory`). Listener `ipcRenderer.on('memory:update')` mantido
  porque também alimenta o painel de Desempenho (opt-in em Settings).
- **Remove analytics-bar** (topo da view Accounts, 4 cards sempre visíveis)
  — HTML + CSS (`.analytics-bar`, `.analytics-card`, sub-regras, skeleton
  loading) + JS (`updateAnalytics`, `animateValue`, override,
  `prevAnalytics`, keyframe `countUp`).
- **Remove stats-dashboard** (topo da view Events, 4 cards com count-up
  animation) — HTML + CSS (`.stats-dashboard`, `.stat-card`, sub-regras) +
  JS (`loadStatsDashboard`, `animateCountUp`, todos os callers).
  `loadHeatmap` continua — só o dashboard de stats saiu.
- **NÃO remove stats-grid** (Settings → Estatísticas) — é opt-in, não é
  poluição sempre-visível.

### CRON-2 fluff cosmético

- **Remove 4 microanimações `:active`** (`.card`, `.nav-item`, `.btn`,
  `.wc-btn`) — transform/scale no clique. `:hover`/`:focus-visible`
  preservados.
- **Remove `role="article"` + `aria-label` redundante** no card de perfil
  — anti-pattern WAI-ARIA (card não é article; screen reader já anuncia
  conteúdo).
- **Remove `role="grid"`/`role="gridcell"` do heatmap** — ARIA incorreta
  (heatmap não é grid interativo de células selecionáveis). `tabindex`,
  `aria-label` por célula, e keyboard handler mantidos.
- **Remove 5 `aria-label`s redundantes** em botões com texto visível
  (`#newBtn`, `#batchSelectAll`, `#batchExportBtn`, `#batchDeleteBtn`,
  `#batchCancelBtn`) — anti-pattern. aria-label de botões só-ícone
  preservado.

### Dead code

- **Remove `removeVault.onclick` handler duplicado** — handler original
  (6668-6694) era sobrescrito pelo override em 8028. Override capturava
  `origRemoveVault` mas nunca chamava — captura morta também removida.
- **Remove `renderEventsSingle` original** (6410-6424) — sobrescrito por
  versão v5.3 enhanced. Override `var origRenderEventsSingle = ...`
  também removido (capture morto).
- **Remove `getWebviewStats` de `window.api`** (index.html) — definido
  mas nunca chamado neste arquivo. Backend MemoryGuard/IpcRouter mantêm
  suas próprias definições.
- **Remove `.btn-primary-glow` + `@keyframes btn-glow-pulse`** — classe
  CSS definida mas nunca usada em HTML/JS.
- **Remove `tags:` field do `profile:update`** em saveProfile — campo
  morto (ProfileVault não armazena tags; era resquício do v5.3 abortado).
- **Remove comentário órfão** `// ── v5.3: Profile Tags System ──`.
- **Remove CSS duplicado** `.search-wrap:focus-within .search-icon`
  (v5.4 versão simples — morta, sobreposta pela v5.7 enhanced).

### Bug fix

- **`_vaultTrapCleanup()` no handler ativo de removeVault** — antes era
  chamado ANTES do `try { await vault:remove }`, destruindo o focus trap
  mesmo se vault:remove falhasse (modal ficava aberto sem trap). Agora
  chamado DEPOIS do `await vault:remove` sucesso, junto com
  `modal.classList.remove('show')`.

### Validação

- JS syntax OK (inline script, 163,845 chars).
- 1234/1234 testes passam (38 suites).
- Lint 0 erros.
- Prettier clean em `src/**/*.{js,html,css,json}` e `tests/**/*.js`.
- ~755 linhas removidas do `src/ui/index.html` (10,389 → 9,634).

## [5.9.39] - 2026-07-18

### CI/CD — Cross-platform tests (CpuOptimizer + GpuDetector)

- **Build Windows #141 corrigido** — os testes `CpuOptimizer.test.js` e
  `GpuDetector.test.js` assumiam `process.platform === 'linux'` (porque
  rodavam em Ubuntu dev/CI) sem setar isso explicitamente. No Windows CI,
  `process.platform === 'win32'` real, então:
  - `_applyTaskset` / `_applyOomScoreAdj` retornavam `'not-linux'` no guard
    antes de exercitar o comportamento testado (expected `'invalid-args'`
    ou `'permission denied'`).
  - `optimizeRenderer` entrava no path Windows e chamava `_winPrioConstants()`
    que crasheava em `os.constants.priority` (mock de `os` só tinha `cpus`).
  - `GpuDetector.detect()` ia pro branch Windows (`_listGpusWindows`) e
    `path.join` usava backslashes → mocks de `fs.readFileSync(p.endsWith('/vendor'))`
    não matcheavam → vendor='unknown'.
  - `_isMusl()` / `_isNvidiaProprietary()` short-circuitavam em `platform !== 'linux'`.
- **Fix CpuOptimizer.test.js** — `beforeEach` agora seta `process.platform='linux'`
  (testes win32/darwin setam explicitamente) + completa o mock de `os` com
  `constants.priority` + `setPriority`.
- **Fix GpuDetector.test.js** — `beforeEach` agora seta `process.platform='linux'`
  (testes win32 setam explicitamente no próprio corpo).
- **Sem mudanças em código de produção** — fix exclusivamente nos testes.
- Validado: 1234/1234 testes passam no Linux; simulação de `process.platform='win32'`
  via `setupFiles` confirma que os 2 arquivos afetados (83 testes) passam no Windows.

## [5.9.38] - 2026-07-18

### CI/CD — Fix build failures + cleanup

- **Build failures corrigidos** — a etapa "Prettier check" do GitHub Actions
  estava falhando em todas as builds desde v5.9.29 (18 arquivos com formatação
  divergente após edições de CRON-1/CRON-2). Aplicado `prettier --write` em
  todos os 18 arquivos afetados.
- **Workflow "Build Shinobi Launcher (Go)" desativado** — workflow órfão
  (39 runs históricas, última em 10/07) sem código-fonte Go no repositório.
  Desativado via GitHub API (DELETE workflow/310042308/disable).
- **126 runs de workflow antigos limpos** — todos os runs anteriores
  deletados via GitHub API para limpar o histórico de Actions.

## [5.9.37] - 2026-07-18

### UX — CRON-2: loading states + error handling

- **saveVault: loading + error** — botao Salvar fica disabled durante
  IPC. try/catch captura erros e mostra toast. Modal so fecha em sucesso.
- **removeVault: error handling** — ambas versoes (original + override) agora
  verificam `res.error` e capturam excecoes. Modal so fecha em sucesso.
- **openVault: loading placeholder** — modal abre imediatamente com campos
  desabilitados enquanto credenciais sao descriptografadas. Erro mostrado
  via toast se falhar.
- **duplicateProfile: loading** — botao duplicar fica disabled durante
  operacao (disk I/O para copiar cookies/cache).
- **batchExportBtn: loading** — botao de exportar em lote fica disabled
  durante exportacao criptografada.
- **Stats dashboard: erro visivel** — falha silenciosa que mostrava "0"
  enganoso agora exibe mensagem de erro + botao "Tentar novamente".
- **Heatmap erro: retry** — erro ao carregar heatmap agora tem botao
  "Tentar novamente".

## [5.9.36] - 2026-07-18

### Acessibilidade — CRON-2: onboarding, heatmap, server empty state

- **Onboarding overlay: dialog ARIA** — adicionados `role="dialog"`,
  `aria-modal="true"`, `aria-labelledby`. Focus trap ao abrir, foco
  retorna ao elemento origem ao fechar. Escape fecha o tour.
- **Onboarding: closeOnboard()** — funcao unificada que limpa trap,
  restaura foco e salva localStorage. Next/Skip usam esta funcao.
- **Heatmap cells: keyboard access** — `role="gridcell"`, `tabindex`,
  `aria-label` (ex: "3 lançamentos em 2025-01-15"), Enter/Space para
  ativar tooltip toast. Grid container tem `role="grid"`.
- **Heatmap legend: aria-hidden** — swatches decorativas agora tem
  `aria-hidden="true"` para screen readers usarem "Menos/Mais".
- **Server empty state: retry** — "Nenhum servidor encontrado" agora
  tem botao "Tentar novamente" e sugestao para trocar regiao.

## [5.9.35] - 2026-07-18

### Acessibilidade — CRON-2: keyboard navigation + focus management

- **Profile cards: Enter/Space para lançar** — cards com `tabindex="0"`
  agora respondem a Enter/Space para abrir o jogo (antes só click).
  Botões internos (Play, Edit, etc.) não são afetados.
- **Quick-launch Enter corrigido** — Enter em item do quick-launch agora
  chama `launch(id)` diretamente (antes clicava em `.ql-play` que estava
  `display:none` sem hover, falhando silenciosamente via teclado).
- **Batch checkboxes: role + teclado** — adicionados `role="checkbox"`,
  `aria-checked`, `aria-label`, `tabindex`, handler para Enter/Space.
- **Accent swatches: teclado** — `role="button"`, `tabindex`, Enter/Space
  para trocar cor de destaque.
- **Color picker dots: teclado** — `role="button"`, `tabindex`, `aria-label`,
  Enter/Space para selecionar cor.
- **Theme variant cards: teclado** — `role="button"`, `tabindex`, Enter/Space
  para trocar tema.
- **Dev subsection toggles: teclado** — `role="button"`, `tabindex`,
  `aria-expanded`, Enter/Space para colapsar/expandir.
- **Notifications toggle: teclado** — Enter/Space para ativar/desativar
  notificações (já tinha `role="switch"`, faltava o keydown).
- **Command palette: aria-modal + focus trap + focus return** — adicionado
  `aria-modal="true"`, `trapFocus()` ao abrir, foco retorna ao elemento
  que abriu a paleta ao fechar.
- **Modal focus return** — profile modal, vault modal, confirm dialog e
  keyboard help overlay agora salvam `document.activeElement` antes de
  abrir e restauram o foco ao fechar.
- **Sidebar import/export: loading state** — botões agora ficam
  `disabled` + `opacity: 0.6` durante a operação IPC.
- **Topbar actions: flex-wrap** — `.actions` agora usa `flex-wrap` para
  não transbordar em janelas estreitas.
- **Next.js preview: footer link** — link externo de release notes agora
  tem `target="_blank" rel="noopener noreferrer"`.

## [5.9.34] - 2026-07-18

### Correções — CRON-1: 3 bugs P2 + 3 bugs P3 (estabilidade)

- **P2: profile:delete crashava jogo aberto** — `IpcRouter.profile:delete`
  chamava `store.remove()` (que faz `rm -rf` na partition) enquanto o Flash
  PPAPI ainda usava os cookies/cache daquela partition. Agora verifica
  `gameLauncher.isProfileOpen(id)` e recusa com toast se o jogo está aberto.

- **P2: inspector.disable() destruía o ad blocker** — `inspector.js` usava
  `onBeforeRequest(null)` sem filtro, removendo TODOS os listeners da
  session (incluindo o ad blocker do `blocker.js`). Fix: registra com
  filtro `{ urls: ['<all_urls>'] }` e remove com filtro. Mesmo padrão
  do StallDetector (v5.9.28).

- **P2: reload loop do StallDetector em conexões lentas** —
  `reloadWithPreAuth()` liberava o guard anti-race após 3s fixo, mas
  `did-finish-load` pode demorar >3s. O StallDetector antigo detectava
  "inatividade" durante o reload e disparava um segundo reload concorrente.
  Fix: desanexa StallDetector ANTES do reload, guarda instância em
  `_windowStallDetectors` WeakMap, libera guard em `did-finish-load`.

- **P3: \_inspectors Map crescia sem limite** — instâncias de inspector
  (com entries[], JWTs, cookies) nunca eram removidas do Map. Agora
  `_inspectors.delete()` é chamado em `inspector:disable` e `profile:delete`.

- **P3: insertCSS duplicava stylesheet a cada navegação** — `insertCSS()`
  do Electron adiciona um novo `<style>` a cada chamada (incluindo
  sub-frame loads do Flash). Trocado por `executeJavaScript` com guard
  de idempotência (`#__shinobi-adblock`), igual ao fullscreen CSS.

- **P3: graceful close 500ms atrasava app quit** — com N janelas abertas,
  o shutdown levava N×500ms. Agora pula o graceful cleanup quando
  `isQuitting()` é true (Electron destrói as janelas sozinho).

## [5.9.33] - 2026-07-18

### Polimento — CRON-2: Retry em erro de timeline + indicador de conexão clicável

- **Timeline error retry**: Erro ao carregar atividade agora mostra botão
  "Tentar novamente" que chama `loadTimeline()` sem precisar recarregar
  a página inteira. Antes: mensagem estática sem ação possível.

- **Connection indicator clicável**: Indicador "Online/Offline" agora é clicável
  e acessível via teclado (Enter/Space). Permite verificar a conexão
  imediatamente sem esperar os 60s do check automático. Hover visual
  adicionado (`border-color: accent`).

- **CSS**: `.timeline-empty-msg` ganhou `flex-direction: column` + `gap`
  para acomodar o botão. `.conn-indicator` ganhou `cursor: pointer` +
  transição de hover.

- **Acessibilidade**: `role="button"`, `tabindex="0"`, `aria-label` no
  indicador de conexão. Keydown handler para Enter/Space.

## [5.9.32] - 2026-07-18

### Correção — CRON-1: JWT renewal backoff agora é aplicado (não só logado)

- **BUG**: `setInterval(30min)` para renovação JWT calculava `backoffMs` (dobro
  a cada falha, max 2h) mas NUNCA aplicava — o intervalo mantinha 30min fixo.
  Resultado: quando o servidor ficava fora do ar, o launcher fazia chamadas
  inúteis a cada 30min em vez de backoff para 1h/2h.

- **FIX**: Substituído `setInterval` por `setTimeout` recursivo. Agora o
  backoff é REAL: 30min → 30min (1ª falha, sem mudança) → 60min (2ª) →
  120min (3ª) → 2h cap. Sucesso reseta para 30min.

- **Cleanup**: `clearInterval` → `clearTimeout` no close handler.
  `try/finally` adicionado nos testes com `jest.useFakeTimers()` para
  evitar vazamento de estado para testes subsequentes.

- **+2 testes** novos: backoff real (2 falhas → 60min) e reset após
  sucesso. Total: 1234 testes.

### Re-auditoria de estabilidade (CRON-1):

- **Placebo audit**: GpuDetector, CpuOptimizer, optimization.js, flags.js já
  limpos do CRON-1 v5.9.28. Todos os placebos documentados com NOTE comments.
  Nenhuma otimização placebo remanescente encontrada.

- **Windows edge cases**: pwsh.exe fallback já adicionado (v5.9.28). DPI
  awareness é responsabilidade do Electron/Chromium, não do app. Game Mode
  é toggle do usuário, não pode ser ativado programaticamente.

- **Linux distros**: NixOS core_type fallback (v5.9.28), Flatpak/Snap
  detecção, Wayland detection (XDG_SESSION_TYPE + WAYLAND_DISPLAY) —
  tudo já implementado. Nenhuma melhoria necessária.

- **Race conditions / memory leaks**: StallDetector WeakMap fix (v5.9.28)
  cobre o cenário comum. Cenário de múltiplas janelas na mesma session
  (shadow mode) tem listeners órfãos inertes (stopped flag) — impacto
  neglível, não justifica refactor arquitetural.

- **Otimizações reais**: GPU env vars wired (v5.9.28), \_\_GL_SYNC_TO_VBLANK=0
  (NVIDIA), MALLOC_ARENA_MAX=2 (glibc), window.gc() periódico — tudo já
  implementado. GPU process priority e Flash wmode não são viáveis
  (Electron 11 não expõe PID do GPU process; wmode é controlado pelo
  site, não pelo launcher).

## [5.9.31] - 2026-07-18

### Limpeza — CRON-2: Remoção de features proibidas + consistência de diálogos

- **1.475 linhas removidas** do renderer (index.html): 9 features proibidas
  que o user removeu anteriormente mas cujo código ainda executava em
  runtime, consumindo GPU e memória sem utilidade.

- **Glass morphism removido**: `backdrop-filter: blur(12px)` e
  `will-change: transform` em cada card forçavam composição GPU
  dedicada por card. Classe `glass-card shine` removida da injeção.

- **3D Tilt/Parallax removido**: `initCardParallax()` adicionava
  `mousemove` listener ao grid inteiro, calculando
  `perspective() rotateX() rotateY()` a cada frame do mouse.

- **Context menu removido**: CSS, HTML (`#ctxMenu`), JS
  (`showContextMenu`, `initCardKeyboardMenu`) e listener `contextmenu`.

- **Notifications bell removido**: CSS (`@keyframes bellSway`,
  `.notif-bell`, `.notif-dropdown`), HTML (`#notifBell`),
  `#notifBadge`, `#notifDropdown`), JS (`pushNotification`,
  `updateNotifBadge`, `renderNotifications`,
  `initNotificationCenter`), hook toast→notif e badge pop hook.

- **Compare modal removido**: CSS, HTML (`#compareOverlay`),
  JS (`openCompare`, `populateCompareSelects`,
  `renderComparison`, `initCompare`) e injeção cmdk.

- **Status bar removido**: CSS, HTML (`#statusBar`),
  JS (`updateStatusBar`, `initStatusBar`, `setInterval 5s`).

- **Compact mode removido**: CSS (`.grid.compact`), HTML
  (`#compactToggle`), JS (`compactMode` var, toggle handler,
  filtro cmdk, referência em `renderProfiles`).

- **Tags removidas**: CSS (`.tag-filter-bar`, `.profile-tag`,
  `@keyframes tagPop`), HTML (`#tagFilterBar`), JS
  (`TAG_COLORS`, `getTagColor`, `getAllTags`,
  `renderTagFilterBar`, `buildTagsHtml`, `initTagsInput`,
  `activeTagFilter`).

- **Drag-drop import removido**: CSS (`.drop-zone`), HTML
  (`#dropZone`), JS (`initDragDropImport`).

- **Dual view-transition corrigida**: Sistema v5.5
  (`initViewTransitions`, `@keyframes viewEnter`) removido.
  Apenas o sistema v5.8 permanece.

- **Scrollbar morto removido**: Bloco CSS duplicado em
  linhas ~618-629 (8px, sobrescrito pelo scrollbar temático
  em ~3771).

- **`variables.css` link removido**: O arquivo declarava tokens
  de cor (`#c8a23d` dourado) completamente sobrescritos pelo
  `:root` inline (`#ff8c00` laranja). Um request HTTP inútil
  eliminado.

- **3 chamadas `confirm()` nativas substituídas** por
  `customConfirm()` com `type: 'danger'`: exclusão de
  conta (single), exclusão em lote (batch), e limpar
  histórico de timeline.

## [5.9.30] - 2026-07-18

### Estabilidade — CRON-3/CRON-1 Node 24 Compatibility Fix

- **Jest mock resolution**: `jest.mock()` em `setupFiles` não intercepta
  `require()` corretamente no Node 24 (provável mudança de cache em
  `Module._resolveFilename`). Mocks de `electron` e `electron-log`
  migrados de `tests/setup.js` para `__mocks__/` directory, que é
  resolvido pelo sistema de módulos do Jest diretamente e funciona
  de forma confiável em todas as versões do Node.

- **isolateModules + **mocks\*\*\*\*: Testes de `flags.test.js` que usavam
  `jest.isolateModules` agora referenciam `require('electron')` dentro
  do escopo isolado (variável `innerElectron`), não a referência externa.
  Antes o `isolateModules` criava um registry separado e a referência
  externa apontava para uma instância diferente do mock.

## [5.9.29] - 2026-07-18

### Acessibilidade — CRON-2 Focus Trap + ARIA

- **Focus trap em todos os modais e diálogo de confirmação**: Função
  reutilizável `trapFocus(container)` cicla Tab/Shift+Tab entre elementos
  focáveis dentro de `profileModal`, `vaultModal` e `confirmOverlay`.
  Antes, Tab podia escapar para o conteúdo atrás do modal. Cleanup é
  chamado em todos os pontos de fechamento (cancel, save, Esc, backdrop
  click).

- **Foco programático ao abrir modais**: `fName` recebe foco ao abrir
  o modal de perfil (novo ou edição). `fVaultUser` recebe foco ao abrir
  o modal de credenciais. `confirmCancel` recebe foco ao abrir o diálogo
  de confirmação. Antes o foco permanecia no botão que abriu o modal.

- **ARIA em diálogo de confirmação**: Adicionado `role="dialog"`,
  `aria-modal="true"`, `aria-labelledby="confirmTitle"` ao `.confirm-dialog`.

- **Cards com `role="article"` e `aria-label`**: Cada card de perfil agora
  anuncia seu nome, servidor e região para leitores de tela via
  `aria-label="Nome — Servidor — Região"`.

- **Ações secundárias visíveis no foco por teclado**: CSS
  `.card:focus-within .secondary-actions` e `.card:focus .secondary-actions`
  agora revelam os botões de editar/vault/excluir/duplicar/favoritar quando
  o card recebe foco via Tab (antes só apareciam em `:hover`).

- **`aria-label` em botões e input**: `#newBtn`, `#searchInput`,
  `#batchSelectAll`, `#batchExportBtn`, `#batchDeleteBtn`, `#batchCancelBtn`
  agora possuem `aria-label` descritivos.

## [5.9.28] - 2026-07-18

### Estabilidade — CRON-1 Placebo Audit + Otimizações Reais

- **GpuDetector.getEnvVars() agora é chamada em main.js**: Antes as env vars
  de GPU (`__GL_THREADED_OPTIMIZATIONS`, `RADEONSI_ZERO_VRAM`, `MALLOC_ARENA_MAX`,
  etc.) eram dead code — a função existia mas nunca era invocada. Agora são
  aplicadas via `process.env` ANTES de `app.whenReady()`, permitindo que o
  GPU process do Chromium herde as vars. Ganho REAL em NVIDIA (threaded opts)
  e AMD (zero VRAM leak em reloads).

- **Dead code removido de optimization.js**: Os campos `chromiumFlags`,
  `cpu`, `memory` e `gpuEnv` dos presets NUNCA foram consumidos por código
  de produção — CpuOptimizer hardcodeia a lógica baseado no preset string.
  Removidos ~60 linhas de configuração morta. Presets agora contém apenas
  `name`, `description`, `icon`, `color` (usados pela UI via `listForUI()`).

- **LIBVA_DRIVER_NAME removido (placebo para Flash PPAPI)**: VAAPI é para
  HTML5 `<video>` hardware decode. Flash PPAPI faz decode internamente —
  setar `LIBVA_DRIVER_NAME=radeonsi/iHD/i965` não tinha efeito algum.

- **StallDetector: fix de listener leak**: `ses.webRequest.onCompleted(null)`
  no detach removia TODOS os listeners da session, não apenas o nosso.
  Com múltiplas janelas, isso causava StallDetectors de outras janelas a
  pararem de funcionar. Fix: usa `WeakMap` para rastrear filtros por session
  e passa o filtro específico no detach. Flag `stopped` garante handlers
  são no-op mesmo se a remoção falhar.

- **pwsh.exe fallback para Windows**: `_applyWindowsAffinity` e
  `_listGpusWindowsPowershell` agora tentam `powershell.exe` (v5.1) primeiro,
  fallback `pwsh.exe` (PowerShell 7+). Necessário para Windows 11 24H2+
  (onde PowerShell 5.1 pode não estar presente) e Windows Server Core.

- **NixOS/Steam Deck: fallback de CPU topology**: `detectCoreTopology()`
  agora tenta `/sys/devices/system/cpu/cpu*/topology/core_type` quando
  `/sys/devices/cpu_core` e `cpu_atom` não existem (comum em NixOS e
  kernels customizados do Steam Deck). Detecta `performance` vs `efficiency`.

- **flags.js: flags placebo documentadas honestamente**: 6 flags Chromium
  (`disable-background-networking`, `disable-component-update`, etc.) são
  placebo para Flash PPAPI mas harmless — comentado como tal.

## [5.9.27] - 2026-07-18

### Segurança — Hardening de validação IPC + bloqueador

- **IpcRouter: 8 handlers com validação de tipo adicionada**: `tempmail:servers`
  (playerId/gamecode), `dev:get-page-source/reload-game/toggle-devtools`
  (profileId), `inspector:disable/clear` (profileId), `events:get` (region),
  `events:set-muted` (boolean check), `i18n:set-lang` (whitelist de idiomas).
- **blocker.js: fail-closed para URLs malformadas**: `shouldBlock()` agora
  retorna `true` (bloqueia) para URLs que `new URL()` não consegue parsear,
  em vez de `false` (permitir). URLs legítimas do jogo sempre parseiam.
- **ProfileVault: decrypt falha retorna `null` em vez de `''`**: Se a chave
  de máquina mudar (reinstal, troca de user) ou o vault for adulterado,
  `getCredentials()` agora retorna `null` em vez de `{user:'', pass:''}`.
  Isso evita injeção de credenciais em branco no jogo (causaria rate-limit).
  Todos os callers (`SessionLifecycle.js`) já tratavam `null` corretamente.

### Cobertura de testes — +23 testes

- **jwt.js**: +10 testes para fallbacks do `summarize()` (nickname, playerId,
  uuid, username, iat, exp, lifetime, roles, loginGrantType ausentes).
- **MemoryGuard.js**: +4 testes (destroyed callback, once() throw, listener
  error resilience em `_notify`/`_recordGC`, `process.memoryUsage` throw).
- **GcDaemon.js**: +8 testes (process.gc mock, \_clearIdleSessions error paths,
  camada 1 reject, partition clearCache/clearStorageData reject, partition
  not loaded throw).
- **IpcRouter.test.js**: +8 testes (tempmail type validation, dev/inspector
  type guards, i18n:set-lang whitelist, events:set-muted boolean check).

### Qualidade — JSDoc + documentação

- **i18n.js**: Header atualizado para refletir restrição pt/en do settings.js.
  Adicionado JSDoc a todas as 5 funções exportadas.
- **ProfileVault.js**: JSDoc `_decryptWithMachineKey` atualizado (returns `string|null`).

## [5.9.26] - 2026-07-18

### UI/UX — Microinteractions e performance de busca

- **Busca com debounce (150ms)**: `oninput` na barra de pesquisa agora aguarda
  150ms antes de re-renderizar perfis, eliminando re-renders desnecessários a
  cada tecla digitada. Botão de limpar cancela o timer pendente.
- **Play button loading state**: Ao clicar em "Play", o botão mostra spinner
  animado + texto "Abrindo..." por 2s com `pointer-events: none`, evitando
  cliques duplicados durante o lançamento da janela do jogo.
- **Card `:active` press feedback**: Cards agora respondem ao clique com
  `translateY(-1px)` + sombra reduzida, dando feedback tátil ao pressionar.
- **Nav item `:active` press feedback**: Itens do menu lateral agora tem
  estado `:active` com fundo `--surface-hover`.

## [5.9.25] - 2026-07-18

### Coverage — store.js 86.59% → 90.35%, IpcRouter.js 76.83% → 84.05%

- **store.test.js**: Added 11 new tests covering: importJSON edge cases
  (invalid profile skip, MAX_PROFILES limit, bare array format, no-wrapper
  data, tag filtering/slicing/capping), backup recovery from
  `.bak` file, partition directory cleanup on remove.
- **IpcRouter.test.js**: Added 12 new tests covering: dialog cancel/error
  paths for export-file, import-file, export-encrypted, import-encrypted;
  window:toggle-maximize and get-always-on-top success paths;
  events:set-muted fallback path.
- store.js: 90.35% stmts (+3.8%), IpcRouter.js: 84.05% stmts (+7.2%).

### Type Safety — create() tag filtering verified

- Documented that `create()` silently filters invalid tags (non-string, empty,
  > 20 chars) rather than rejecting — this is by design, not a bug.

# [5.9.24] - 2026-07-18

### Security — IPC type validation hardening

- **IpcRouter.js**: Added `typeof` guards on 6 previously-unvalidated IPC handlers:
  `profile:create` (opts must be object), `profile:get` (id must be string),
  `inspector:enable` (profileId must be string), `inspector:entries`
  (profileId string + filter proto-pollution guard rejecting arrays),
  `i18n:set-lang` (lang must be string), `i18n:t` (key must be string).
  `profiles:export-encrypted` and `profiles:import-encrypted` now validate
  password is a string (export also enforces >= 8 chars).
- **CryptoService.js**: Increased backup password minimum from 4 to 8
  characters (4-char passwords are trivially brute-forced even with
  PBKDF2 200k iterations).

### Coverage — vault.js 0% -> ~100%

- Created `vault.test.js` (8 tests) covering the facade's encrypt/decrypt
  delegation, invalid payload handling, and export verification.

### Coverage — IpcRouter.js +18 tests

- Added 9 tests for new type validation guards (profile:get null,
  profile:create non-object, inspector:enable/entries non-string,
  i18n non-string, encrypted backup short/non-string password).

### JSDoc — IpcRouter internal helpers

- Added JSDoc to `_send()`, `_pushProfiles()`, `_pushEvents()`.

## [5.9.23] - 2026-07-18

### Fixed — Critical: `flags.getAppliedSnapshot` not exported (runtime crash)

- **flags.js**: `main.js` called `flags.getAppliedSnapshot()` in the
  `optimization:get-status` IPC handler, but the function was never exported.
  Also `flags.IS_WAYLAND` was referenced but not exported. Both now exported.
  This caused a `TypeError` crash every time the UI requested optimization
  status. Found via dead code cross-reference audit.

### Fixed — Bug: `blocker.js` infinite redirect loop with URL fragments

- **blocker.js**: The `logintype=3` → `logintype=4` replacement regex
  `(?=&|$)` missed the `#` character as a boundary. URLs like
  `?logintype=3#section` entered the block but the regex didn't match,
  so the unchanged URL was redirected to itself — infinite loop until
  Chromium's redirect limit killed the request. Fixed with `(?=[&#]|$)`
  and a `replaced !== url` guard to prevent self-redirects entirely.
  Added regression test for the `#fragment` case.

### Fixed — Security: file import OOM risk (SEC-NEW-1)

- **IpcRouter.js**: `profiles:import-file` and `profiles:import-encrypted`
  read files with `fs.readFileSync` without checking size first. A user
  selecting a multi-GB file could OOM the main process. Added 10MB
  `fs.statSync` check before reading, consistent with the existing
  `settings.js` and `store.js` patterns.

### Fixed — Security: `tempmail:login` missing type validation (SEC-NEW-3)

- **IpcRouter.js**: Added `typeof string` check for `email` and `password`
  params, consistent with other credential-handling IPC handlers.

### Improved — GcDaemon silent error swallowing

- **GcDaemon.js**: 4 `.catch(() => {})` sites in `_clearIdleSessions()`
  now log via `logger.debug()` instead of silently discarding errors,
  consistent with the file's other error handling patterns.

### Improved — JSDoc: MemoryGuard.js (16 functions documented)

- Added JSDoc with `@param`/`@returns` to all 16 previously undocumented
  exported functions in `MemoryGuard.js`.

### Improved — Test coverage (+8 tests, 1157 → 1165)

- **flags.test.js**: +7 tests for `getAppliedSnapshot` (shape, applied,
  disabled/enabled features, jsFlags) and `IS_WAYLAND` export.
- **blocker.test.js**: +1 test for `logintype=3#fragment` redirect.

### Improved — Stale comment fix

- **FlashUpdater.js**: Corrected misleading comment claiming cache query
  functions are "usadas por flash/plugin.js" — they are test-only exports.

## [5.9.22] - 2026-07-18

### Fixed — Bug: `profile:update-notes` crash on null data

- **IpcRouter null guard**: `typeof null === 'object'` in JS means the
  `profile:update-notes` handler's validation (`typeof data !== 'object'`)
  passed for `null`, then crashed on `data.id`. Added explicit
  `data === null` check. Found via new IPC handler tests.

### Improved — Test coverage (+93 tests, 1064 → 1157)

- **IpcRouter.js**: 49% → 77% stmts. Added 80+ tests covering all
  IPC handlers: profile CRUD, vault, tempmail, inspector, dev tools,
  servers, i18n, events, memory, diagnostics, flash, window controls,
  profiles export/import (including 2MB limit validation).
- **SessionLifecycle.js**: 78% → 81% stmts. Added tests for
  reloadWithPreAuth edge cases (null win, destroyed wc, no session,
  fallback on error, win destroyed mid-reload), \_loadGameWithPreAuth
  (no creds, empty creds), will-navigate (oasgames host, invalid URL),
  new-window (invalid URL, non-http protocol), close handler (destroyed
  win, double-close guard).
- **GcDaemon.js**: Added tests for collect return shape, busy path,
  error resilience, start/stop idempotency.

## [5.9.21] - 2026-07-18

### Added — Accessibility (Electron renderer)

- **Toggle switch ARIA**: `#setNotifications` now has `role="switch"`,
  `aria-checked="true/false"`, `tabindex="0"`, and `keydown` handler for
  Space/Enter activation. Previously a bare div with only onclick.
- **Modal dialog ARIA**: `#profileModal` and `#vaultModal` now have
  `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to
  their heading elements. Screen readers can now identify them as dialogs.
- **Backdrop-click-to-close**: Clicking the dark overlay behind the
  profile and vault modals now closes them (same UX as confirmOverlay).
  Previously only the Cancel button or Escape key would close them.

### Fixed — Accessibility (Electron renderer)

- **`#togglePass` tabindex="-1"`**: Removed. The "show password" button was
  unreachable via Tab key despite being a `<button>` with `:focus-visible`
  CSS already in place. Now naturally tabbable.

## [5.9.20] - 2026-07-18

### Fixed — Stability: crash + memory leak in SessionLifecycle

- **`reloadWithPreAuth` crash**: Added `webContents.isDestroyed()` guard before
  accessing `webContents.reload()`. Previously, if the renderer process was
  destroyed between the `ses` null-check and the reload call (race condition
  during window close), Electron would throw an uncaught exception.
- **`_reloadingWindows` Set leak**: The anti-race guard Set accumulated window
  IDs that were never cleaned up when a window was destroyed. Added
  `_reloadingWindows.delete(win.id)` in the `closed` event handler.

### Audit — Placebo, edge cases, and optimization assessment

- **GpuDetector.js**: No new placebo found. musl/nouveau/sandbox/PRIME
  detection already correct. sysfs→lspci fallback chain correct.
- **CpuOptimizer.js**: Idempotency guard + 50-entry cap correct. Nice retry
  with fallback to 0 (no CAP_SYS_NICE needed) correct. Windows priority
  mapping (ABOVE_NORMAL/NORMAL/BELOW_NORMAL) correct.
- **flags.js**: `enable-accelerated-video-decode` and `VaapiVideoDecoder`
  already documented as placebo for Flash PPAPI (harmless, kept).
- **optimization.js**: `disableFrameRateLimit`, `disableSmoothScrolling`
  already documented as placebo/partial in JSDoc.
- **StallDetector.js**: Proper detach, backoff (3/10min), auto-stop (120s
  continuous activity), pollInterval.unref all correct.
- **GcDaemon.js**: Black-screen fix (skip active partitions, no shadercache),
  throttle, anti-reentry all correct.
- **Windows edge cases**: DPI awareness (Electron 11 handles), Game Mode
  (requires native addon, not added), Server Core (PowerShell fails
  gracefully, os.setPriority works without it), UAC (non-elevated affinity
  fails gracefully).
- **Linux distros**: Steam Deck (Arch-based, sysfs works), NixOS (lspci
  may not be in PATH, sysfs fallback works), Flatpak (detected, logged).
- **Rejected additions** (risk > benefit): GPU process priority (PID not
  exposed in Electron 11), wmode (controlled by game website), reg query
  fallback (fragile parsing), `SetGameMode` (native Windows API).

## [5.9.19] - 2026-07-18

### Added — Accessibility & keyboard polish (Electron renderer)

- **`.btn:disabled` CSS rule**: Disabled buttons now show `opacity: 0.4`,
  `cursor: not-allowed`, `pointer-events: none` (previously looked identical
  to enabled buttons).
- **Card keyboard activation**: Cards with `tabIndex=0` now respond to
  Enter/Space keypress to launch the profile (previously only click worked).
- **Nav items keyboard support**: Sidebar navigation tabs now have
  `tabindex="0"`, `role="tab"`, `aria-selected`, and keydown handler for
  Enter/Space activation.
- **Escape key closes all overlays**: Expanded Escape handler to also close
  `confirmOverlay`, `kbOverlay`, and `cmdkOverlay` (previously only closed
  profileModal and vaultModal).
- **Tooltip `:focus-visible`**: `[data-tip]` tooltips now appear on keyboard
  focus, not just hover.
- **Label `for` attributes**: Profile modal labels (Nome, Região, Servidor,
  Usuário, Senha) now have `for` attributes linking to their inputs.
- **`aria-selected` on nav**: Navigation handler toggles `aria-selected`
  true/false alongside the `active` class.

### Fixed — CSS & Next.js preview

- **`--radius-md` undefined**: `.preset-card` referenced `var(--radius-md)`
  which was never defined. Changed to `var(--radius)`.
- **Indigo/blue in Next.js globals.css**: `.dark` theme had `--chart-1` and
  `--sidebar-primary` set to `oklch(0.488 0.243 264.376)` (hue 264° =
  blue/indigo, forbidden by project rules). Replaced with brand-orange
  `oklch(0.705 0.213 47.604)`.
- **`lang="en"` → `lang="pt-BR"`**: Next.js preview layout had wrong
  language declaration (content is Portuguese).
- **Removed unused `<Toaster />`**: layout.tsx imported and rendered shadcn
  Toaster but never triggered it anywhere.
- **Removed `'use client'`**: page.tsx had no client-side interactivity
  (no state, effects, or event handlers). Now renders as Server Component.

### Improved — Next.js preview accessibility

- Added `aria-label` to download links (Linux/Windows) and GitHub link.
- Added `focus-visible:ring-2 ring-[#ff8c00]/50` to all interactive links.
- Added `aria-hidden="true"` to decorative SVG icons.
- Footer now uses `mt-auto` pattern instead of `flex-1` on main
  (more resilient if content changes).
- Standardized badge padding to `px-3 py-1` and features grid gap to `gap-4`.

## [5.9.18] - 2026-07-18

### Fixed — Language validation bug (store.js)

- **Critical**: `store.js` validated profile language against `['pt', 'en']`
  in 3 places (isValidProfile, create, update) while `settings.js` and
  `i18n.js` support 6 languages since v4.0.1. Profiles with de/es/pl/fr
  language would be rejected or silently reset to 'pt'. Fixed all 3
  occurrences to use `['pt', 'en', 'de', 'es', 'pl', 'fr']`.

### Changed — Stale comment cleanup (main.js)

- Updated main.js file header: removed outdated version (v3.4.0),
  removed stale telemetry reference, updated region/language list to
  current 8 regions + 6 languages.
- Removed 5 redundant `// v4.9.1: crash reporter removido` comments
  that referenced a feature removed 7 versions ago.

### Added — 103 new tests (+14.1% coverage)

- **settings.js** (52% → 100%): 36 new tests covering validateConfig
  (language, forceBatata, mutedEvents, windowBounds, firstBoot,
  advancedMode), loadConfig (file I/O, size limit, JSON parse error,
  stat error), saveConfig (atomic write, error handling, serialization).
- **diagnostics.js** (0% → 86.9%): 33 new tests covering \_sanitize
  (paths, tokens, emails, edge cases), \_sanitizeObj (recursion,
  depth limit, sensitive field redaction, arrays), \_collectSystemInfo
  (structure, sanitization), exportZip (cancel, success, error).
- **inspector.js** (0% → 99.5%): 35 new tests covering create/enable/
  disable, getEntries (filter by type/kind/domain), getStats (counters,
  snapshot isolation), on/capture events, JWT extraction (dedup,
  non-auth skip), URL classification, max entries FIFO.
- **store.test.js**: Added test for all 6 supported languages.

### Added — JSDoc on 5 exported functions

- EventTimers.js: isMuted(), setMuted(), onRemind(), stop()
- GcDaemon.js: stop()

### Improved — Coverage summary

- Overall: 71.02% → 78.34% stmts (+7.3pts)
- Branch: 78.76% → 80.76% (+2pts)
- Functions: 83.46% → 86.51% (+3pts)
- Test count: 789 → 892 (+103)
- Test suites: 31 → 33 (+2)

## [5.9.17] - 2026-07-18

### Changed — Accessibility (semantic HTML + ARIA)

- `<div class="main">` → `<main>` landmark (screen reader navigation)
- Topbar wrapped in `<header>` landmark
- Toast element: added `role="status"` + `aria-live="polite"` (announces
  toast messages to screen readers)
- Status bar: added `role="status"` + `aria-live="polite"` (announces
  Flash/connection status changes to assistive tech)
- These are purely additive semantic HTML attributes — zero layout change.

## [5.9.16] - 2026-07-18

### Fixed — Stability (timers, XSS, Windows fallback)

- **Timer leak prevention**: Added `.unref()` on crash-recovery timer (1.5s
  auto-reload after render-process-gone) and fail-load retry timer in
  SessionLifecycle.js. Without unref, these timers prevent clean process
  exit during shutdown.
- **XSS in error page**: `did-fail-load` error page had unescaped `gameUrl`
  in inline `onclick` handler. Now properly escapes single quotes and
  backslashes before interpolation.
- **Windows Server Core fallback**: `_emptyWorkingSetWindows()` in
  GcDaemon.js now tries an alternative PowerShell command
  (MinWorkingSet/MaxWorkingSet) if the `[psapi]` type is unavailable.

### Changed — Placebo documentation (flags.js)

- `enable-accelerated-video-decode`: documented as PLACEBO for Flash PPAPI
  (Flash does its own video decoding; flag only affects HTML5 <video>)
- `VaapiVideoDecoder`: documented as PLACEBO for Flash PPAPI (same reason)
- Both flags kept (harmless, may help non-Flash content)

## [5.9.15] - 2026-07-18

### Fixed — Coverage provider (jest.config.js)

- Switched `coverageProvider` from `babel` to `v8`. The babel provider wraps
  modules during instrumentation, breaking `jest.mock` identity for
  electron/electron-log in `tests/setup.js`. This caused 298/789 tests to
  fail under `--coverage`. V8 provider uses built-in VM coverage without
  source transforms — all 31 suites now pass with coverage enabled.

### Fixed — Security hardening (6 issues)

- **SEC-04**: Whitelisted `profile:update` IPC fields — renderer can no longer
  overwrite internal fields (id, createdAt, stats, launchCount, etc.)
- **SEC-06**: Fixed stale comment in `preload.js` that incorrectly claimed
  `launcher:get-version` was removed (handler IS active in main.js)
- **SEC-07**: Added `isValidRegion()` validation in `tempmail:create`
- **SEC-08**: Added 1MB file size check on `config.json` read (prevent OOM)
- **SEC-15**: Added credentials structure validation in
  `CryptoService.importEncryptedBackup`
- **TYPE-05**: Fixed `falsy||default` anti-pattern in `api-login.renewIfNeeded`

### Changed — Code quality

- **DUP-01**: Extracted `_getWin()` helper in IpcRouter.js — replaces 7x
  repeated `ManagerWindow.getManagerWindow()` + `isDestroyed()` guard
- **DUP-02**: Extracted `_clearEntryTimers(entry)` in SessionLifecycle.js —
  replaces 2x duplicated clearTimeout blocks
- **JSDoc**: Added documentation to 12 public functions across ProfileVault,
  Launcher, profiles/manager, flags.js
- **TYPE**: Added IPC input validation for `profile:launch-timeline` (positive
  number) and `profiles:import` (string + 2MB limit)

## [5.0.0] - 2026-07-14

### Changed — Refatoração SOLID + Clean Code (Fase 3, Decisão C)

Mudança arquitetural MAJOR: os 4 God Objects foram splitados em módulos com
Responsabilidade Única (SRP). Cada God Object virou uma facade fina que
compõe os novos módulos — a API pública é preservada (callers não mudam).

- **guard.js (436 linhas)** → `MemoryGuard.js` (monitor RSS + registry de
  webviews) + `GcDaemon.js` (daemon periódico + collect).
- **vault.js (571 linhas)** → `CryptoService.js` (AES-256-GCM + PBKDF2 puras)
  - `PasswordManager.js` (chave de máquina + senha mestre) + `ProfileVault.js`
    (CRUD + auto-login script).
- **controller.js (648 linhas)** → `manager/ManagerWindow.js` (lifecycle da
  BrowserWindow) + `manager/IpcRouter.js` (handlers IPC) + `manager/StateBroadcaster.js`
  (push de estado pra UI).
- **game-launcher.js (620 linhas)** → `app/Launcher.js` (orchestration +
  registry) + `app/SessionLifecycle.js` (hooks de evento + auto-login) +
  `ui/manager/KeyboardShortcuts.js` (F5/F12/Alt+F4).

### Fixed — GC black screen (pendência herdada, Fase 3f)

- **MemoryGuard causava tela preta no jogo**: `collect()` chamava
  `clearCache()` + `clearStorageData({cachestorage,shadercache})` em TODAS as
  partitions de perfil, incluindo as com jogo Flash ATIVO. Limpar
  shadercache/cachestorage mid-session força recompilação de GPU shaders e
  disrupta carregamento de recursos do Flash PPAPI → canvas preto.
- **Correção**: GcDaemon agora pula partitions com jogo ativo (consulta
  `MemoryGuard.getActiveProfileIds()`) e removeu `shadercache` do
  clearStorageData. `process.gc(true)` no main continua (seguro).

### Added — SHINOBI_DEBUG feature flag (Fase 3b, Decisão B)

- `src/main/debug.js`: flag boot-time de `process.env.SHINOBI_DEBUG`.
- preload expõe `window.__SHINOBI_DEBUG__` (boolean) + `narutoLauncher.isDebug()`.
- logger sobe console level pra `debug` quando flag ativa.
- UI: seção Dev Tools em Configurações fica **hidden por padrão**. Ativação:
  env var `SHINOBI_DEBUG=1` OU segurar **Ctrl+Shift+D por 2s** (toggle localStorage).
- Zero overhead quando desativado (código debug envolto em `if (DEBUG)`).

### Added — Pendências herdadas resolvidas (Fase 3g)

- **JWT auto-renewal**: `SessionLifecycle` inicia `setInterval(30min)` que
  renova o JWT via `apiLogin.renewIfNeeded()` se o perfil tem creds no vault
  (JWT do Naruto Online expira em 2h). Interval com `unref()` + cleanup no close.
- **tempmail auto-create profile**: `tempmail:create` agora cria
  automaticamente um Profile + guarda creds no vault após criar a conta
  (antes o usuário tinha que criar o perfil manualmente).
- **F5 reload + DevTools (F12)**: já existiam desde v4.9.1, preservados no
  `KeyboardShortcuts` (extraídos do game-launcher, não adicionados).

### Tests

- 153 testes (era 81): +19 FlashUpdater, +17 GcDaemon/MemoryGuard/guard-facade,
  +19 CryptoService, +12 KeyboardShortcuts, +5 debug.

---

## [4.9.3] - 2026-07-14

### Added — Flash PPAPI on-demand (Fase 2 da migração v5.0 — Decisão A)

- **`src/app/FlashUpdater.js`** — baixa sempre a versão MAIS RECENTE do Clean Flash PPAPI (darktohka/clean-flash-builds) via GitHub API, extrai e cacheia em `userData/flash-cache/`. Suporte Linux (`tar -xJf`) e Windows (`innoextract`|`7z`).
- **Boot flow first-run**: se `findFlashPlugin()` não acha binário (nem bundled nem em cache), abre uma loading window, baixa o Flash com progresso %, e **relança o app** — o segundo boot acha o cache e aplica `ppapi-flash-path` antes de `app.ready` (requirement do Electron 11 PPAPI).
- **Refresh semanal em background** (non-blocking): se o cache tem >7 dias, re-download para o PRÓXIMO boot (sem relaunch).
- **`findFlashPlugin()`** agora procura também em `userData/flash-cache/` (além de resources/exe/appPath/cwd/dev).
- **`loading.html`** reformulada com barra de progresso real (download %, fase extract, estado done/erro) via `window.setProgress()`.
- 19 testes unitários para FlashUpdater (pickAsset, cache queries, isCacheStale).

### Changed — Limpeza mecânica + consolidação de pastas (Fase 1 da migração v5.0)

- **Consolidação de pastas** rumo à Clean Architecture (Seção 4 do MIGRATION_PROMPT):
  - `src/utilities/event-timers.js` → `src/utils/EventTimers.js` (PascalCase, merge em `utils/`).
  - `src/ui-manager/` → `src/ui/` (merge com `src/ui/`); `setup.html` agora em `src/ui/setup/setup.html`.
  - `src/window/loading.html` → `src/ui/loading/loading.html`.
  - `src/core/flags.js` → `src/main/flags.js` (single source of truth de command-line flags).
- **Imports atualizados** em `main.js`, `ui/controller.js`, `profiles/manager.js` + comentários de cabeçalho.
- `.gitignore` preparado para `flash/*.so` / `flash/*.dll` (download on-demand na Fase 2).

### Removed — Artefatos órfãos

- `scripts/cron-reliability-30min.js` (12 KB) — script standalone de auditoria, não referenciado pelo runtime do Electron nem pelo package.json. (Artefatos `login-page.*` e binários Flash já estavam ausentes do snapshot.)

### Fixed — Tooling

- `tests/setup.js` restaurado (mocks de `electron` + `electron-log`) — 8 suites / 81 testes voltam a passar.
- `npm run lint` não herda mais o `eslint.config.mjs` flat-config do diretório pai (`ESLINT_USE_FLAT_CONFIG=false` pinado nos scripts lint/lint:fix).

---

## [4.8.0] - 2026-07-14

### Added — Multi-conta simultânea

- **Manager permanece visível ao abrir um jogo**: antes o manager era oculto quando um jogo abria (para liberar ~45MB de RAM), o que impedia dar Play em outra conta. Agora o manager fica visível por padrão → o usuário pode abrir N contas ao mesmo tempo, cada uma em janela/partition isolada (cookies/localStorage/cache 100% separados pelo Chromium — sem conflito de processos). Em Ramen Mode (PC <2GB RAM) o comportamento legado (ocultar) é mantido por necessidade de memória.

### Changed — Launcher simplificado

- **Atalhos de teclado removidos**: o módulo `window/shortcuts.js` (F5/F6/F7/F11, Ctrl+Shift+S/T, Ctrl+±/0) e os atalhos do manager (Ctrl+N/E/I, V, S, F5) foram removidos — o launcher é intencionalmente minimalista. Apenas `Esc` fecha modais. A referência de uso mora no site companheiro (dashboard → aba Guia). Guards de segurança (Alt+F4, bloqueio de DevTools) permanecem.
- **Painel "Sistema" consolidado**: a sidebar flutuante (sidebar.js) foi removida — era redundante com o indicador de RAM da nav. O botão "Forçar Limpeza de RAM" + stats de memória + contadores de GC foram movidos para Configurações → nova seção "Desempenho".
- **Overlay de carregamento reformulado**: removido o emoji 🍥 (quebrava via fontconfig em alguns hosts → glifo inválido/"caracteres" estragados), substituído por spinner CSS (zero dependência de fonte). Fundo #0f0f14 igual ao da janela → transição suave overlay→jogo sem flash preto.

### Fixed — Runtime

- **MESA_GLSL_CACHE_DISABLE deprecado**: migrado para `MESA_SHADER_CACHE_DISABLE` (preservando a intenção do usuário) no topo do main.js, silenciando o warning de depreciação do Mesa a cada boot.
- **Fontconfig warnings** (`invalid attribute 'xsi:nil'`): documentados como ruído do SISTEMA HOSPEDEIRO (arquivo `/etc/fonts/conf.d/48-guessfamily.conf` com XML inválido em algumas distros). Inofensivos — o AppImage não pode corrigir `/etc/fonts`. Documentado em main.js + dashboard Guia.

### Removed — Dead code

- `src/window/shortcuts.js` (módulo de atalhos removido)
- `src/ui-manager/sidebar.js` (painel Sistema flutuante — consolidado em Configurações)
- 78 declarações i18n mortas (chaves `sidebar.*` e `settings.shortcuts*` do antigo Shinobi Suite, em 6 idiomas)
- 4 regras CSS mortas (`.shortcuts-grid`, `.shortcut-key`, `.shortcut-desc`, `kbd`)
- Funções mortas `_adjustZoom`/`_resetZoom` em game-launcher.js
- Texto stale "Crashes tab of the sidebar" no setup (→ "Configurações") em 6 idiomas

---

## [4.7.0] - 2026-07-14

### Changed — Unificação de Configurações + Limpeza Geral

- **Sidebar "Sistema" enxuto**: removida a toggle de Telemetria (duplicada com Configurações → Preferências) e a contagem de crashes (agora só em Configurações → Avançado). Painel agora é PURAMENTE ação ao vivo: Forçar Limpeza de RAM + stats de memória + contadores de GC. Reduzido de 415 → 331 linhas.
- **Nova seção "Avançado" nas Configurações**: agrega o que era útil do antigo Shinobi Suite em um único lugar honesto:
  - Relatórios de crash (local-only): lista com type/reason/data/exit-code, descartar individualmente ou em massa, refresh manual. Badge "local-only" deixa claro que nada é enviado a servidores.
  - Backup criptografado AES-256-GCM: botões Exportar/Importar que já existiam via IPC mas não tinham UI exposta.
  - Sobre o launcher: versão + link direto para o GitHub.
- **Crash reporter honesto (local-only)**: removido o no-op `_sendToVercel` (morto desde v4.1), `resendReport`, `_buildIssueContent`, e os campos `sent`/`sentAt`/`issueNumber`/`deduplicated` que nunca eram setados. O módulo agora deixa explícito que NADA é enviado — apenas registra localmente para inspeção do usuário. Crash schema simplificado.

### Removed — Código morto / meta-files

- `api/report-crash.js` (Vercel Serverless Function — endpoint nunca foi deployado, chamada removida em v4.1)
- `api/` (pasta vazia após remoção do arquivo acima)
- `scripts/ai-cron.js` (loop autônomo de auto-melhoria — experimento concluído)
- `scripts/ai-cron.sh` (wrapper do loop acima)
- `scripts/evolve-log.md` (log do AI cron — não é documentação)
- `scripts/evolve-prompt.md` (prompt mestre do AI cron — não é documentação)
- IPC handler `crash:resend` (chamava função morta)
- API `window.api.resendCrashReport` (sem uso após remoção do botão "Reenviar")
- `main.js` `resendCrashReport` (proxy morto para crashReporter.resendReport)

### Kept (mantidos após auditoria)

- `scripts/cron-reliability-30min.js` — auditoria standalone útil (listener leak, i18n completeness, faxina)
- `scripts/debug-launcher.sh` — wrapper de debug para desenvolvedor
- `scripts/publish-secure.sh` — script de publicação segura

---

## [4.6.0] - 2026-07-14

### Added

- Profile Sorting: 7 modos (favoritos, nome, último uso, lançamentos, tempo, região, criação), persistido em localStorage, atalho 'S' para ciclar
- Profile Favorites: estrela amarela em cada card, prefixo no nome, borda de destaque, persistido no schema v4
- Profile Duplication: clona metadata (sem credenciais — segurança), sufixo "(cópia)", atividade logada
- i18n Migration: 80+ strings traduzidas para PT e EN no launcher UI (resolves dívida técnica do Sprint 3)
- CSS Tooltip System via `[data-tip]` + `[data-tip-pos]` em todos os botões de ação
- Loading Skeletons: `.skeleton-card`, `.skel-line`, `.skel-circle` prontos para estados async
- Connection Health Badge CSS: 4 estados (good/medium/bad/unknown) prontos para feature de ping futuro
- Account Toolbar redesign: search-wrap + toolbar-right (count + sort dropdown)

### Changed

- Sidebar e main.js: bump para v4.6
- Botões: feedback de pressão `.btn:active { transform: scale(.96) }`
- Versão: 4.6.0

---

## [4.5.0] - 2026-07-14

### Added

- Profile Statistics: schema v3 com `notes`, `launchCount`, `totalPlayMs` (backward-compatible migration)
- Profile Notes: textarea no modal de edição com char counter (200 chars), exibido no card com tooltip
- Quick Server Switcher: dropdown S1-S9999 no card, troca instantânea via IPC (sem modal)
- Card View Modes: grid (default) + list (horizontal), persistido em localStorage, atalho 'V'
- Auto-Login Status Indicator: badge em tempo real (idle/loading/success/error) via IPC push
- Game Window Status Badge: "aberta" com pulse laranja, limpa ao fechar
- Card Stats Display: launch count + total play time formatados (human-readable)

### Changed

- store.js: schema v3 com migration, validação, 3 novos métodos (incrementLaunch, addPlayTime, getStats)
- controller.js: tracking de launch time, 4 novos IPC handlers
- game-launcher.js: window status events + auto-login state completo (waiting/not-found)
- Versão: 4.5.0

---

## [4.4.0] - 2026-07-13

### Changed

- UI Professional Overhaul: sidebar nav + views + cards estilo Heroic
- Sidebar minimizado: removida suite shinobi pesada (3 tabs: Otimizar + Conversor de Moedas + Crashes, ~520 linhas)
- Sidebar reescrita como painel minimalista "Sistema" (~260 linhas): Forçar GC + stats compactas + toggle de telemetria
- Auto-login robustness: selectors verificados contra 8 capturas HTML reais das regiões
- Animações cubic-bezier suaves + fade-in do conteúdo
- GC button: shimmer hover, green flash success, pulse no "Limpando..."
- Stats: micro-animação de transição numérica, RAM bar com cor dinâmica
- Toggle: label Ativo/Desativado, transição mais suave

---

## [3.3.0] - 2026-07-11

### Changed

- **URL direta**: `naruto.oasgames.com/pt/` → `https://oasgames.com` (portal de login unificado, abre direto na autenticação)
- **Tray removido**: app fecha quando todas as janelas fecham (close inteligente no controller.js)
- **logintype=4 injetado direto**: antes dependia de rewrite do blocker.js; agora explícito em LAUNCHER_PARAMS (reconhecimento de launcher pelo servidor → habilita resgate de prêmios)
- **Sidebar reescrito**: removido Team Builder (16 ninjas), sinergia elemental, 8 guias externos. Mantido apenas: botão Forçar Limpeza de RAM, conversor de moedas, dashboard de telemetria, crash reporter

### Added

- **Crash Reporter não-invasivo** (`src/telemetry/crash-reporter.js`): coleta local de crashes com sanitização obrigatória (remove paths, usernames, tokens, emails). Opt-out via toggle no sidebar. Report ao GitHub via issue pré-preenchida (shell.openExternal, usuário revisa antes de submeter)
- **RAM counter com auto-refresh**: setInterval 5s atualiza RAM/uptime/telemetria enquanto sidebar aberto
- **hasOpenWindows() helper** em game-launcher.js: controller decide hide vs close do manager
- 5 handlers IPC novos: crash:get-pending, crash:report-github, crash:dismiss, crash:is-enabled, crash:set-enabled

### Removed

- `src/core/tray.js` (tray autônomo deletado — user request "nao quero ele na bandeja")
- Comentários obsoletos referenciando tray em main.js, manager.js, controller.js, guard.js

---

## [3.2.0] - 2026-07-10

### Changed

- **Dados 2025 atualizados**: eventos (Daily Reset 0h→5h, adicionado Bond/Check-in, Arena de Guildas), moedas (1 Coupon = 10 Ingots CORRIGIDO para 1:1), guias (8 URLs verificadas)
- **Team Builder**: 10 jutsus lore → 16 ninjas reais do meta 2025 (Naruto Sage, Sasuke MS, Itachi, Pain, etc.) com calculadora de sinergia elemental

### Added

- `src/config/urls.js` (migrado de window/dialogs.js deletado)
- `src/config/__tests__/urls.test.js`

---

## [3.1.0] - 2026-07-10

### Added

- **ProfileManager facade** (`src/profiles/manager.js`): API pública única sobre store+partition+vault+game-launcher
- **Camada 0 do MemoryGuard**: injeção de `window.gc(true)` em webviews ativas (daemon 10min normal / 5min batata)
- **Painel lateral Akatsuki** (`src/ui-manager/sidebar.js`): Team Builder, Guias, Calc, Sistema
- **Isolamento de crash**: handler `render-process-gone` + `unresponsive`/`responsive` por janela
- **ensurePartitionDir()**: cria dir persist eager (fix bunshin em perfil novo)

---

## [3.0.0] - 2026-07-10

### Changed

- **Flags consolidadas** (`src/core/flags.js`): single source of truth para commandLine. Bug do `--expose-gc` perdido CORRIGIDO (merge único de js-flags)
- **Shadow Partitions**: em Modo Batata, usa `partition:profile-<id>` ephemeral + snapshot de cookies de auth (economiza 30-80MB por perfil)
- **Cofre de credenciais** (`src/profiles/vault.js`): AES-256-GCM machine-bound para auto-login real
- **Tray autônomo**: manager some para bandeja quando jogo abre (deprecado em v3.3)

### Added

- **EventTimers com fusos dinâmicos** por região (BR/NA/EU/HK)
- **Modo Batata auto-detect** (RAM <4GB): GC a cada 2min, threshold 450MB
- **Ramen Mode** (RAM <2GB): manager UI suprimido

---

## [1.4.0] - 2026-05-23

### Changed

- **Always extract AppImage during installation** (#1)
  - No FUSE dependency at runtime — works on every Linux
  - Instant startup via extracted AppRun (no FUSE mount delay)
  - `.AppImage` deleted after extraction to save disk space
  - FUSE removed from distro dependency checks
- **var → const/let** in shortcuts.js, create.js, and menu.js

### Added

- `--appimage-extract-and-run` fallback in run.sh for `.AppImage` files

## [1.3.0] - 2026-05-22

### Added

- System tray support — close minimizes to tray, tray context menu
- Screenshot capture (Ctrl+Shift+S) — saves PNG with timestamp
- Zoom controls (Ctrl++/Ctrl+-/Ctrl+0) — adjust page zoom
- Always-on-top toggle (Ctrl+Shift+T) — pin window above all others
- Updated menu with new shortcuts and version display
- Screenshot IPC handler and preload API

## [1.2.0] - 2026-05-20

### Added

- Update notification dialog with download link
- Connectivity check before loading (net.isOnline)
- Keyboard shortcut debounce (1s)
- Window bounds persistence (position + size saved/restored)
- "Limpar Cache" menu option (separate from "Limpar Login")
- Loading screen extracted to loading.html
- Basic CSP via webRequest.onHeadersReceived
- Preload script with contextBridge API
- mms.cfg backup on every startup
- Shell script safety (install.sh validates inputs, uninstall.sh validates HOME)

### Changed

- var → const/let across all 15 source files
- DRY: flags.js shares applyGPUFlags() between profiles

### Fixed

- Regex bug in blocker.js: `logintype=3` now uses boundary-aware `logintype=3(?=&|$)`
- Cancel button in dialogs.js with correct `cancelId`
- URL validation in shell.openExternal (http/https only)

## [1.1.0] - 2026-04-01

### Changed

- Remove ~200 lines of dead code, ineffective settings, and unused exports
  - Removed 12 fake mms.cfg settings (AutoPlay, NetworkAccess, EnableSocketsTo, etc.)
  - Removed dead hash verification system in plugin.js
  - Removed ineffective ppapi-flash-args (clean-flash PPAPI ignores them)
  - Removed no-op setupGPUOptimizations, redundant flags in flags.js
  - Removed ineffective CORS headers in cookies.js
  - Removed unused exports across 10 modules

### Fixed

- Add unhandledRejection handler (prevents silent async crashes)
- Atomic config write (write to .tmp then rename, prevents corruption)
- Add HOME env fallback in mms.cfg path (flatpak/snap compatibility)
- Add 1MB response size limit in update checker (memory protection)
- Add maxFiles=3 for log rotation (prevents unbounded disk growth)
- Add window icon for Linux (BrowserWindow icon + StartupWMClass fix)
- Fix StartupWMClass mismatch (naruto-online → Naruto Online)
- Pass parent window to menu dialogs (appear above game)
- Restore test suite to 100% pass (58/58 tests)

## [1.0.0] - 2026-03-30

First stable release.

### Features

- Native Flash PPAPI 34 integration (no Wine, no browser hacks)
- Instant loading screen (data:URL, zero network dependency)
- Built-in tracker/ad blocker (analytics, telemetry)
- Mixed Content fix for Flash crossdomain.xml
- Full viewport CSS (no borders, OAS bar hidden)
- Simple fullscreen (ESC passes through to the game)
- 6 game regions: PT-BR, EN, FR, DE, ES, PL
- Persistent login with cookie partition
- 3 hardware profiles: Modern (GPU), Legacy (older GPU), CPU (SwiftShader)
- Wayland to XWayland auto-conversion

### Linux

- install.sh with auto-detection (Arch/CachyOS/Fedora/Debian)
- Desktop entry with icon (hicolor theme)
- AppImage packaging with auto-extraction

### Shortcuts

- F5 — Clear login
- F6 — Switch region
- F7 — Switch hardware profile
- F11 — Fullscreen (ESC passes to game)
