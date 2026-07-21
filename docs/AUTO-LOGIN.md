# Auto-login

> How the launcher fills in your credentials automatically when the game session expires.

## Why

Oasgames sessions last ~2 hours. When a session expires, the game redirects to a login page. Without auto-login, you'd have to re-type your username and password every 2 hours — for each account.

With the vault + auto-login, you save credentials once. When the login page appears, the launcher injects them into the form and submits it automatically. You stay in the game.

## Flow

```
1. User saves credentials in the vault (modal: "Credenciais")
        │
        ▼
2. ProfileVault.encrypt(user, pass) → vault.json (AES-256-GCM)
        │
        ▼
3. User clicks "Play" → Launcher opens game window
        │
        ▼
4. did-finish-load fires → SessionLifecycle._tryAutoLogin(profileId, win)
        │
        ▼
5. ProfileVault.buildAutoLoginScript(user, pass) → JS string
        │
        ▼
6. win.webContents.executeJavaScript(script)
        │
        ▼
7. Script tries to find the login form:
   ├─ Form found → fill fields + call login function → return "filled"
   └─ Form not found (async load) → MutationObserver + poll every 250ms
        │
        ▼
8. Result sent back to main process:
   ├─ "filled"    → credentials injected, login called
   ├─ "waiting"   → watching for async form
   ├─ "not-found" → no form on page (already logged in via cookie)
   └─ "error:..." → script threw
        │
        ▼
9. ManagerWindow.send('auto-login:status', { profileId, status })
        │
        ▼
10. UI updates card status indicator (dot + label)
```

## The injected script

The script is built by `src/profiles/ProfileVault.js` → `buildAutoLoginScript(user, pass)`. It's a string of JS injected via `webContents.executeJavaScript()` into the game page's main world.

### What it does (v5.25.0 — simplified from 80 to ~30 lines)

1. **Try once immediately.** Query for the username + password fields using selectors that cover all 3 Oasis login page designs:
   - **New serverlist page**: `input[name=hd_oasun]` + `input[name=hd_oaspd]`
   - **Old serverlist page**: `input[name=oasun]` + `input[name=oaspd]`
   - **Redirected /login page**: `input[name=user_email]` + `input[name=user_password]`

2. **Fill the fields** using a React/Vue-compatible value setter:
   ```js
   var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
   (d && d.set || function(v){ this.value = v; }).call(el, v);
   el.dispatchEvent(new Event("input", { bubbles: true }));
   el.dispatchEvent(new Event("change", bubbles: true }));
   ```
   Why not just `el.value = v`? Oasis's login pages use a JS framework (jQuery + custom). Setting `.value` directly doesn't trigger the framework's change handler, so the form would submit empty. The descriptor-based setter bypasses the framework's getter/setter and fires the native `input` + `change` events, which the framework listens to.

3. **Check the "remember me" checkbox** (`#checkbox`, `#hd_checkbox`, `#checkbox_pwd`, `#checked_pwd` — varies by page design).

4. **Call the login function** in this order:
   - `window.hd_ajax_login()` (new serverlist page)
   - `window.ajax_login()` (old serverlist page)
   - Click the login button (`a.hd_login_btn`, `a.login_btn`, `.login_btn`) as a fallback.

5. **If the form wasn't found**, the page is probably still loading (Oasis loads the login form async via JS). Set up:
   - A `MutationObserver` on `document.documentElement` watching for `childList` + `subtree` changes — re-tries `doLogin()` on every DOM mutation.
   - A `setInterval` polling every 250ms as a backup (in case MutationObserver misses something).
   - Both auto-disconnect/clear after 60 attempts (~15 seconds).

### What it returns

| Return value | Meaning | UI status |
|--------------|---------|-----------|
| `"filled"` | Form found, credentials injected, login function called | `success` |
| `"waiting"` | Form not found yet, MutationObserver watching | `loading` |
| `"not-found"` | No form on page (likely already logged in via cookie) | `idle` |
| `"error:<msg>"` | Script threw an exception | `error` |

### What was removed in v5.25.0

- **Verification block** (URL-change check + error-element lookup after 5s) — never surfaced to the user, just logged. Added 15 lines of dead code.
- **Delayed retry branch** (3s timeout after 60 attempts) — redundant with MutationObserver + polling.
- **`"clicked"` return distinction** — the UI treated `"filled"` and `"clicked"` identically (both = `success`), so the distinction was meaningless.

## Loop guard

`SessionLifecycle._tryAutoLogin` tracks `entry.formInjectAttempts` per game window. If the form injection fails 5 times in a row (possible redirect loop), it stops trying — the user gets the login page and can type manually.

The counter resets to 0 on a successful `"filled"` result.

## Security

- Credentials are **never logged**. The script string contains them, but it's executed in the game page's main world (isolated from the manager process's console).
- The vault file (`vault.json`) is encrypted with AES-256-GCM + a machine-bound key (see `CryptoService.js`). A stolen vault file is useless on another machine.
- Credentials are only injected into `oasgames.com` / `naruto.oasgames.com` pages — the `will-navigate` handler in `SessionLifecycle.js` blocks injection on other domains.

## When it doesn't fire

- No credentials saved for the profile → `_tryAutoLogin` returns immediately.
- Page URL is not an Oasgames login page → script finds no form, returns `"not-found"`, no harm done.
- `formInjectAttempts > 5` → loop guard stops further attempts (possible redirect loop).
- Window destroyed mid-injection → `executeJavaScript` promise rejects, caught silently.
