#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Shinobi Launcher — Script de Publicação Segura
# ═══════════════════════════════════════════════════════════════════════════
#
# PROBLEMA: Não é seguro colar o GitHub Personal Access Token (PAT) no chat.
# SOLUÇÃO: Este script roda NA SUA MÁQUINA. Você cola o token apenas aqui,
#          ele configura o remote com URL mascarada e dispara o push que
#          aciona o GitHub Actions para build multi-OS.
#
# USO:
#   1. Salve este arquivo como ~/shinobi-publish.sh
#   2. Crie um PAT em: github.com/settings/tokens (escopo: repo + workflow)
#   3. Edite as 3 variáveis abaixo (USER, REPO, TOKEN)
#   4. chmod +x ~/shinobi-publish.sh && ./shinobi-publish.sh
#
# O QUE ELE FAZ:
#   - Valida que você está na pasta certa do projeto
#   - Configura o remote origin (sem vazar o token no terminal)
#   - Faz commit de todas as mudanças v2.1
#   - Cria uma tag v2.1.0
#   - Push → dispara o workflow .github/workflows/build-release.yml
#   - Build AppImage (Linux) + Portable EXE (Windows) em paralelo
#   - Auto-update dos links de download no README
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── CONFIGURE ESTAS 3 VARIÁVEIS ──────────────────────────────────────────
GITHUB_USER="Chrispsz"                                    # seu usuário GitHub
REPO_NAME="naruto-online-launcher"                        # nome do repo
# Token: NUNCA suba isso pro git. Leia de variável de ambiente ou cole aqui.
GH_TOKEN="${SHINOBI_GH_TOKEN:-ghp_SEU_TOKEN_AQUI}"        # substitua ou export SHINOBI_GH_TOKEN=...
# ──────────────────────────────────────────────────────────────────────────

# Cores
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🍥 Shinobi Launcher — Publicação Segura v2.1${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"

# Validações
if [[ "$GH_TOKEN" == "ghp_SEU_TOKEN_AQUI" ]]; then
  echo -e "${RED}❌ ERRO: configure GH_TOKEN no script ou rode com SHINOBI_GH_TOKEN=... $0${NC}"
  echo -e "   Crie o token em: ${YELLOW}https://github.com/settings/tokens${NC} (escopo repo + workflow)"
  exit 1
fi

if [[ ! -f "package.json" ]] || ! grep -q '"naruto-online-launcher"' package.json 2>/dev/null; then
  echo -e "${RED}❌ ERRO: rode este script na raiz do repositório naruto-online-launcher${NC}"
  echo -e "   (onde está o package.json)"
  exit 1
fi

if ! command -v git &>/dev/null; then
  echo -e "${RED}❌ git não instalado${NC}"; exit 1
fi

# Versão do package.json
VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✓${NC} Versão detectada: ${YELLOW}v${VERSION}${NC}"

# Configura remote (URL mascarada — token aparece no .git/config mas não no output)
REMOTE_URL="https://${GITHUB_USER}:${GH_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"
MASKED_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo -e "${GREEN}✓${NC} Configurando remote origin → ${MASKED_URL} (token oculto)"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"

# Branch atual
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo -e "${GREEN}✓${NC} Branch: ${YELLOW}${BRANCH}${NC}"

# Status
echo -e "${CYAN}── Mudanças pendentes ──${NC}"
git status --short
echo ""

# Confirmação
read -p "Commitar tudo e disparar push para ${MASKED_URL}? (s/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
  echo -e "${YELLOW}Cancelado.${NC}"
  git remote remove origin
  exit 0
fi

# Commit
echo -e "${CYAN}── Commitando ──${NC}"
git add -A
git commit -m "feat: v${VERSION} — Multi-perfil + MemoryGuard adaptativo + Tray autônomo

- ProfileStore (profiles/store.js): armazenamento atômico com backup .bak,
  schema validation, export/import JSON para portabilidade Win<->Linux
- MemoryGuard (memory/guard.js): 2 camadas efetivas (clearCache + OS trim),
  Modo Batata auto-detectado (RAM < 4GB), throttle anti-thrashing
- EventTimers (utilities/event-timers.js): conversão matematica de fusos
  para BR/NA/EU/HK, mute global, notificacoes nativas
- main.js v2.1: flags agressivas Chromium (disable-background-networking,
  component-update, renderer-backgrounding), System Tray autonomo quando
  jogo abre (libera ~45MB RAM para o jogo)
- DROP Shinobi Tunnel: complexidade alta, valor real baixo (CSS injection
  fragil, deteccao OBS platform-fragile)" || true

# Tag (dispara o workflow build-release.yml)
TAG="v${VERSION}"
echo -e "${CYAN}── Criando tag ${TAG} ──${NC}"
git tag -d "$TAG" 2>/dev/null || true
git tag -a "$TAG" -m "Shinobi Launcher ${TAG}"

# Push (mascara token em qualquer output de erro)
echo -e "${CYAN}── Push (dispara GitHub Actions) ──${NC}"
git push -u origin "$BRANCH" 2>&1 | sed "s|${GH_TOKEN}|***TOKEN_OCULTO***|g"
git push origin "$TAG" 2>&1 | sed "s|${GH_TOKEN}|***TOKEN_OCULTO***|g"

# Limpa token do remote (deixa apenas a URL pública para futuros fetches)
git remote set-url origin "$MASKED_URL"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Push concluído!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Acompanhe o build em:"
echo -e "  ${CYAN}https://github.com/${GITHUB_USER}/${REPO_NAME}/actions${NC}"
echo ""
echo -e "Quando o build terminar (~8 min), os assets estarão em:"
echo -e "  ${CYAN}https://github.com/${GITHUB_USER}/${REPO_NAME}/releases/tag/${TAG}${NC}"
echo ""
echo -e "O README será atualizado automaticamente com os novos links de download."
echo ""
echo -e "${YELLOW}⚠  IMPORTANTE:${NC} o token foi removido do remote, mas pode estar no"
echo -e "   histórico do shell. Rode: ${CYAN}history -c && rm -f ~/.git-credentials${NC}"
echo -e "   se quiser limpar completamente."
