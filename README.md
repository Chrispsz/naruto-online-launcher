# 🍥 Naruto Online Launcher

[![Release](https://img.shields.io/github/v/release/Chrispsz/naruto-online-launcher?style=flat-square)](https://github.com/Chrispsz/naruto-online-launcher/releases)
[![License](https://img.shields.io/github/license/Chrispsz/naruto-online-launcher?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue?style=flat-square)]()

Ultra-optimized Flash game launcher for **Naruto Online** with no tracking, no ads, and full GPU acceleration.

[**README em Português**](README-ptbr.md) 🇧🇷

---

## ✨ Features

### 🎮 Hardware Profiles
| Profile | GPU | Optimizations |
|---------|-----|---------------|
| **🚀 Modern** | RX 6000+, RTX 3000+, GTX 1600+ | GPU rasterization, zero-copy, D3D11/GL |
| **🔧 Legacy** | GTX 900/1000, Radeon HD/RX 500, Intel HD | In-process GPU, D3D11/OpenGL |
| **💻 CPU Only** | No dedicated GPU | SwiftShader software rendering |

### ⚡ Flash 64-bit Optimizations
- Hardware video decoder enabled
- 512MB JS heap (optimized for Flash)
- Staging buffer for better rendering
- Multithreaded video decoding
- 500MB disk cache + 128MB media cache

### 🔒 Privacy First
- **No tracking cookies** - blocked at network level
- **No analytics** - Google Analytics, Facebook Pixel blocked
- **No ads** - DoubleClick, ad services blocked
- **Persistent login** - cookies saved for 1 year

### 🎁 Launcher Rewards
- Automatic `logintype=4` parameter
- Get exclusive launcher rewards in-game

### 🌍 Multi-Region
| Flag | Language | Server |
|------|----------|--------|
| 🇧🇷 | Português | naruto.oasgames.com |
| 🇺🇸 | English | naruto.oasgames.com |
| 🇫🇷 | Français | naruto.oasgames.com |
| 🇩🇪 | Deutsch | naruto.oasgames.com |
| 🇪🇸 | Español | naruto.oasgames.com |
| 🇵🇱 | Polski | naruto.oasgames.com |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F5 | Clear Login (switch accounts) |
| F6 | Switch Region |
| F7 | Switch Hardware Profile |
| F11 | Toggle Fullscreen |
| ESC | Exit Fullscreen |

---

## 💾 Requirements

| Requirement | Minimum |
|-------------|---------|
| OS | Windows 7+ / Linux (x64) |
| RAM | 2 GB |
| GPU | Any (CPU mode available) |

⚠️ **Note**: macOS is not supported (Flash PPAPI unavailable).

---

## 📦 Installation

### Linux (AppImage)
```bash
# Download from Releases page
chmod +x naruto-online-launcher-*.AppImage
./naruto-online-launcher-*.AppImage

# Or use the installer
chmod +x install.sh
./install.sh
```

### Windows (Portable)
1. Download `NarutoOnline.exe` from Releases
2. Extract and run
3. No installation required

---

## 🗑️ Uninstall

### Linux
```bash
~/.local/share/naruto-online/uninstall.sh
```

### Windows
Delete the folder.

---

## ⚙️ Tech Stack

| Component | Version |
|-----------|---------|
| Electron | 11.5.0 (last with Flash PPAPI) |
| Chromium | 87 |
| Node.js | 12.20 |
| Flash (Windows) | PPAPI 34.0.0.376 |
| Flash (Linux) | PPAPI 34.0.0.137 |

### Why Electron 11?
Electron 12+ removed PPAPI support. Version 11.5.0 is the **last version with Flash support** and includes Chromium 87 with modern GPU acceleration.

---

## 🛡️ Security Notes

- Flash PPAPI was abandoned by Adobe in 2020
- This launcher uses clean builds from [darktohka/clean-flash-builds](https://github.com/darktohka/clean-flash-builds)
- No known exploits for this specific version, but Flash is inherently less secure than modern web standards

---

## ❓ FAQ

### Why doesn't Ruffle work?
Naruto Online uses **Flash Sockets (XMLSocket)** for real-time PvP and events. Ruffle doesn't implement sockets yet. This launcher is the **only working solution** for Linux.

### Why is there no F12 DevTools?
DevTools is disabled in production builds for security. It's only available in development mode.

### The game is slow, what should I do?
1. Try different hardware profiles with F7
2. Restart the launcher after changing profile
3. Use "CPU Only" if you have GPU issues

---

## 📜 License

MIT License - see [LICENSE](LICENSE)

---

## ⚠️ Disclaimer

This is an **unofficial** launcher. Naruto Online is a trademark of OAS Games. This project is not affiliated with or endorsed by OAS Games.

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or pull request.

---

## 📁 Project Structure

```
src/
├── main.js              # Entry point
├── config/              # Regions, hardware profiles, settings
├── flash/               # Flash plugin detection & config
├── network/             # Ad blocker & cookie manager
├── window/              # Window creation & shortcuts
├── chromium/            # GPU flags configuration
└── utils/               # Logger
```
