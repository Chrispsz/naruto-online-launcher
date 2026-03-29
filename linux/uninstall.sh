#!/bin/bash
# Naruto Online Launcher - Uninstaller
# Removes all traces of the application

set -e

echo "========================================"
echo "  Naruto Online Launcher - Uninstaller"
echo "========================================"
echo ""

# Detect user home
if [ -n "$SUDO_USER" ]; then
    USER_HOME=$(eval echo ~$SUDO_USER)
else
    USER_HOME=$HOME
fi

# Remove .desktop entry
DESKTOP_FILE="$USER_HOME/.local/share/applications/naruto-online-launcher.desktop"
if [ -f "$DESKTOP_FILE" ]; then
    rm -f "$DESKTOP_FILE"
    echo "✓ Removed: $DESKTOP_FILE"
fi

# Remove from desktop
DESKTOP_SHORTCUT="$USER_HOME/Desktop/naruto-online-launcher.desktop"
if [ -f "$DESKTOP_SHORTCUT" ]; then
    rm -f "$DESKTOP_SHORTCUT"
    echo "✓ Removed: $DESKTOP_SHORTCUT"
fi

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$USER_HOME/.local/share/applications" 2>/dev/null || true
fi

# Ask about game data
GAME_DATA="$USER_HOME/.config/naruto-online-launcher"
if [ -d "$GAME_DATA" ]; then
    echo ""
    read -p "Remove game data and settings? (y/N): " REMOVE_DATA
    if [ "$REMOVE_DATA" = "y" ] || [ "$REMOVE_DATA" = "Y" ]; then
        rm -rf "$GAME_DATA"
        echo "✓ Removed: $GAME_DATA"
    fi
fi

# Ask about the AppImage
echo ""
read -p "Remove AppImage and icon files? (y/N): " REMOVE_APP
if [ "$REMOVE_APP" = "y" ] || [ "$REMOVE_APP" = "Y" ]; then
    # Common locations
    LOCATIONS=(
        "$USER_HOME/Documents/naruto"
        "$USER_HOME/Documentos/naruto"
        "$USER_HOME/Applications"
        "$USER_HOME/.local/bin"
    )
    
    for loc in "${LOCATIONS[@]}"; do
        if [ -f "$loc/Naruto.Online"*.AppImage ]; then
            rm -f "$loc"/Naruto.Online*.AppImage 2>/dev/null
            rm -f "$loc"/icon.png 2>/dev/null
            echo "✓ Cleaned: $loc"
        fi
    done
fi

echo ""
echo "✅ Uninstall complete!"
echo ""
