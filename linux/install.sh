#!/bin/bash
# =============================================================================
# Naruto Online Launcher — Linux Installer
# Compatible with: Arch Linux, Ubuntu, Fedora, Debian, openSUSE, Pop!_OS
# Requires: AppImage file in the same directory
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Logging ───────────────────────────────────────────────────────────────────
log_info()  { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step()  { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER_NAME="naruto-online"
INSTALL_DIR="$HOME/.local/share/$LAUNCHER_NAME"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICONS_BASE="$HOME/.local/share/icons"
CONFIG_DIR="$HOME/.config/$LAUNCHER_NAME-launcher"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   🍥 Naruto Online Launcher — Installer    ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}\n"

# ── Check if running interactively ───────────────────────────────────────────
if [ ! -t 0 ]; then
  log_error "Este instalador precisa ser executado interativamente."
  log_error "Execute: bash $0"
  exit 1
fi

# ── Detect real user (works with sudo) ──────────────────────────────────────
if [ -n "${SUDO_USER:-}" ]; then
  REAL_USER="$SUDO_USER"
  REAL_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
  log_warn "Detectado sudo — instalando para o usuário: $REAL_USER"
  INSTALL_DIR="$REAL_HOME/.local/share/$LAUNCHER_NAME"
  BIN_DIR="$REAL_HOME/.local/bin"
  APPS_DIR="$REAL_HOME/.local/share/applications"
  ICONS_BASE="$REAL_HOME/.local/share/icons"
  CONFIG_DIR="$REAL_HOME/.config/$LAUNCHER_NAME-launcher"
else
  REAL_USER="$USER"
  REAL_HOME="$HOME"
fi

# =============================================================================
# Step 1: Find AppImage
# =============================================================================
log_step "1/7 — Localizando AppImage..."

APPIMAGE=""
for f in "$SCRIPT_DIR"/*.AppImage; do
  [ -f "$f" ] && APPIMAGE="$f" && break
done

if [ -z "$APPIMAGE" ]; then
  log_error "Nenhum arquivo .AppImage encontrado em:"
  log_error "  $SCRIPT_DIR/"
  echo ""
  log_error "Baixe o AppImage em:"
  echo -e "  ${CYAN}https://github.com/Chrispsz/naruto-online-launcher/releases${NC}"
  echo ""
  log_error "E coloque na mesma pasta que este script."
  exit 1
fi

APPIMAGE_NAME=$(basename "$APPIMAGE")
APPIMAGE_SIZE=$(du -h "$APPIMAGE" | cut -f1)
log_info "AppImage encontrado: $APPIMAGE_NAME ($APPIMAGE_SIZE)"

# =============================================================================
# Step 2: Detect distribution and check dependencies
# =============================================================================
log_step "2/7 — Verificando dependências..."

# Detect distro
DISTRO="unknown"
DISTRO_VERSION=""

if [ -f /etc/os-release ]; then
  DISTRO=$(grep '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"' || echo "unknown")
  DISTRO_VERSION=$(grep '^VERSION_ID=' /etc/os-release | cut -d= -f2 | tr -d '"' || echo "")
fi

log_info "Distribuição detectada: $DISTRO ${DISTRO_VERSION}"

# Check for required commands
check_command() {
  if command -v "$1" &>/dev/null; then
    return 0
  fi
  return 1
}

# Missing dependencies tracker
MISSING_DEPS=()

# ── FUSE status (informational only — no longer required) ──────────────────
FUSE_AVAILABLE=false
if [ -f /dev/fuse ] || check_command fusermount; then
  FUSE_AVAILABLE=true
  log_info "FUSE: disponível (não é mais necessário — AppImage será extraído)"
else
  log_info "FUSE: não encontrado (sem problema — AppImage será extraído)"
fi

# ── Check dependencies by distro ───────────────────────────────────────────
install_deps() {
  local pkg_manager="$1"
  shift
  local packages=("$@")

  echo ""
  log_warn "Dependências faltando: ${packages[*]}"
  echo ""
  read -rp "$(echo -e "${YELLOW}[?] Instalar dependências agora? [s/N]: ${NC}")" INSTALL_DEPS

  if [[ "$INSTALL_DEPS" =~ ^[sSyY]$ ]]; then
    case "$pkg_manager" in
      pacman)
        sudo pacman -S --noconfirm "${packages[@]}"
        ;;
      apt)
        sudo apt-get update && sudo apt-get install -y "${packages[@]}"
        ;;
      dnf)
        sudo dnf install -y "${packages[@]}"
        ;;
      zypper)
        sudo zypper install -y "${packages[@]}"
        ;;
      *)
        log_error "Gerenciador de pacotes não suportado: $pkg_manager"
        log_error "Instale manualmente: ${packages[*]}"
        return 1
        ;;
    esac
  else
    log_error "Dependências obrigatórias. Abortando."
    exit 1
  fi
}

case "$DISTRO" in
  arch*|manjaro*|endeavouros*|garuda*|cachyos*|steamos*)
    PKG_MGR="pacman"
    check_command gtk-launch || MISSING_DEPS+=("gtk3")
    check_command notify-send || MISSING_DEPS+=("libnotify")
    check_command xdg-open || MISSING_DEPS+=("xdg-utils")
    # Optional: gamemode
    if ! check_command gamemoderun; then
      log_info "gamemode: não instalado (opcional, melhora performance)"
    fi
    ;;
  ubuntu*|pop*|linuxmint*|debian*|elementary*)
    PKG_MGR="apt"
    check_command gtk-launch || MISSING_DEPS+=("libgtk-3-0")
    check_command notify-send || MISSING_DEPS+=("libnotify-bin")
    check_command xdg-open || MISSING_DEPS+=("xdg-utils")
    ;;
  fedora*)
    PKG_MGR="dnf"
    check_command gtk-launch || MISSING_DEPS+=("gtk3")
    check_command notify-send || MISSING_DEPS+=("libnotify")
    check_command xdg-open || MISSING_DEPS+=("xdg-utils")
    ;;
  opensuse*|tumbleweed*)
    PKG_MGR="zypper"
    check_command gtk-launch || MISSING_DEPS+=("gtk3")
    check_command notify-send || MISSING_DEPS+=("libnotify-tools")
    check_command xdg-open || MISSING_DEPS+=("xdg-utils")
    ;;
  *)
    log_warn "Distribuição não reconhecida: $DISTRO"
    log_warn "Verificando dependências genéricas..."
    check_command gtk-launch || MISSING_DEPS+=("gtk3")
    check_command notify-send || MISSING_DEPS+=("libnotify")
    check_command xdg-open || MISSING_DEPS+=("xdg-utils")
    PKG_MGR="unknown"
    ;;
esac

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
  if [ "$PKG_MGR" = "unknown" ]; then
    log_error "Dependências faltando (instale manualmente): ${MISSING_DEPS[*]}"
    read -rp "$(echo -e "${YELLOW}[?] Continuar mesmo assim? [s/N]: ${NC}")" CONTINUE
    if [[ ! "$CONTINUE" =~ ^[sSyY]$ ]]; then
      exit 1
    fi
  else
    install_deps "$PKG_MGR" "${MISSING_DEPS[@]}"
  fi
fi

log_info "Todas as dependências estão OK"

# =============================================================================
# Step 3: Check for existing installation
# =============================================================================
log_step "3/7 — Verificando instalação existente..."

if [ -d "$INSTALL_DIR" ]; then
  log_warn "Instalação existente detectada em: $INSTALL_DIR"
  read -rp "$(echo -e "${YELLOW}[?] Substituir instalação anterior? [s/N]: ${NC}")" REPLACE
  if [[ "$REPLACE" =~ ^[sSyY]$ ]]; then
    log_info "Removendo instalação anterior..."
    rm -rf "$INSTALL_DIR"
  else
    log_error "Instalação cancelada pelo usuário."
    exit 0
  fi
fi

# =============================================================================
# Step 4: Install AppImage
# =============================================================================
log_step "4/7 — Instalando aplicativo..."

mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"
mkdir -p "$APPS_DIR"
mkdir -p "$CONFIG_DIR/logs"

# Copy AppImage
log_info "Copiando AppImage..."
cp "$APPIMAGE" "$INSTALL_DIR/$APPIMAGE_NAME"
chmod +x "$INSTALL_DIR/$APPIMAGE_NAME"

# Hide game thumbnail/preview images (dotfiles invisible in file managers)
shopt -s nullglob dotglob 2>/dev/null || true
for img in "$INSTALL_DIR"/*.png "$INSTALL_DIR"/*.jpg "$INSTALL_DIR"/*.jpeg "$INSTALL_DIR"/*.gif "$INSTALL_DIR"/*.webp; do
  [ -f "$img" ] || continue
  bname="$(basename "$img")"
  [ "$bname" = "icon.png" ] && continue
  mv "$img" "$INSTALL_DIR/.$bname" 2>/dev/null || true
done
shopt -u nullglob dotglob 2>/dev/null || true

# ── Always extract AppImage (faster startup, no FUSE dependency) ────────────
# Extracting the AppImage means:
#   - Zero FUSE dependency (works on every Linux)
#   - ~0ms startup overhead (direct AppRun vs 2-5s FUSE mount)
#   - Single execution path (no FUSE conditional in run.sh)
# Trade-off: +150MB disk space (irrelevant in 2026)
log_info "Extraindo AppImage (startup mais rápido)..."
"$INSTALL_DIR/$APPIMAGE_NAME" --appimage-extract >/dev/null 2>&1
rm -rf "$INSTALL_DIR/squashfs-root"
mv squashfs-root "$INSTALL_DIR/squashfs-root"
chmod +x "$INSTALL_DIR/squashfs-root/AppRun" 2>/dev/null || true
rm -f "$INSTALL_DIR/$APPIMAGE_NAME"  # Delete the .AppImage — no longer needed
USE_EXTRACTED=true
log_info "AppImage extraído com sucesso"
log_info "AppImage compacto removido (economia de ~150MB)"

# =============================================================================
# Step 5: Install icons (hicolor theme — GNOME/KDE/XFCE standard)
# =============================================================================
log_step "5/7 — Instalando ícones..."

ICON_SRC=""

# Find icon source
for candidate in \
  "$SCRIPT_DIR/icon.png" \
  "$SCRIPT_DIR/../assets/icon.png" \
  "$SCRIPT_DIR/../linux/icon.png"; do
  if [ -f "$candidate" ]; then
    ICON_SRC="$candidate"
    break
  fi
done

# Fallback: extract icon from AppImage (.DirIcon or embedded .png)
if [ -z "$ICON_SRC" ] && [ -f "$APPIMAGE" ]; then
  log_info "Extraindo ícone do AppImage..."
  EXTRACT_DIR=$(mktemp -d)
  if "$APPIMAGE" --appimage-extract "*.DirIcon" >/dev/null 2>&1 || \
     "$APPIMAGE" --appimage-extract "naruto-online.png" >/dev/null 2>&1; then
    # Look in squashfs-root (created in cwd)
    for ic in squashfs-root/.DirIcon squashfs-root/naruto-online.png; do
      if [ -f "$ic" ]; then
        mv "$ic" "$EXTRACT_DIR/icon.png" 2>/dev/null && ICON_SRC="$EXTRACT_DIR/icon.png"
        break
      fi
    done
    # Also check for any .png icon in the root
    if [ -z "$ICON_SRC" ] && [ -d squashfs-root ]; then
      for ic in squashfs-root/*.png; do
        if [ -f "$ic" ] && [ "$(basename "$ic")" != "electron.png" ]; then
          ICON_SRC="$ic"
          break
        fi
      done
    fi
    rm -rf squashfs-root 2>/dev/null || true
  fi
  # Cleanup temp if icon was found
  if [ -n "$ICON_SRC" ] && [ -d "$EXTRACT_DIR" ] && [ "$ICON_SRC" = "$EXTRACT_DIR/icon.png" ]; then
    # Keep it for now, cleanup later
    :
  else
    rm -rf "$EXTRACT_DIR" 2>/dev/null || true
  fi
fi

# Final fallback: download icon from GitHub
if [ -z "$ICON_SRC" ]; then
  log_info "Baixando ícone do GitHub..."
  curl -sL "https://raw.githubusercontent.com/Chrispsz/naruto-online-launcher/main/assets/icon.png" \
    -o /tmp/naruto-icon.png 2>/dev/null
  if [ -f /tmp/naruto-icon.png ] && [ "$(wc -c < /tmp/naruto-icon.png 2>/dev/null || echo 0)" -gt 1000 ]; then
    ICON_SRC="/tmp/naruto-icon.png"
  fi
fi

if [ -n "$ICON_SRC" ]; then
  log_info "Ícone fonte: $ICON_SRC"

  # Install multiple sizes into hicolor icon theme
  # GNOME, KDE, XFCE all respect ~/.local/share/icons/hicolor/
  ICON_SIZES=(16 24 32 48 64 128 256)
  INSTALLED_SIZES=()

  for size in "${ICON_SIZES[@]}"; do
    ICON_DIR="$ICONS_BASE/hicolor/${size}x${size}/apps"
    mkdir -p "$ICON_DIR"

    if command -v convert &>/dev/null; then
      # Use ImageMagick for high-quality resize
      convert "$ICON_SRC" -resize "${size}x${size}" "$ICON_DIR/$LAUNCHER_NAME.png" 2>/dev/null && \
        INSTALLED_SIZES+=("${size}x${size}")
    elif command -v rsvg-convert &>/dev/null; then
      # Use rsvg-convert (librsvg)
      rsvg-convert -w "$size" -h "$size" -o "$ICON_DIR/$LAUNCHER_NAME.png" "$ICON_SRC" 2>/dev/null && \
        INSTALLED_SIZES+=("${size}x${size}")
    else
      # Fallback: copy original to 128x128
      if [ "$size" -eq 128 ]; then
        cp "$ICON_SRC" "$ICON_DIR/$LAUNCHER_NAME.png"
        INSTALLED_SIZES+=("${size}x${size}")
      fi
    fi
  done

  # Also install to scalable for high-DPI
  SCALABLE_DIR="$ICONS_BASE/hicolor/scalable/apps"
  mkdir -p "$SCALABLE_DIR"
  if [ -f "$ICON_SRC" ]; then
    # Try to create SVG from PNG (fallback: copy PNG)
    cp "$ICON_SRC" "$SCALABLE_DIR/$LAUNCHER_NAME.png"
  fi

  if [ ${#INSTALLED_SIZES[@]} -gt 0 ]; then
    log_info "Ícones instalados: ${INSTALLED_SIZES[*]}"
  else
    log_warn "Nenhum conversor de imagem encontrado (ImageMagick/rsvg-convert)"
    log_info "Ícone original copiado diretamente"
    cp "$ICON_SRC" "$ICONS_BASE/$LAUNCHER_NAME.png"
  fi
else
  log_warn "Ícone não encontrado — pulando instalação de ícones"
fi

# Update icon caches
if command -v gtk-update-icon-cache &>/dev/null; then
  gtk-update-icon-cache -f -t "$ICONS_BASE/hicolor" 2>/dev/null || true
fi
if command -v update-icon-caches &>/dev/null; then
  update-icon-caches "$ICONS_BASE/hicolor" 2>/dev/null || true
fi

# pixmaps fallback — universal last-resort for all DEs (LXQt, XFCE, MATE, etc.)
if [ -n "$ICON_SRC" ] && [ -f "$ICON_SRC" ]; then
  mkdir -p "$REAL_HOME/.local/share/pixmaps"
  cp "$ICON_SRC" "$REAL_HOME/.local/share/pixmaps/$LAUNCHER_NAME.png"
  log_info "Ícone instalado em pixmaps/ (fallback universal)"
fi

# Cleanup temp icon extraction directory
if [ -n "${EXTRACT_DIR:-}" ] && [ -d "$EXTRACT_DIR" ]; then
  rm -rf "$EXTRACT_DIR" 2>/dev/null || true
fi

# =============================================================================
# Step 6: Create .desktop file
# =============================================================================
log_step "6/7 — Criando atalho no menu de aplicativos..."

# Determine executable path — always use run.sh wrapper
EXEC_PATH="$INSTALL_DIR/run.sh"

# Generate run.sh — the ONLY way to launch (handles env + flags correctly)
cat > "$INSTALL_DIR/run.sh" << RUNEOF
#!/bin/bash
# Naruto Online Launcher - Run Script
# Auto-generated by install.sh
set -euo pipefail

LAUNCHER_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

# Find AppImage (or AppRun if extracted)
APPIMAGE=""
if [ -x "\$LAUNCHER_DIR/squashfs-root/AppRun" ]; then
  APPIMAGE="\$LAUNCHER_DIR/squashfs-root/AppRun"
  export APPDIR="\$LAUNCHER_DIR/squashfs-root"
else
  for f in "\$LAUNCHER_DIR"/*.AppImage; do
    [ -f "\$f" ] && APPIMAGE="\$f" && break
  done
fi

if [ -z "\$APPIMAGE" ]; then
  echo "Error: Naruto Online Launcher not found in \$LAUNCHER_DIR" >&2
  echo "Please run the installer again." >&2
  exit 1
fi

chmod +x "\$APPIMAGE" 2>/dev/null || true

# Wayland → XWayland (Electron 11 requires X11)
if [ "\${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "\${WAYLAND_DISPLAY:-}" ]; then
  export XDG_SESSION_TYPE=x11
  export GDK_BACKEND=x11
  export SDL_VIDEODRIVER=x11
  export QT_QPA_PLATFORM=xcb
fi

# Launch — --no-sandbox is the only required flag
# If running from .AppImage, use --appimage-extract-and-run to avoid FUSE
# gamemoderun is optional and wraps the binary transparently
if [[ "\$APPIMAGE" == *.AppImage ]]; then
  if command -v gamemoderun &>/dev/null; then
    exec gamemoderun "\$APPIMAGE" --appimage-extract-and-run --no-sandbox "\$@"
  else
    exec "\$APPIMAGE" --appimage-extract-and-run --no-sandbox "\$@"
  fi
else
  if command -v gamemoderun &>/dev/null; then
    exec gamemoderun "\$APPIMAGE" --no-sandbox "\$@"
  else
    exec "\$APPIMAGE" --no-sandbox "\$@"
  fi
fi
RUNEOF
chmod +x "$INSTALL_DIR/run.sh"

# Copy uninstall script (robust version from linux/uninstall.sh)
# v3.5: uninstaller bundled together with installer — single source of truth
if [ -f "$SCRIPT_DIR/uninstall.sh" ]; then
  cp "$SCRIPT_DIR/uninstall.sh" "$INSTALL_DIR/uninstall.sh"
elif [ -f "$SCRIPT_DIR/../linux/uninstall.sh" ]; then
  # Fallback: procurar em linux/ (caso rode do repo clonado)
  cp "$SCRIPT_DIR/../linux/uninstall.sh" "$INSTALL_DIR/uninstall.sh"
else
  log_warn "uninstall.sh não encontrado — desinstalador não será embarcado."
fi
chmod +x "$INSTALL_DIR/uninstall.sh" 2>/dev/null || true
log_info "Desinstalador embarcado: $INSTALL_DIR/uninstall.sh"

# Create proper .desktop entry
# Using Icon= naruto-online (without path) for hicolor theme lookup
# v3.5: adicionada action Uninstall (usuário pode desinstalar pelo menu)
DESKTOP_FILE="$APPS_DIR/$LAUNCHER_NAME.desktop"
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.1
Type=Application
Name=Naruto Online
Comment=Play Naruto Online with Flash PPAPI — Native Linux Launcher
GenericName=Game Launcher
Exec="$EXEC_PATH"
Icon=$LAUNCHER_NAME
Terminal=false
StartupNotify=true
StartupWMClass=Naruto Online
Categories=Game;RolePlaying;
Keywords=game;naruto;flash;browser;mmo;
MimeType=x-scheme-handler/naruto-online;
Actions=Uninstall;

[Desktop Action Uninstall]
Name=Uninstall Shinobi Launcher
Name[pt_BR]=Desinstalar Shinobi Launcher
Exec=sh -c 'bash "$INSTALL_DIR/uninstall.sh" ; read -p "Pressione ENTER para fechar..."'
Icon=edit-delete
Terminal=true
EOF
chmod +x "$DESKTOP_FILE"

# Desktop shortcut (GNOME 42+ requires manual trust)
if [ -d "$REAL_HOME/Desktop" ]; then
  cp "$DESKTOP_FILE" "$REAL_HOME/Desktop/$LAUNCHER_NAME.desktop"
  chmod +x "$REAL_HOME/Desktop/$LAUNCHER_NAME.desktop"
  # Mark as trusted for GNOME
  if command -v gio &>/dev/null; then
    gio set "$REAL_HOME/Desktop/$LAUNCHER_NAME.desktop" metadata::trusted true 2>/dev/null || true
  fi
fi

# Update desktop database
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi

log_info "Atalho criado: $LAUNCHER_NAME.desktop"

# =============================================================================
# Step 7: Final summary
# =============================================================================
log_step "7/7 — Finalizando..."

# Create a simple launcher bin symlink (optional, for terminal access)
if [ ! -f "$BIN_DIR/naruto-online" ]; then
  ln -sf "$EXEC_PATH" "$BIN_DIR/naruto-online" 2>/dev/null || true
  log_info "Comando criado: naruto-online (terminal)"
fi

# Ensure shell picks up ~/.local/bin
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  log_warn "Adicione ~/.local/bin ao seu PATH:"
  case "$SHELL" in
    */zsh)
      echo -e "  ${CYAN}echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc${NC}"
      echo -e "  ${CYAN}source ~/.zshrc${NC}"
      ;;
    */bash)
      echo -e "  ${CYAN}echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc${NC}"
      echo -e "  ${CYAN}source ~/.bashrc${NC}"
      ;;
    *)
      echo -e "  ${CYAN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
      ;;
  esac
fi

echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║     ✅ Instalação concluída com sucesso!   ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🎮 ${BOLD}Abrir:${NC} Procure \"Naruto Online\" no menu de aplicativos"
echo -e "  🖥️  ${BOLD}Terminal:${NC} ${CYAN}naruto-online${NC}"
echo ""
echo -e "  ${YELLOW}🗑️  ${BOLD}Desinstalar (3 formas):${NC}"
echo -e "     ${BOLD}1.${NC} Menu de aplicativos → clique direito em \"Naruto Online\" → \"Desinstalar\""
echo -e "     ${BOLD}2.${NC} Terminal: ${CYAN}bash $INSTALL_DIR/uninstall.sh${NC}"
echo -e "     ${BOLD}3.${NC} Não-interativo: ${CYAN}bash $INSTALL_DIR/uninstall.sh --yes${NC}"
echo ""
echo -e "  📁 ${BOLD}Instalado em:${NC} $INSTALL_DIR"
echo -e "  📂 ${BOLD}Dados do jogo:${NC} $CONFIG_DIR"
echo ""
