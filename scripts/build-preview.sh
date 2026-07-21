#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Shinobi Launcher — Build single-file preview for Next.js dev server.
# Inlines variables.css + styles.css into a <style> block, then appends the
# preview-mock.js (Electron API stubs) + app.js into a <script> block.
# Output: /home/z/my-project/public/launcher.html
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

SRC_DIR="/home/z/my-project/shinobi-launcher/src/ui"
MOCK="/home/z/my-project/shinobi-launcher/__mocks__/preview-mock.js"
OUT="/home/z/my-project/public/launcher.html"

node -e '
const fs = require("fs");
const path = require("path");
const SRC = process.argv[1];
const MOCK = process.argv[2];
const OUT = process.argv[3];
let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
const vars = fs.readFileSync(path.join(SRC, "variables.css"), "utf8");
const styles = fs.readFileSync(path.join(SRC, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(SRC, "app.js"), "utf8");
let mock = "";
try { mock = fs.readFileSync(MOCK, "utf8"); } catch (e) {}

// Strip the two <link rel="stylesheet"> tags and the <script src="app.js">
html = html.replace(/<link rel="stylesheet" href="variables\.css" \/>/, "");
html = html.replace(/<link rel="stylesheet" href="styles\.css" \/>/, "");
html = html.replace(/<script src="app\.js"><\/script>/, "");

// Inject <style> block right after <title>...</title>
const styleBlock = "<style>\n" + vars + "\n" + styles + "\n</style>";
html = html.replace(/(<title>[^<]*<\/title>)/, "$1\n    " + styleBlock);

// Inject <script> block right before </body>
const scriptBlock = "<script>\n" + (mock ? mock + "\n" : "") + app + "\n</script>";
html = html.replace("</body>", "    " + scriptBlock + "\n  </body>");

fs.writeFileSync(OUT, html, "utf8");
console.log("Wrote " + OUT + " (" + html.length + " bytes)");
' "$SRC_DIR" "$MOCK" "$OUT"

echo "✓ Preview built at $OUT"
