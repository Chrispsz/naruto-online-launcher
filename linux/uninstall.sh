#!/bin/bash
# =============================================================================
# Shinobi Launcher (Naruto Online) — Linux Uninstaller v2.0
#
# Robusto, seguro e transparente:
#   - Pede confirmação antes de remover
#   - Mata processos em execução (evita "arquivo ocupado")
#   - Mostra progresso passo-a-passo
#   - Registra log em ~/.local/share/naruto-online/uninstall.log
#   - Limpa TUDO: app, icons, desktop entry, Electron data, Flash config
#
# USO:
#   bash uninstall.sh              # interativo (pergunta confirmação)
#   bash uninstall.sh --yes        # não pergunta (para automação)
#   bash uninstall.sh --help       # ajuda
# =============================================================================

set -uo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Logging ───────────────────────────────────────────────────────────────────
log_info()  { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step()  { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }

# ── Parse args ────────────────────────────────────────────────────────────────
ASSUME_YES=false
SHOW_HELP=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y|--force) ASSUME_YES=true ;;
    --help|-h)
      echo "Uso: bash uninstall.sh [OPÇÕES]"
      echo ""
      echo "Opções:"
      echo "  --yes, -y    Não pedir confirmação (para automação)"
      echo "  --help, -h   Mostrar esta ajuda"
      echo ""
      echo "Remove completamente o Shinobi Launcher:"
      echo "  - App + binário em ~/.local/share/naruto-online/"
      echo "  - Atalho .desktop (menu + área de trabalho)"
      echo "  - Ícones (hicolor theme)"
      echo "  - Dados do Electron (~/.config/Naruto Online/)"
      echo "  - Config do launcher (~/.config/naruto-online-launcher/)"
      echo "  - Backup do mms.cfg do Flash"
      exit 0
      ;;
  esac
done

# ── Detect real user (works with sudo) ──────────────────────────────────────
if [ -n "${SUDO_USER:-}" ]; then
  REAL_USER="$SUDO_USER"
  REAL_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
  REAL_USER="$USER"
  REAL_HOME="${HOME:-/tmp}"
fi

# Safety: validate REAL_HOME is an absolute path
if [[ "$REAL_HOME" != /* ]]; then
  echo "Erro: HOME inválido detectado ($REAL_HOME). Abortando por segurança." >&2
  exit 1
fi

# ── Paths ─────────────────────────────────────────────────────────────────────
LAUNCHER_NAME="naruto-online"
INSTALL_DIR="$REAL_HOME/.local/share/$LAUNCHER_NAME"
APPS_DIR="$REAL_HOME/.local/share/applications"
ICONS_BASE="$REAL_HOME/.local/share/icons"
BIN_DIR="$REAL_HOME/.local/bin"
DESKTOP_DIR="$REAL_HOME/Desktop"
PIXMAPS_DIR="$REAL_HOME/.local/share/pixmaps"

# Electron userData (cookies, cache, GPUCache, logs, config.json)
ELECTRON_DATA="$REAL_HOME/.config/Naruto Online"
# Launcher config dir
CONFIG_DIR="$REAL_HOME/.config/naruto-online-launcher"
LEGACY_CONFIG_DIR="$REAL_HOME/.config/naruto-online"
# Flash mms.cfg
FLASH_DIR="$REAL_HOME/.macromedia/Flash_Player"

LOG_FILE="$INSTALL_DIR/uninstall.log"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  🗑️  Shinobi Launcher — Uninstaller         ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}\n"

echo "Usuário: $REAL_USER"
echo "Home:    $REAL_HOME"
echo ""

# ── Check if installed ───────────────────────────────────────────────────────
if [ ! -d "$INSTALL_DIR" ] && [ ! -f "$APPS_DIR/$LAUNCHER_NAME.desktop" ]; then
  log_warn "Shinobi Launcher não encontrado neste usuário."
  log_info "Nada a remover. Saindo."
  exit 0
fi

# ── Confirmation ─────────────────────────────────────────────────────────────
if [ "$ASSUME_YES" = "false" ]; then
  echo -e "${YELLOW}Isto irá remover COMPLETAMENTE o Shinobi Launcher:${NC}"
  echo "  • App + binário: $INSTALL_DIR"
  echo "  • Atalho .desktop (menu + área de trabalho)"
  echo "  • Ícones (hicolor theme)"
  echo "  • Dados do Electron: $ELECTRON_DATA"
  echo "  • Config do launcher: $CONFIG_DIR"
  echo "  • Backup do mms.cfg do Flash"
  echo ""
  echo -e "${RED}⚠️  Seus perfis e credenciais salvas serão perdidos.${NC}"
  echo -e "${YELLOW}Faça backup antes se quiser migrar (use o recurso de backup criptografado no launcher).${NC}"
  echo ""
  read -rp "Confirma remoção? [s/N] " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[sS](im)?$ ]]; then
    log_info "Remoção cancelada pelo usuário."
    exit 0
  fi
fi

# ── Inicia log ───────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR" 2>/dev/null || true
{
  echo "=== Shinobi Launcher Uninstall Log ==="
  echo "Date: $(date -Iseconds)"
  echo "User: $REAL_USER"
  echo "Home: $REAL_HOME"
  echo ""
} > "$LOG_FILE"

log_step "1/5 — Parando processos em execução..."

# Mata processos do launcher (evita "arquivo ocupado" na remoção)
PIDS_KILLED=0
for proc_name in "naruto-online" "NarutoOnline" "Naruto Online"; do
  if command -v pkill &>/dev/null; then
    if pkill -f "$proc_name" 2>/dev/null; then
      PIDS_KILLED=$((PIDS_KILLED + 1))
      log_info "Processo terminado: $proc_name"
      echo "[kill] $proc_name" >> "$LOG_FILE"
    fi
  fi
done

if [ "$PIDS_KILLED" -gt 0 ]; then
  sleep 2  # dá tempo do processo liberar arquivos
fi

log_step "2/5 — Removendo atalhos e ícones..."

# Desktop entry (menu de aplicativos)
if [ -f "$APPS_DIR/$LAUNCHER_NAME.desktop" ]; then
  rm -f "$APPS_DIR/$LAUNCHER_NAME.desktop"
  log_info "Removido: .desktop (menu)"
  echo "[rm] $APPS_DIR/$LAUNCHER_NAME.desktop" >> "$LOG_FILE"
fi

# Desktop shortcut (área de trabalho)
if [ -f "$DESKTOP_DIR/$LAUNCHER_NAME.desktop" ]; then
  rm -f "$DESKTOP_DIR/$LAUNCHER_NAME.desktop"
  log_info "Removido: .desktop (área de trabalho)"
  echo "[rm] $DESKTOP_DIR/$LAUNCHER_NAME.desktop" >> "$LOG_FILE"
fi

# Ícones (hicolor theme — todos os tamanhos)
ICONS_REMOVED=0
for size in 16 24 32 48 64 128 256 512 scalable; do
  for icon_path in "$ICONS_BASE/hicolor/${size}x${size}/apps/$LAUNCHER_NAME.png" \
                   "$ICONS_BASE/hicolor/${size}/apps/$LAUNCHER_NAME.png"; do
    if [ -f "$icon_path" ]; then
      rm -f "$icon_path"
      ICONS_REMOVED=$((ICONS_REMOVED + 1))
      echo "[rm] $icon_path" >> "$LOG_FILE"
    fi
  done
done

# Ícone solto (fallback)
if [ -f "$ICONS_BASE/$LAUNCHER_NAME.png" ]; then
  rm -f "$ICONS_BASE/$LAUNCHER_NAME.png"
  ICONS_REMOVED=$((ICONS_REMOVED + 1))
  echo "[rm] $ICONS_BASE/$LAUNCHER_NAME.png" >> "$LOG_FILE"
fi

# Pixmaps (fallback antigo)
if [ -f "$PIXMAPS_DIR/$LAUNCHER_NAME.png" ]; then
  rm -f "$PIXMAPS_DIR/$LAUNCHER_NAME.png"
  ICONS_REMOVED=$((ICONS_REMOVED + 1))
  echo "[rm] $PIXMAPS_DIR/$LAUNCHER_NAME.png" >> "$LOG_FILE"
fi

if [ "$ICONS_REMOVED" -gt 0 ]; then
  log_info "Removidos: $ICONS_REMOVED ícone(s)"
fi

# Atualiza caches de ícone e desktop
command -v gtk-update-icon-cache &>/dev/null && gtk-update-icon-cache -f -t "$ICONS_BASE/hicolor" 2>/dev/null || true
command -v update-desktop-database &>/dev/null && update-desktop-database "$APPS_DIR" 2>/dev/null || true

# Bin symlink (comando terminal)
if [ -L "$BIN_DIR/$LAUNCHER_NAME" ] || [ -f "$BIN_DIR/$LAUNCHER_NAME" ]; then
  rm -f "$BIN_DIR/$LAUNCHER_NAME"
  log_info "Removido: comando 'naruto-online' (terminal)"
  echo "[rm] $BIN_DIR/$LAUNCHER_NAME" >> "$LOG_FILE"
fi

log_step "3/5 — Removendo aplicação..."

# Diretório de instalação (AppImage + run.sh + uninstall.sh + logs)
if [ -d "$INSTALL_DIR" ]; then
  # Preserva o log movendo para /tmp antes de remover o dir
  if [ -f "$LOG_FILE" ]; then
    cp "$LOG_FILE" "/tmp/shinobi-uninstall-$(date +%s).log" 2>/dev/null || true
  fi
  rm -rf "$INSTALL_DIR"
  log_info "Removido: $INSTALL_DIR"
  echo "[rm -rf] $INSTALL_DIR" >> "/tmp/shinobi-uninstall-last.log" 2>/dev/null || true
fi

log_step "4/5 — Removendo dados do Electron..."

# Electron userData (cookies, cache, GPUCache, logs, config.json, profiles)
if [ -d "$ELECTRON_DATA" ]; then
  rm -rf "$ELECTRON_DATA"
  log_info "Removido: $ELECTRON_DATA (perfis, cookies, cache)"
  echo "[rm -rf] $ELECTRON_DATA" >> "/tmp/shinobi-uninstall-last.log" 2>/dev/null || true
fi

# Config dirs do launcher (old e new paths)
if [ -d "$CONFIG_DIR" ]; then
  rm -rf "$CONFIG_DIR"
  log_info "Removido: $CONFIG_DIR"
  echo "[rm -rf] $CONFIG_DIR" >> "/tmp/shinobi-uninstall-last.log" 2>/dev/null || true
fi

if [ -d "$LEGACY_CONFIG_DIR" ] && [ "$LEGACY_CONFIG_DIR" != "$CONFIG_DIR" ]; then
  rm -rf "$LEGACY_CONFIG_DIR"
  log_info "Removido: $LEGACY_CONFIG_DIR (legacy)"
  echo "[rm -rf] $LEGACY_CONFIG_DIR" >> "/tmp/shinobi-uninstall-last.log" 2>/dev/null || true
fi

log_step "5/5 — Limpando Flash config..."

# Backup do mms.cfg (criado pelo launcher a cada boot)
if [ -f "$FLASH_DIR/mms.cfg.bak" ]; then
  rm -f "$FLASH_DIR/mms.cfg.bak"
  log_info "Removido: mms.cfg.bak (backup do Flash)"
  echo "[rm] $FLASH_DIR/mms.cfg.bak" >> "/tmp/shinobi-uninstall-last.log" 2>/dev/null || true
fi

# ── Resumo final ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  ✅  Shinobi Launcher removido!            ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo "Removido:"
echo "  • App + binário"
echo "  • Atalhos (menu + desktop)"
echo "  • Ícones"
echo "  • Dados do Electron (perfis, cookies, cache)"
echo "  • Config do launcher"
echo "  • Backup do Flash mms.cfg"
echo ""
echo -e "${YELLOW}Log de remoção salvo em: /tmp/shinobi-uninstall-*.log${NC}"
echo ""
