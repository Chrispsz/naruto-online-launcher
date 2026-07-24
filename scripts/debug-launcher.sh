#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# debug-launcher.sh — Run the Shinobi Launcher in ULTRA-VERBOSE DEBUG mode
#
# Logs ABSOLUTELY EVERYTHING to the terminal:
#   - Electron logs (app events, window events, webContents)
#   - Chromium logs (--enable-logging --v=1)
#   - Flash PPAPI logs
#   - IPC logs (all messages between main and renderer)
#   - Click logs (which element was clicked, coordinates)
#   - Input logs (which field was filled, value)
#   - Keypress logs (which key was pressed)
#   - Navigation logs (URL changes, redirects)
#   - Network logs (requests to naruto/oasgames/passport)
#   - Memory logs (RSS, heap, every 10s)
#   - Crash logs (render-process-gone, GPU crash, etc)
#   - DevTools opens automatically
#
# USAGE:
#   bash scripts/debug-launcher.sh                  # uses installed AppImage
#   bash scripts/debug-launcher.sh ./app.AppImage   # uses specific AppImage
#
# OUTPUT: everything goes to stdout + debug-session.log file
# ═══════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  🔍 Shinobi Launcher — ULTRA-VERBOSE DEBUG${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Find AppImage ──
APPIMAGE=""

# If an argument was passed, use it
if [ -n "${1:-}" ] && [ -f "$1" ]; then
  APPIMAGE="$1"
# If installed in ~/.local/share/naruto-online/
elif [ -f "$HOME/.local/share/naruto-online/Naruto Online-"*.AppImage ]; then
  APPIMAGE=$(ls "$HOME/.local/share/naruto-online/"*.AppImage 2>/dev/null | head -1)
# If in current directory
elif ls ./*.AppImage 2>/dev/null | head -1 > /dev/null; then
  APPIMAGE=$(ls ./*.AppImage 2>/dev/null | head -1)
# If in script directory
elif ls "$(dirname "$0")/"*.AppImage 2>/dev/null | head -1 > /dev/null; then
  APPIMAGE=$(ls "$(dirname "$0")/"*.AppImage 2>/dev/null | head -1)
fi

if [ -z "$APPIMAGE" ]; then
  echo -e "${RED}❌ No AppImage found!${NC}"
  echo ""
  echo "Searched in:"
  echo "  \$1 (argument)"
  echo "  ~/.local/share/naruto-online/*.AppImage"
  echo "  ./*.AppImage"
  echo "  $(dirname "$0")/*.AppImage"
  echo ""
  echo "Usage: bash debug-launcher.sh /path/to/Naruto Online-4.0.0.AppImage"
  exit 1
fi

echo -e "${GREEN}✅ AppImage: $APPIMAGE${NC}"
echo -e "${GREEN}✅ Size: $(du -h "$APPIMAGE" | cut -f1)${NC}"
echo ""

# ── Debug environment variables ──
# v4.1: SHINOBI_DEBUG mode removed (shinobi suite deactivated — see worklog Sprint 5)
export LOG_LEVEL=debug           # electron-log debug level
export ELECTRON_ENABLE_LOGGING=1 # Logs Chromium to stdout
export ELECTRON_DISABLE_SECURITY_WARNINGS=1 # Suppresses CSP warnings

# ── Chromium/Electron command-line flags ──
CHROMIUM_FLAGS=(
  --enable-logging              # Logs Chromium to console
  --v=1                         # Verbosity level 1 (info+)
  --log-level=0                 # All levels
  --no-sandbox                  # Required for PPAPI on Linux
  --enable-devtools-experiments # Full DevTools
  --disable-background-timer-throttling  # Don't throttle logs
  --ppapi-flash-debug          # Debug Pepper Flash
  --ppapi-flash-log-level=all   # Log everything from Flash PPAPI
)

# If Wayland, force XWayland (Flash requires X11)
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
  export XDG_SESSION_TYPE=x11
  export GDK_BACKEND=x11
  echo -e "${YELLOW}⚠️  Wayland detected — forcing XWayland (Flash requires X11)${NC}"
fi

echo -e "${YELLOW}📋 Debug mode active. Everything will be logged below.${NC}"
echo -e "${YELLOW}📋 DevTools will open automatically.${NC}"
echo -e "${YELLOW}📋 Logs saved to: debug-session.log${NC}"
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Run AppImage with all flags ──
# Pipe to tee: shows in terminal AND saves to file
chmod +x "$APPIMAGE" 2>/dev/null || true

"$APPIMAGE" \
  --appimage-extract-and-run \
  "${CHROMIUM_FLAGS[@]}" \
  2>&1 | tee debug-session.log

EXIT_CODE=$?

echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  App finished (exit code: $EXIT_CODE)${NC}"
echo -e "${CYAN}  Log saved to: $(pwd)/debug-session.log${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
