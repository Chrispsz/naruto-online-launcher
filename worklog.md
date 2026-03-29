# Naruto Online Launcher - Worklog

## 📋 Informações do Projeto

| Campo | Valor |
|-------|-------|
| **Nome** | Naruto Online Launcher |
| **Versão** | v1.6.0 |
| **Tipo** | Electron App (Flash Game Launcher) |
| **Repositório** | https://github.com/Chrispsz/naruto-online-launcher |
| **Branch** | main (única) |

---

## 📅 v1.6.0 - Correções Críticas

### ✅ Fase 1 - Segurança e Estabilidade

| Problema | Correção |
|----------|----------|
| `ignore-certificate-errors` | REMOVIDO - segurança SSL |
| `disable-compositor` | REMOVIDO - causava tela preta |
| `disable-frame-rate-limit` | REMOVIDO - desperdício CPU/GPU |
| `use-angle=vulkan` | Trocado por D3D11/GL - estabilidade |
| `catch(e){}` vazio | Adicionado logging em todos |
| `mms.cfg` path errado | Corrigido para path do sistema |

### ✅ Fase 2 - Otimizações

| Melhoria | Descrição |
|----------|-----------|
| `ppapi-flash-args` expandido | +4 flags de otimização |
| `disk-cache-size` | 500MB cache |
| `BLOCK_LIST` | Set para O(1) lookup |
| `setWindowOpenHandler` | Navega na mesma janela |

### ✅ Fase 2 - Limpeza

| Arquivo | Ação |
|---------|------|
| `assets/icon.png` | 16MB → 372KB |
| `linux/icon.png` | Removido (duplicado) |
| `flash/*.so` | Removido do repo |
| `workflows/` | Unificado em build-release.yml |

---

## 🎮 Features v1.6.0

- ✅ SINGLE WINDOW (não multi-contas)
- ✅ Flash PPAPI otimizado para 64-bit
- ✅ Perfis de Hardware: Moderno, Antigo, CPU Only
- ✅ Logging em todos os erros
- ✅ Navegação na mesma janela
- ✅ Cookies persistentes (1 ano)
- ✅ logintype=4 automático
- ✅ Multi-região (6 idiomas)
- ✅ F12 para DevTools

### Controles
| Tecla | Ação |
|-------|------|
| F5 | Limpar Login |
| F6 | Trocar Região |
| F7 | Trocar Perfil de Hardware |
| F11 | Tela Cheia |
| F12 | DevTools |

---

## 📁 Estrutura

```
naruto-online-launcher/
├── src/main.js              # Código principal
├── assets/
│   ├── icon.png             # 512x512 (372KB)
│   └── icon.ico
├── flash/                   # .gitignore'd (baixado no CI)
├── linux/
│   ├── install.sh
│   └── uninstall.sh
├── media/                   # Branding assets
├── .github/workflows/
│   └── build-release.yml    # Único workflow
└── package.json
```

---

## 🔧 Build

```bash
npm install
npm start        # Desenvolvimento
npm run build    # Linux + Windows
```

---

## 🚫 Removidos de Propósito
- Multi-contas/abas
- Autoclicker
- Ruffle (não funciona com Naruto Online)

---

## 📅 Limpeza de Tags e Actions

### ✅ Tags Deletadas (Local + Remoto)
- v1.0.0, v1.1.0, v1.2.0, v1.3.0, v1.4.0
- v1.5.0, v1.5.1, v1.5.2, v1.5.3

### ✅ README-ptbr.md Atualizado
- Removidas referências a multi-contas (Ctrl+T)
- Removidas referências a autoclicker (F8)
- Removido F4 para sair
- Sincronizado com README.md em inglês
- Adicionado F12 para DevTools
- Adicionado F7 para trocar perfil de hardware

### ✅ Workflow
- Único workflow: `.github/workflows/build-release.yml`
- Disparado por tags `v*` ou manualmente
