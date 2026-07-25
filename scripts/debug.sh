#!/usr/bin/env bash
# debug.sh — Launch Shinobi Launcher from source tree with SHINOBI_DEBUG=1.
#
# Opens an interactive terminal that:
#   - Sets SHINOBI_DEBUG=1 (enables Dev Tools panel in Settings + verbose logger)
#   - Runs `npm start` (electron .) in the foreground
#   - Pipes ALL output (electron + chromium + flash + app logs) to stdout
#   - Tees to debug-session.log for later inspection
#
# This REPLACES the in-launcher Ctrl+Shift+D shortcut (removed in v5.9.3).
# Debug is now opt-in via this script — zero UI complexity in normal launches.
#
# USAGE:
#   bash scripts/debug.sh                  # run from source tree
#   bash scripts/debug.sh --no-flash       # skip Flash PPAPI check (if cached)
#
# REQUIRES: node, npm, electron (devDependency). Run `npm install` first.

set -uo pipefail

# Resolve repo root (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || { echo "❌ Cannot cd to $REPO_ROOT"; exit 1; }

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  🔧 Shinobi Launcher — DEBUG (source tree)${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Repo:${NC}  $REPO_ROOT"
echo -e "  ${GREEN}Mode:${NC}  SHINOBI_DEBUG=1 (Dev Tools panel visible in Settings)"
echo ""

# ── Verify electron is installed ──
if [ ! -d "node_modules/electron" ]; then
  echo -e "${RED}❌ electron not found in node_modules/.${NC}"
  echo -e "   Run ${BOLD}npm install${NC} first."
  exit 1
fi

# ── Debug env vars ──
export SHINOBI_DEBUG=1                    # Enables Dev Tools panel in UI + verbose logger
export LOG_LEVEL=debug                    # electron-log debug level
export ELECTRON_ENABLE_LOGGING=1          # Logs Chromium to stdout
export ELECTRON_DISABLE_SECURITY_WARNINGS=1

# ── Chromium flags (passed to electron via npm start -- ) ──
CHROMIUM_FLAGS=(
  --enable-logging
  --v=1
  --log-level=0
  --enable-devtools-experiments
  --disable-background-timer-throttling
)

# Wayland → XWayland (Flash PPAPI requires X11)
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
  export XDG_SESSION_TYPE=x11
  export GDK_BACKEND=x11
  echo -e "${YELLOW}⚠️  Wayland detected — forcing XWayland (Flash requires X11)${NC}"
fi

echo -e "${YELLOW}📋 Dev Tools will appear in Settings → Dev Tools section.${NC}"
echo -e "${YELLOW}📋 Logs saved to: ${REPO_ROOT}/debug-session.log${NC}"
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Run: npm start -- <chromium flags> ──
# `--` separates npm args from electron args
LOG_FILE="$REPO_ROOT/debug-session.log"

npm start -- "${CHROMIUM_FLAGS[@]}" 2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Launcher finished (exit code: $EXIT_CODE)${NC}"
echo -e "${CYAN}  Log saved to: $LOG_FILE${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════${NC}"

exit "$EXIT_CODE"
