# Security Policy — Shinobi Launcher

## Supported Versions

| Version | Supported | Status |
|---------|-----------|--------|
| 1.4.x   | ✅        | Active development |
| 1.0–1.3 | ✅        | Maintenance (security fixes only) |
| < 1.0   | ❌        | End of life |

## Known security considerations

### Electron 11.5.0 (EOL)

Electron 11.5.0 is End-of-Life. We use it because it's the **last version with Pepper Flash PPAPI support**. Flash is required by Naruto Online (Oasgames).

**Mitigations:**
- `--no-sandbox` is required for PPAPI injection (documented Chromium limitation, not a launcher vulnerability).
- `--always-authorize-plugins` ensures Flash loads without user interaction.
- Network requests are filtered by `network/blocker.js` (tracker domains blocked at the WebRequest level).
- `contextIsolation: true` and `nodeIntegration: false` on all game windows — the renderer can't access Node APIs.
- The launcher only loads `naruto.oasgames.com` and `narutowebgame.com` (trusted game domains). No arbitrary browsing is possible.

**Risk:** Chromium 87 has known CVEs, but the attack surface is limited to the two trusted game domains. A vulnerability in the game's SWF could still execute Flash bytecode in the PPAPI sandbox.

### Vault key derivation (v3.6+, current)

Credentials are encrypted with **AES-256-GCM**. The key is derived via:

```
key = PBKDF2(machineSeed, salt, 100000, 'sha512', 32)
machineSeed = hostname + username + userDataPath + launcherVersion
salt = 32 random bytes (persisted in vault.salt, unique per installation)
```

- **Machine-bound**: the key only works on the machine that created the vault. A stolen `vault.json` is useless on another machine.
- **Salted**: each installation has a unique salt, so identical credentials on two machines produce different ciphertexts.
- **PBKDF2 100k iterations**: brute-force is computationally expensive even if the machineSeed is guessed.

**Before v3.6:** Key was `SHA-256(hostname+username+userDataPath)` — deterministic, no salt. Upgraded in v3.6.

### Auto-login injection

Credentials are injected into the login form via `webContents.executeJavaScript()` in the game page's main world. The script:

- Only runs on `oasgames.com` / `naruto.oasgames.com` pages (the `will-navigate` handler blocks injection on other domains).
- Never logs credential values — the script string contains them, but it executes in the renderer's main world, isolated from the manager process's console.
- Uses a React/Vue-compatible value setter (descriptor-based) to trigger the framework's change handlers — setting `.value` directly would submit an empty form.

See **[docs/AUTO-LOGIN.md](docs/AUTO-LOGIN.md)** for the full flow.

### Diagnostics export

Settings → Advanced → Export diagnostics (.zip) includes:
- Launcher logs (rotated, last 7 days).
- `config.json` (with all credential fields redacted).
- System info (OS, CPU, RAM, GPU vendor — no serial numbers).
- Flash plugin version + path.

**Never includes:** credentials, cookies, session tokens, or anything from the vault.

### Telemetry

**None.** The launcher does not phone home — no crash reporter, no usage analytics, no auto-update checks. Everything stays local.

## Reporting a vulnerability

Email: **security@chrispsz.dev** (or open a private security advisory on GitHub).

**Response time:** 48h.

Please include:
1. Launcher version (Settings → About).
2. OS + version.
3. Steps to reproduce.
4. Impact assessment (what an attacker could do).
