# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.9.3] - 2025-03-29

### Fixed — Linux
- **[L-01]** Flags incompatíveis com Chromium 87 no Linux causavam crash
  - Adicionado `use-gl: desktop` no Linux (não `use-angle: gl`)
  - Removido `use-angle` no Linux para evitar crash com Mesa/AMD
  - VaapiVideoDecoder habilitado para aceleração de vídeo
- **[L-02]** install.sh com VERSION="1.2.1" desatualizado

### Changed
- **[OE-07]** onHeadersReceived agora usa filtro de URL
  - Só monitora domínios do jogo (oasgames.com, narutowebgame.com)
  - Interceptador separado para tracking cookies

## [1.9.2] - 2025-03-29

### Changed
- **Simplificação massiva de código** - ~167 linhas removidas
- **Blocker:** DomainTrie → Set + endsWith() (18 domínios não precisam de Trie)
- **Blocker:** LRU cache removido (jogo usa ~40 hostnames únicos)
- **Cookies:** pendingRemovals Map → remoção direta (0-3 tracking cookies/sessão)
- **Cookies:** onHeadersReceived só clona headers se set-cookie existe
- **Flags:** switch → objeto declarativo PROFILE_APPLIERS
- **Plugin:** readdirSync → path.join direto (nome do plugin é conhecido)
- **Main:** PRIORITY_MAP → ternário simples
- **Settings:** configCache mtime removido (loadConfig chamado 1x)

### Removed
- `logger.setLevel()` - API morta (não funcionava)
- `TreeWalker DOM` no create.js - redundante com blocker no nível de rede
- Skip de escrita em mms.cfg - 300 bytes 1x/boot não vale a complexidade

### Tests
- 54 testes passando (removidos testes de DomainTrie e setLevel)

## [1.9.1] - 2025-03-29

### Fixed
- **BUG #9:** requestSingleInstanceLock antes do ready
- **BUG #10:** shortcutsHandler removeAllListeners → cleanup específico
- **BUG #11:** DevTools exposto em produção
- **BUG #12:** Flags incompatíveis com Chromium 87
- **BUG #13:** Tracking cookies não bloqueados nos headers
- **BUG #14:** README-ptbr.md desatualizado
- **BUG #15:** DOM traversal redundante
- **BUG #16:** Lockfiles duplicados

## [1.9.0] - 2025-03-29

### Changed
- **Electron 9.4.4 → 11.5.0** - Última versão com Flash PPAPI
  - Chromium 83 → 87 (+15% performance)
  - Node 12.14 → 12.20
  - Melhor IPC e rendering

### Fixed
- **BUG CRÍTICO #1:** `blockCache` memory leak - agora usa hostname como chave (não URL completa)
- **BUG CRÍTICO #2:** F7 nunca salvava hardware - `saveConfig` não era passado
- **BUG #3:** `debounceTimer` leak no shutdown - adicionado `cleanup()`
- **BUG #4:** `convertingCookies` leak - adicionado `.catch()` antes de `.finally()`
- **BUG #5:** `will-navigate` interceptava assets - agora verifica extensão
- **BUG #6:** `close` event double-close - removido `preventDefault()`
- **BUG #7:** `before-input-event` listener não removido - adicionado cleanup
- **BUG #8:** Dependência circular menu.js ↔ create.js - criado `dialogs.js`

### Added
- `src/window/dialogs.js` - diálogos extraídos para evitar circular dep
- `cleanup()` em cookies.js para shutdown limpo
- `clearCache()` em blocker.js para testes
- Testes para dialogs.js

### Security
- Adicionado `sentry.io` e `track.narutowebgame.com` ao blocker
- Allowlist explícita para domínios do jogo em cookies

## [1.8.0] - 2025-03-29

### Performance
- **Blocker com Trie** - O(k) lookup onde k = partes do domínio (era O(n×m))
- **Blocker com Cache** - Requests repetidas são O(1)
- **Debounce no Cookie Handler** - -80% CPU em page loads
- **Preconnect** - Estabelece conexões TCP+TLS antes de precisar
- **Config Cache** - Evita I/O desnecessário com cache em memória
- **Skip mms.cfg** - Pula escrita se conteúdo não mudou

### Fixed
- **BUG CRÍTICO:** `process.priority` não existe em Node.js - corrigido para `os.setPriority()`

### Changed
- Tests atualizados para novo blocker com Trie
- 47 testes passando (eram 45)

## [1.7.1] - 2025-03-29

### Added
- **Jest tests** - 45 tests for config, network, utils modules
  - `src/config/__tests__/` - regions, hardware, settings tests
  - `src/network/__tests__/` - blocker tests
  - `src/utils/__tests__/` - logger tests
- Scripts: `npm test`, `npm run test:watch`, `npm run test:coverage`

### Changed
- **Extracted `applyHardwareFlags`** to `src/chromium/flags.js`
- `main.js` reduced from 114 to 55 lines
- Added Jest support to ESLint config

## [1.7.0] - 2025-03-29

### Added
- **Modular code architecture** - Code split into organized modules
  - `src/config/` - Configuration management (regions, hardware profiles, settings)
  - `src/flash/` - Flash PPAPI plugin detection and configuration
  - `src/network/` - Network handlers (blocker, cookies)
  - `src/utils/` - Utility functions (logger)
  - `src/window/` - Window management (create, shortcuts, menu)
  - `src/chromium/` - Chromium flags configuration
- **Structured logger** with configurable levels (debug, info, warn, error)
- **Configuration validation** with schema and sanitization
- **ESLint + Prettier** for code quality
- **CHANGELOG.md** for tracking changes

### Changed
- Updated CI to Node 20 LTS (was Node 14 EOL)
- `package.json` now includes all source modules in build

### Security
- Input validation for configuration files
- Proper error handling in all modules

## [1.6.0] - 2025-01-XX

### Security
- **REMOVED** `ignore-certificate-errors` flag (SSL security)
- **REMOVED** `disable-compositor` flag (caused black screen)
- **REMOVED** `disable-frame-rate-limit` flag (CPU/GPU waste)
- Added logging to all empty catch blocks

### Fixed
- Corrected `mms.cfg` path for Flash configuration
- Switched from Vulkan to D3D11/OpenGL for stability

### Changed
- Optimized `BLOCK_LIST` with Set for O(1) lookup
- Expanded `ppapi-flash-args` with 4 additional optimization flags
- Added 500MB disk cache size

### Removed
- `ruffle-experimental` branch (Ruffle doesn't work with Naruto Online)
- Multi-account/abas feature (removed on purpose)
- Autoclicker feature (removed on purpose)

## [1.5.0] - 2024-12-XX

### Added
- Hardware profiles (Modern, Legacy, CPU Only)
- F12 for DevTools
- Multi-region support (6 languages)
- Persistent cookies (1 year)

### Changed
- Single window mode (not multi-account)
- Region selector dialog
- Hardware profile selector dialog

## [1.4.0] - 2024-11-XX

### Added
- F11 for fullscreen
- F7 for hardware profile switch
- Block list for trackers and analytics

### Fixed
- Login persistence across sessions
- Flash plugin detection on both platforms

## [1.3.0] - 2024-10-XX

### Added
- Linux AppImage build
- Windows portable build
- GitHub Actions CI/CD

### Changed
- Unified build workflow
- Automatic Flash download in CI

## [1.0.0] - 2024-09-XX

### Added
- Initial release
- Flash PPAPI support
- Basic game launcher functionality
- Region selection
- Login persistence
