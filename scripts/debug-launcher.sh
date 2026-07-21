#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# debug-launcher.sh — Roda o Shinobi Launcher em modo DEBUG ULTRA-VERBOSO
#
# Mostra no terminal ABSOLUTAMENTE TUDO:
#   - Logs do Electron (app events, window events, webContents)
#   - Logs do Chromium (--enable-logging --v=1)
#   - Logs do Flash PPAPI
#   - Logs IPC (todas as mensagens entre main e renderer)
#   - Logs de cliques (qual elemento foi clicado, coordenadas)
#   - Logs de input (qual campo foi preenchido, valor)
#   - Logs de teclas (qual tecla foi pressionada)
#   - Logs de navegação (URL changes, redirects)
#   - Logs de rede (requisições para naruto/oasgames/passport)
#   - Logs de memory (RSS, heap, a cada 10s)
#   - Logs de crash (render-process-gone, GPU crash, etc)
#   - DevTools aberto automaticamente
#
# USO:
#   bash scripts/debug-launcher.sh           # usa AppImage instalada
#   bash scripts/debug-launcher.sh ./app.AppImage  # usa AppImage específica
#
# SAÍDA: tudo vai para stdout + arquivo debug-session.log
# ═══════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Cores ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  🔍 Shinobi Launcher — DEBUG ULTRA-VERBOSO${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Encontrar AppImage ──
APPIMAGE=""

# Se passou argumento, usa ele
if [ -n "${1:-}" ] && [ -f "$1" ]; then
  APPIMAGE="$1"
# Se tem instalado em ~/.local/share/naruto-online/
elif [ -f "$HOME/.local/share/naruto-online/Naruto Online-"*.AppImage ]; then
  APPIMAGE=$(ls "$HOME/.local/share/naruto-online/"*.AppImage 2>/dev/null | head -1)
# Se tem no diretório atual
elif ls ./*.AppImage 2>/dev/null | head -1 > /dev/null; then
  APPIMAGE=$(ls ./*.AppImage 2>/dev/null | head -1)
# Se tem no diretório do script
elif ls "$(dirname "$0")/"*.AppImage 2>/dev/null | head -1 > /dev/null; then
  APPIMAGE=$(ls "$(dirname "$0")/"*.AppImage 2>/dev/null | head -1)
fi

if [ -z "$APPIMAGE" ]; then
  echo -e "${RED}❌ Nenhuma AppImage encontrada!${NC}"
  echo ""
  echo "Procurado em:"
  echo "  \$1 (argumento)"
  echo "  ~/.local/share/naruto-online/*.AppImage"
  echo "  ./*.AppImage"
  echo "  $(dirname "$0")/*.AppImage"
  echo ""
  echo "Use: bash debug-launcher.sh /caminho/para/Naruto Online-4.0.0.AppImage"
  exit 1
fi

echo -e "${GREEN}✅ AppImage: $APPIMAGE${NC}"
echo -e "${GREEN}✅ Tamanho: $(du -h "$APPIMAGE" | cut -f1)${NC}"
echo ""

# ── Variáveis de debug ──
# v4.1: SHINOBI_DEBUG mode removido (suite shinobi desativada — ver worklog Sprint 5)
export LOG_LEVEL=debug           # electron-log nível debug
export ELECTRON_ENABLE_LOGGING=1 # Loga Chromium no stdout
export ELECTRON_DISABLE_SECURITY_WARNINGS=1 # Remove warnings de CSP

# ── Flags de linha de comando do Chromium/Electron ──
CHROMIUM_FLAGS=(
  --enable-logging              # Loga Chromium no console
  --v=1                         # Verbosity level 1 (info+)
  --log-level=0                 # Todos os níveis
  --no-sandbox                  # Necessário para PPAPI no Linux
  --enable-devtools-experiments # DevTools completo
  --disable-background-timer-throttling  # Não throttla logs
  --ppapi-flash-debug          # Debug do Pepper Flash
  --ppapi-flash-log-level=all   # Loga tudo do Flash PPAPI
)

# Se Wayland, força XWayland (Flash precisa de X11)
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
  export XDG_SESSION_TYPE=x11
  export GDK_BACKEND=x11
  echo -e "${YELLOW}⚠️  Wayland detectado — forçando XWayland (Flash precisa de X11)${NC}"
fi

echo -e "${YELLOW}📋 Modo debug ativo. Tudo será logado abaixo.${NC}"
echo -e "${YELLOW}📋 DevTools abrirá automaticamente.${NC}"
echo -e "${YELLOW}📋 Logs salvos em: debug-session.log${NC}"
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Rodar AppImage com todas as flags ──
# Pipe para tee: mostra no terminal E salva no arquivo
chmod +x "$APPIMAGE" 2>/dev/null || true

"$APPIMAGE" \
  --appimage-extract-and-run \
  "${CHROMIUM_FLAGS[@]}" \
  2>&1 | tee debug-session.log

EXIT_CODE=$?

echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  App finalizado (exit code: $EXIT_CODE)${NC}"
echo -e "${CYAN}  Log salvo em: $(pwd)/debug-session.log${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
