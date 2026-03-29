# Naruto Online Launcher

Ultra-optimized Flash game launcher for Naruto Online.

[**README em Português**](README-ptbr.md) 🇧🇷

## ✨ Features

### 🎮 Hardware Profiles
- **🚀 Modern** - RX 6000+, RTX 3000+, GTX 1600+ (Vulkan, GPU rasterization)
- **🔧 Legacy** - GTX 900/1000, Radeon HD/RX 500, Intel HD (D3D11/OpenGL)
- **💻 CPU Only** - No dedicated GPU (SwiftShader software rendering)

### ⚡ Flash 64-bit Optimizations
- Hardware video decoder enabled
- 4GB JS heap limit
- Staging buffer for better rendering
- Multithreaded video decoding
- 500MB asset cache
- 50% GPU memory available to Flash
- High process priority

### 🔑 Login Saved
- Persistent cookies for 1 year
- Session saved automatically
- F5 to clear login (switch accounts)

### 🎁 Launcher Rewards
- Automatic `logintype=4`
- Get exclusive launcher rewards

### 🌍 Multi-Region (F6)
- 6 languages available
- Instant region switch
- Portuguese (BR) as default

## ⌨️ Controls

| Key | Action |
|-----|--------|
| F5 | Clear Login |
| F6 | Switch Region |
| F7 | Switch Hardware Profile |
| F11 | Fullscreen |
| ESC | Exit Fullscreen |

## 🌍 Regions

| Flag | Language | Default |
|------|----------|---------|
| 🇧🇷 | Português | ✅ |
| 🇺🇸 | English | |
| 🇫🇷 | Français | |
| 🇩🇪 | Deutsch | |
| 🇪🇸 | Español | |
| 🇵🇱 | Polski | |

## 🖥️ Hardware Profiles

| Profile | Icon | GPU | Description |
|---------|------|-----|-------------|
| **Modern** | 🚀 | RX 6000+, RTX 3000+, GTX 1600+ | Vulkan, GPU rasterization, zero-copy |
| **Legacy** | 🔧 | GTX 900/1000, Radeon HD/RX 500, Intel HD | D3D11/OpenGL, in-process-gpu |
| **CPU Only** | 💻 | Sem GPU dedicada | SwiftShader (software rendering) |

Use **F7** to switch profiles. Restart to apply.

## ⚡ Flash 64-bit Optimizations

| Optimization | Description |
|--------------|-------------|
| **HW Video Decoder** | Hardware-accelerated video decoding |
| **4GB JS Heap** | 64-bit can use more memory |
| **Staging Buffer** | Better rendering performance |
| **Multithreaded Video** | Video in separate thread |
| **500MB Asset Cache** | Larger cache for game assets |
| **50% GPU Memory** | Flash can use half of GPU memory |
| **Plugin Power Saver** | Disabled for max performance |
| **High Process Priority** | Launcher runs with priority |

## 🚀 Ruffle (Experimental Multi-thread)

[Ruffle](https://github.com/ruffle-rs/ruffle) is a Flash emulator written in Rust with **REAL multi-threading**!

| Feature | Flash PPAPI | Ruffle |
|---------|-------------|--------|
| **Threading** | ❌ Single-thread | ✅ Multi-thread |
| **GPU** | Limited D3D11 | Modern Vulkan/WebGL |
| **Status** | Abandoned 2020 | Active 2026 |
| **Security** | Vulnerable | Memory-safe |

⚠️ **Experimental**: See `ruffle-launcher/` branch for standalone version.

## 💾 Requirements

| Requirement | Minimum |
|-------------|---------|
| OS | Windows 7 / Linux |
| RAM | 2 GB |

⚠️ **Note**: macOS not supported.

## 📦 Installation

### Linux
```bash
chmod +x install.sh
./install.sh
```

### Windows
Extract and run `NarutoOnline.exe`

## 🗑️ Uninstall

### Linux
```bash
~/.local/share/naruto-online/uninstall.sh
```

### Windows
Delete the folder.

## ⚙️ Tech

| Item | Details |
|------|---------|
| Framework | Electron 9.4.4 |
| Flash (Windows) | PPAPI 34.0.0.376 (download on build) |
| Flash (Linux) | PPAPI 34.0.0.137 **included** |
| Source | [darktohka/clean-flash-builds](https://github.com/darktohka/clean-flash-builds) |
| GPU Backend | Vulkan (AMD/NVIDIA) / D3D11 fallback |

## 🎨 Media / Branding

High-quality icons available in `/media` for content creators.

## 📜 License

MIT

## ⚠️ Disclaimer

Unofficial launcher. Naruto Online is a trademark of OAS Games.
