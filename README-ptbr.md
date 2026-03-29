# Naruto Online Launcher

Launcher ultra-otimizado para Naruto Online.

[**README in English**](README.md) 🇺🇸

## ✨ Funcionalidades

### 🎮 Perfis de Hardware
- **🚀 Moderno** - RX 6000+, RTX 3000+, GTX 1600+ (Vulkan, GPU rasterization)
- **🔧 Antigo** - GTX 900/1000, Radeon HD/RX 500, Intel HD (D3D11/OpenGL)
- **💻 Apenas CPU** - Sem GPU dedicada (SwiftShader software rendering)

### ⚡ Otimizações Flash 64-bit
- Decodificador de vídeo por hardware
- 4GB de heap JS
- Staging buffer para melhor renderização
- Decodificação de vídeo multithread
- Cache de 500MB para assets
- 50% da memória GPU disponível para Flash
- Prioridade alta do processo

### 🔑 Login Salvo
- Cookies persistentes por 1 ano
- Sessão salva automaticamente
- F5 para limpar login (trocar conta)

### 🎁 Prêmios de Launcher
- `logintype=4` automático
- Receba prêmios exclusivos

### 🌍 Multi-Região (F6)
- 6 idiomas disponíveis
- Troca de região instantânea
- Português (BR) como padrão

## ⌨️ Controles

| Tecla | Ação |
|-------|------|
| F5 | Limpar Login |
| F6 | Trocar Região |
| F7 | Trocar Perfil de Hardware |
| F11 | Tela Cheia |
| F12 | DevTools |
| ESC | Sair da Tela Cheia |

## 🌍 Regiões

| Bandeira | Idioma | Padrão |
|----------|--------|--------|
| 🇧🇷 | Português | ✅ |
| 🇺🇸 | English | |
| 🇫🇷 | Français | |
| 🇩🇪 | Deutsch | |
| 🇪🇸 | Español | |
| 🇵🇱 | Polski | |

## 🖥️ Perfis de Hardware

| Perfil | Ícone | GPU | Descrição |
|--------|-------|-----|-----------|
| **Moderno** | 🚀 | RX 6000+, RTX 3000+, GTX 1600+ | Vulkan, GPU rasterization, zero-copy |
| **Antigo** | 🔧 | GTX 900/1000, Radeon HD/RX 500, Intel HD | D3D11/OpenGL, in-process-gpu |
| **Apenas CPU** | 💻 | Sem GPU dedicada | SwiftShader (software rendering) |

Use **F7** para trocar perfis. Reinicie para aplicar.

## ⚡ Otimizações Flash 64-bit

| Otimização | Descrição |
|------------|-----------|
| **Decodificador HW** | Decodificação de vídeo por hardware |
| **4GB Heap JS** | 64-bit pode usar mais memória |
| **Staging Buffer** | Melhor performance de renderização |
| **Vídeo Multithread** | Vídeo em thread separada |
| **Cache 500MB** | Cache maior para assets do jogo |
| **50% Memória GPU** | Flash pode usar metade da GPU |
| **Plugin Power Saver** | Desativado para máxima performance |
| **Prioridade Alta** | Launcher roda com prioridade |

## 💾 Requisitos

| Requisito | Mínimo |
|-----------|--------|
| SO | Windows 7 / Linux |
| RAM | 2 GB |

⚠️ **Nota**: macOS não é suportado.

## 📦 Instalação

### Linux
```bash
chmod +x install.sh
./install.sh
```

### Windows
Extraia e execute `NarutoOnline.exe`

## 🗑️ Desinstalar

### Linux
```bash
~/.local/share/naruto-online/uninstall.sh
```

### Windows
Delete a pasta.

## ⚙️ Técnico

| Item | Detalhes |
|------|----------|
| Framework | Electron 11.5.0 |
| Chromium | 87 |
| Flash (Windows) | PPAPI 34.0.0.376 (baixado no build) |
| Flash (Linux) | PPAPI 34.0.0.137 **incluído** |
| Fonte | [darktohka/clean-flash-builds](https://github.com/darktohka/clean-flash-builds) |
| Backend GPU | D3D11 (Windows) / OpenGL (Linux) |

## 🎨 Mídia / Branding

Ícones de alta qualidade disponíveis em `/media` para criadores de conteúdo.

## 📜 Licença

MIT

## ⚠️ Aviso

Launcher não-oficial. Naruto Online é uma marca da OAS Games.
