#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Shinobi Launcher — Secure Publish Script
# ═══════════════════════════════════════════════════════════════════════════
#
# PROBLEM: It is unsafe to paste a GitHub Personal Access Token (PAT) into chat.
# SOLUTION: Run this script on YOUR machine. Paste the token only here; it
#           configures the remote with a masked URL and triggers the push that
#           fires GitHub Actions for the multi-OS build.
#
# USAGE:
#   1. Save this file as ~/shinobi-publish.sh
#   2. Create a PAT at: github.com/settings/tokens (scopes: repo + workflow)
#   3. Edit the 3 variables below (USER, REPO, TOKEN)
#   4. chmod +x ~/shinobi-publish.sh && ./shinobi-publish.sh
#
# WHAT IT DOES:
#   - Validates you are in the correct project directory
#   - Configures the origin remote (token never leaked to terminal)
#   - Commits all pending changes
#   - Creates a tag v<version>
#   - Push → triggers .github/workflows/build-release.yml
#   - Builds AppImage (Linux) + Portable EXE (Windows) in parallel
#   - Auto-updates download links in README
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── CONFIGURE THESE 3 VARIABLES ──────────────────────────────────────────
GITHUB_USER="Chrispsz"                                    # your GitHub username
REPO_NAME="naruto-online-launcher"                        # repo name
# Token: NEVER commit this. Read from env var or paste here.
GH_TOKEN="${SHINOBI_GH_TOKEN:-ghp_YOUR_TOKEN_HERE}"        # replace, or: export SHINOBI_GH_TOKEN=...
# ──────────────────────────────────────────────────────────────────────────

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🍥 Shinobi Launcher — Secure Publish${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"

# Validations
if [[ "$GH_TOKEN" == "ghp_YOUR_TOKEN_HERE" ]]; then
  echo -e "${RED}❌ ERROR: configure GH_TOKEN in the script, or run with SHINOBI_GH_TOKEN=... $0${NC}"
  echo -e "   Create the token at: ${YELLOW}https://github.com/settings/tokens${NC} (scopes: repo + workflow)"
  exit 1
fi

if [[ ! -f "package.json" ]] || ! grep -q '"naruto-online-launcher"' package.json 2>/dev/null; then
  echo -e "${RED}❌ ERROR: run this script from the naruto-online-launcher repo root${NC}"
  echo -e "   (the directory containing package.json)"
  exit 1
fi

if ! command -v git &>/dev/null; then
  echo -e "${RED}❌ git not installed${NC}"; exit 1
fi

# Version from package.json
VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✓${NC} Detected version: ${YELLOW}v${VERSION}${NC}"

# Configure remote (masked URL — token appears in .git/config but not in output)
REMOTE_URL="https://${GITHUB_USER}:${GH_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"
MASKED_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo -e "${GREEN}✓${NC} Configuring origin remote → ${MASKED_URL} (token hidden)"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"

# Current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo -e "${GREEN}✓${NC} Branch: ${YELLOW}${BRANCH}${NC}"

# Status
echo -e "${CYAN}── Pending changes ──${NC}"
git status --short
echo ""

# Confirmation
read -p "Commit all and push to ${MASKED_URL}? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Cancelled.${NC}"
  git remote remove origin
  exit 0
fi

# Commit (auto-generated message — edit as needed for your release)
echo -e "${CYAN}── Committing ──${NC}"
git add -A
git commit -m "release: v${VERSION}" || true

# Tag (triggers build-release.yml workflow)
TAG="v${VERSION}"
echo -e "${CYAN}── Creating tag ${TAG} ──${NC}"
git tag -d "$TAG" 2>/dev/null || true
git tag -a "$TAG" -m "Shinobi Launcher ${TAG}"

# Push (mask token in any error output)
echo -e "${CYAN}── Push (triggers GitHub Actions) ──${NC}"
git push -u origin "$BRANCH" 2>&1 | sed "s|${GH_TOKEN}|***TOKEN_HIDDEN***|g"
git push origin "$TAG" 2>&1 | sed "s|${GH_TOKEN}|***TOKEN_HIDDEN***|g"

# Clean token from remote (leave only the public URL for future fetches)
git remote set-url origin "$MASKED_URL"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Push complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "Track the build at:"
echo -e "  ${CYAN}https://github.com/${GITHUB_USER}/${REPO_NAME}/actions${NC}"
echo ""
echo "When the build finishes (~8 min), assets will be at:"
echo -e "  ${CYAN}https://github.com/${GITHUB_USER}/${REPO_NAME}/releases/tag/${TAG}${NC}"
echo ""
echo "README will be auto-updated with the new download links."
echo ""
echo -e "${YELLOW}⚠  IMPORTANT:${NC} token was removed from the remote, but may linger in"
echo -e "   shell history. Run: ${CYAN}history -c && rm -f ~/.git-credentials${NC}"
echo -e "   to fully purge it."
