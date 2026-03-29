#!/bin/bash
# Naruto Online Launcher - Linux Installer
# Universal installer for all Linux distributions

set -e

VERSION="1.9.3"
APP_NAME="Naruto Online Launcher"

echo "========================================"
echo "  $APP_NAME v$VERSION - Installer"
echo "========================================"
echo ""

# Detect script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect user home
if [ -n "$SUDO_USER" ]; then
    USER_HOME=$(eval echo ~$SUDO_USER)
    CURRENT_USER="$SUDO_USER"
else
    USER_HOME=$HOME
    CURRENT_USER=$(whoami)
fi

# Detect documents folder
if [ -d "$USER_HOME/Documents" ]; then
    DOCS="$USER_HOME/Documents"
elif [ -d "$USER_HOME/Documentos" ]; then
    DOCS="$USER_HOME/Documentos"
else
    DOCS="$USER_HOME"
fi

# Installation directory
INSTALL_DIR="$DOCS/naruto-online"

# Find AppImage
APPIMAGE=""
for f in "$SCRIPT_DIR"/*.AppImage; do
    if [ -f "$f" ]; then
        APPIMAGE="$f"
        break
    fi
done

# If not found, download latest
if [ -z "$APPIMAGE" ]; then
    echo "📥 AppImage not found. Downloading latest version..."
    
    # Get latest release URL
    LATEST_URL=$(curl -s https://api.github.com/repos/Chrispsz/naruto-online-launcher/releases/latest | grep "browser_download_url.*AppImage" | head -1 | cut -d '"' -f 4)
    
    if [ -z "$LATEST_URL" ]; then
        echo "❌ Could not find latest release. Please download manually."
        exit 1
    fi
    
    mkdir -p "$INSTALL_DIR"
    echo "   Downloading from: $LATEST_URL"
    curl -L "$LATEST_URL" -o "$INSTALL_DIR/Naruto.Online-Latest.AppImage"
    APPIMAGE="$INSTALL_DIR/Naruto.Online-Latest.AppImage"
    chmod +x "$APPIMAGE"
fi

APPIMAGE_NAME=$(basename "$APPIMAGE")

# Create installation directory
mkdir -p "$INSTALL_DIR"

# Copy files
echo "📁 Installing to: $INSTALL_DIR"

if [[ "$APPIMAGE" != "$INSTALL_DIR/$APPIMAGE_NAME" ]]; then
    cp "$APPIMAGE" "$INSTALL_DIR/"
fi

# Copy icon
if [ -f "$SCRIPT_DIR/icon.png" ]; then
    cp "$SCRIPT_DIR/icon.png" "$INSTALL_DIR/"
elif [ ! -f "$INSTALL_DIR/icon.png" ]; then
    # Download icon from repo
    curl -sL "https://raw.githubusercontent.com/Chrispsz/naruto-online-launcher/main/linux/icon.png" -o "$INSTALL_DIR/icon.png"
fi

# Make AppImage executable
chmod +x "$INSTALL_DIR/$APPIMAGE_NAME"

# Create applications directory
mkdir -p "$USER_HOME/.local/share/applications"
mkdir -p "$USER_HOME/.local/share/icons"

# Copy icon to system icons
cp "$INSTALL_DIR/icon.png" "$USER_HOME/.local/share/icons/naruto-online.png"

# Create .desktop file
cat > "$USER_HOME/.local/share/applications/naruto-online-launcher.desktop" << EOF
[Desktop Entry]
Version=1.0
Name=Naruto Online
Comment=Naruto Online Flash Launcher
Exec="$INSTALL_DIR/$APPIMAGE_NAME" --no-sandbox %U
Icon=naruto-online
Terminal=false
StartupNotify=true
Type=Application
Categories=Game;AdventureGame;
StartupWMClass=naruto-online
Keywords=naruto;game;flash;anime;
EOF

chmod +x "$USER_HOME/.local/share/applications/naruto-online-launcher.desktop"

# Create desktop shortcut
if [ -d "$USER_HOME/Desktop" ]; then
    cp "$USER_HOME/.local/share/applications/naruto-online-launcher.desktop" "$USER_HOME/Desktop/"
    chmod +x "$USER_HOME/Desktop/naruto-online-launcher.desktop"
    
    # Make trusted (GNOME)
    if command -v gio &> /dev/null; then
        gio set "$USER_HOME/Desktop/naruto-online-launcher.desktop" "metadata::trusted" true 2>/dev/null || true
    fi
fi

# Copy uninstaller
if [ -f "$SCRIPT_DIR/uninstall.sh" ]; then
    cp "$SCRIPT_DIR/uninstall.sh" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/uninstall.sh"
fi

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$USER_HOME/.local/share/applications" 2>/dev/null || true
fi

# Update icon cache
if command -v gtk-update-icon-cache &> /dev/null; then
    gtk-update-icon-cache -f "$USER_HOME/.local/share/icons" 2>/dev/null || true
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📍 Installed to: $INSTALL_DIR"
echo "🎮 Executable: $APPIMAGE_NAME --no-sandbox"
echo "🗑️  To uninstall: $INSTALL_DIR/uninstall.sh"
echo ""
echo "💡 The game will appear in your application menu."
echo "   (May require logout/login on some systems)"
echo ""
