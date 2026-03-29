# 🍥 Naruto Online Launcher

[![Release](https://img.shields.io/github/v/release/Chrispsz/naruto-online-launcher?style=flat-square)](https://github.com/Chrispsz/naruto-online-launcher/releases)
[![License](https://img.shields.io/github/license/Chrispsz/naruto-online-launcher?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue?style=flat-square)]()

Launcher ultra-otimizado para **Naruto Online** sem tracking, sem anúncios e com aceleração GPU completa.

[**README in English**](README.md) 🇺🇸

---

## ✨ Funcionalidades

### 🎮 Perfis de Hardware
| Perfil | GPU | Otimizações |
|--------|-----|-------------|
| **🚀 Moderno** | RX 6000+, RTX 3000+, GTX 1600+ | GPU rasterization, zero-copy, D3D11/GL |
| **🔧 Antigo** | GTX 900/1000, Radeon HD/RX 500, Intel HD | In-process GPU, D3D11/OpenGL |
| **💻 Apenas CPU** | Sem GPU dedicada | SwiftShader (software rendering) |

### ⚡ Otimizações Flash 64-bit
- Decodificador de vídeo por hardware
- 512MB de heap JS (otimizado para Flash)
- Staging buffer para melhor renderização
- Decodificação de vídeo multithread
- Cache de 500MB em disco + 128MB mídia

### 🔒 Privacidade em Primeiro Lugar
- **Sem cookies de tracking** - bloqueados no nível de rede
- **Sem analytics** - Google Analytics, Facebook Pixel bloqueados
- **Sem anúncios** - DoubleClick, serviços de ads bloqueados
- **Login persistente** - cookies salvos por 1 ano

### 🎁 Recompensas de Launcher
- Parâmetro `logintype=4` automático
- Receba recompensas exclusivas do launcher

### 🌍 Multi-Região
| Bandeira | Idioma | Servidor |
|----------|--------|----------|
| 🇧🇷 | Português | naruto.oasgames.com |
| 🇺🇸 | English | naruto.oasgames.com |
| 🇫🇷 | Français | naruto.oasgames.com |
| 🇩🇪 | Deutsch | naruto.oasgames.com |
| 🇪🇸 | Español | naruto.oasgames.com |
| 🇵🇱 | Polski | naruto.oasgames.com |

---

## ⌨️ Atalhos de Teclado

| Tecla | Ação |
|-------|------|
| F5 | Limpar Login (trocar conta) |
| F6 | Trocar Região |
| F7 | Trocar Perfil de Hardware |
| F11 | Tela Cheia |
| ESC | Sair da Tela Cheia |

---

## 💾 Requisitos

| Requisito | Mínimo |
|-----------|--------|
| SO | Windows 7+ / Linux (x64) |
| RAM | 2 GB |
| GPU | Qualquer (modo CPU disponível) |

⚠️ **Nota**: macOS não é suportado (Flash PPAPI indisponível).

---

## 📦 Instalação

### Linux (AppImage)
```bash
# Baixe da página de Releases
chmod +x naruto-online-launcher-*.AppImage
./naruto-online-launcher-*.AppImage

# Ou use o instalador
chmod +x install.sh
./install.sh
```

### Windows (Portable)
1. Baixe `NarutoOnline.exe` dos Releases
2. Extraia e execute
3. Sem instalação necessária

---

## 🗑️ Desinstalar

### Linux
```bash
~/.local/share/naruto-online/uninstall.sh
```

### Windows
Delete a pasta.

---

## ⚙️ Stack Técnica

| Componente | Versão |
|------------|--------|
| Electron | 11.5.0 (último com Flash PPAPI) |
| Chromium | 87 |
| Node.js | 12.20 |
| Flash (Windows) | PPAPI 34.0.0.376 |
| Flash (Linux) | PPAPI 34.0.0.137 |

### Por que Electron 11?
Electron 12+ removeu suporte a PPAPI. A versão 11.5.0 é a **última com suporte a Flash** e inclui Chromium 87 com aceleração GPU moderna.

---

## 🛡️ Notas de Segurança

- Flash PPAPI foi abandonado pela Adobe em 2020
- Este launcher usa builds limpos de [darktohka/clean-flash-builds](https://github.com/darktohka/clean-flash-builds)
- Sem exploits conhecidos para esta versão específica, mas Flash é inerentemente menos seguro que padrões web modernos

---

## ❓ FAQ

### Por que o Ruffle não funciona?
Naruto Online usa **Flash Sockets (XMLSocket)** para PvP em tempo real e eventos. O Ruffle não implementa sockets ainda. Este launcher é a **única solução funcional** para Linux.

### Por que não tem F12 DevTools?
DevTools é desativado em builds de produção por segurança. Só está disponível em modo de desenvolvimento.

### O jogo está lento, o que fazer?
1. Tente diferentes perfis de hardware com F7
2. Reinicie o launcher após trocar o perfil
3. Use "Apenas CPU" se tiver problemas com GPU

---

## 📜 Licença

Licença MIT - veja [LICENSE](LICENSE)

---

## ⚠️ Aviso

Este é um launcher **não-oficial**. Naruto Online é uma marca da OAS Games. Este projeto não é afiliado ou endossado pela OAS Games.

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Abra uma issue ou pull request.

---

## 📁 Estrutura do Projeto

```
src/
├── main.js              # Ponto de entrada
├── config/              # Regiões, perfis de hardware, configurações
├── flash/               # Detecção e configuração do Flash
├── network/             # Bloqueador de ads e gerenciador de cookies
├── window/              # Criação de janela e atalhos
├── chromium/            # Configuração de flags GPU
└── utils/               # Logger
```
