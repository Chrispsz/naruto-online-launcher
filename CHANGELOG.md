# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.0.0] - 2025-03-29

### 🎉 First Public Release

This is the first stable public release of Naruto Online Launcher.

### Added
- Multi-region support (6 languages: PT, EN, FR, DE, ES, PL)
- Hardware profiles (Modern, Legacy, CPU Only)
- Persistent login (cookies saved for 1 year)
- Automatic `logintype=4` for launcher rewards
- Ad/tracking blocker at network level
- Linux AppImage + Windows Portable builds

### Security
- No tracking cookies
- No analytics
- No ads
- DevTools disabled in production

### Technical
- Electron 11.5.0 (last version with Flash PPAPI)
- Chromium 87 with GPU acceleration
- Flash PPAPI 34.0.0.376 (Windows) / 34.0.0.137 (Linux)
- 54 unit tests
- CI/CD with GitHub Actions

### Known Limitations
- macOS not supported (no Flash PPAPI)
- Ruffle doesn't work (game uses Flash Sockets)

---

For detailed changelog of previous versions, see [GitHub Releases](https://github.com/Chrispsz/naruto-online-launcher/releases).
