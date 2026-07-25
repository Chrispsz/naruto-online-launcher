#!/bin/bash
# =============================================================================
# Naruto Online Launcher — Run Script
# Usage: ./run.sh [--perf] [--debug]
#
# Execution priority:
#   1. squashfs-root/AppRun (extracted — FAST, 0ms overhead)
#   2. .AppImage file (FUSE mount — SLOW, 2-5s overhead)
#   3. --appimage-extract-and-run fallback (auto-extract on demand)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Find AppImage ─────────────────────────────────────────────────────────────
APPIMAGE=""

# First: look for extracted AppRun (FAST — always preferred)
if [ -x "$SCRIPT_DIR/squashfs-root/AppRun" ]; then
  APPIMAGE="$SCRIPT_DIR/squashfs-root/AppRun"
  export APPDIR="$SCRIPT_DIR/squashfs-root"
fi

# Fallback: look for .AppImage file
if [ -z "$APPIMAGE" ]; then
  for f in "$SCRIPT_DIR"/*.AppImage; do
    [ -f "$f" ] && APPIMAGE="$f" && break
  done
fi

if [ -z "$APPIMAGE" ]; then
  echo "Error: Naruto Online Launcher not found in $SCRIPT_DIR" >&2
  echo "Please run the installer again." >&2
  exit 1
fi

chmod +x "$APPIMAGE" 2>/dev/null || true

# ── Wayland → XWayland (Electron 11 requires X11) ───────────────────────────
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
  export XDG_SESSION_TYPE=x11
  export GDK_BACKEND=x11
  export SDL_VIDEODRIVER=x11
  export QT_QPA_PLATFORM=xcb
fi

# ── Launch ────────────────────────────────────────────────────────────────────
# If running from .AppImage (not extracted), use --appimage-extract-and-run
# to avoid FUSE dependency (auto-extracts to temp dir on each launch)
if [[ "$APPIMAGE" == *.AppImage ]]; then
  if command -v gamemoderun &>/dev/null; then
    exec gamemoderun "$APPIMAGE" --appimage-extract-and-run --no-sandbox "$@"
  else
    exec "$APPIMAGE" --appimage-extract-and-run --no-sandbox "$@"
  fi
else
  if command -v gamemoderun &>/dev/null; then
    exec gamemoderun "$APPIMAGE" --no-sandbox "$@"
  else
    exec "$APPIMAGE" --no-sandbox "$@"
  fi
fi
