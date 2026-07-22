/**
 * Shinobi Launcher — AI Code & UI Review
 * =======================================
 *
 * O QUE FAZ:
 *   - LLM avalia a qualidade do código fonte do launcher
 *   - VLM avalia screenshots da UI (localhost:3000) pra UI/UX
 *   - Cruza as duas visões e produz um relatório markdown acionável
 *
 * COMO USAR:
 *   node tools/ai-review.js                 # full review (código + UI)
 *   node tools/ai-review.js --code-only     # só revisão de código
 *   node tools/ai-review.js --ui-only       # só revisão de UI/UX (precisa dev server rodando)
 *   node tools/ai-review.js --file <path>   # revisa um arquivo específico
 *
 * REQUISITOS:
 *   - z-ai-web-dev-sdk instalado (já vem com o sandbox)
 *   - Para --ui-only: dev server em localhost:3000
 *
 * SAÍDA:
 *   - Console: resumo executivo
 *   - Arquivo: /home/z/my-project/.launcher-research-backup/ai-review-<timestamp>.md
 *
 * NOTA: Esse script NÃO commita nada. Resultado é interno (research backup).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SHINOBI_ROOT = path.resolve(__dirname, '..');
const RESEARCH_BACKUP = '/home/z/my-project/.launcher-research-backup';

// ── Arquivos de código que valem revisar (foco nos módulos principais) ─────
const CODE_FILES = [
  // Main entry
  'src/main.js',
  'src/preload.js',
  // App services
  'src/app/Launcher.js',
  'src/app/SessionLifecycle.js',
  'src/app/StallDetector.js',
  'src/app/CpuOptimizer.js',
  'src/app/GpuDetector.js',
  // Network
  'src/network/blocker.js',
  'src/network/inspector.js',
  'src/network/cookies.js',
  'src/network/api-login.js',
  'src/network/tempmail.js',
  // Profiles / crypto
  'src/profiles/manager.js',
  'src/profiles/store.js',
  'src/profiles/ProfileVault.js',
  'src/profiles/CryptoService.js',
  'src/profiles/PasswordManager.js',
  // Memory
  'src/memory/MemoryGuard.js',
  'src/memory/GcDaemon.js',
  // UI renderer
  'src/ui/app.js',
  // Utils
  'src/utils/EventTimers.js',
  'src/utils/jwt.js',
  'src/utils/diagnostics.js'
];

const SYSTEM_PROMPT_CODE = `You are a senior software architect reviewing an Electron-based launcher codebase (Shinobi Launcher for Naruto Online). You are strict but pragmatic — you reward clarity, defensive coding, and observable maintainability gains. You despise premature abstraction and over-engineering.

Your review focuses on:
1. ARCHITECTURE — module boundaries, separation of concerns, leaky abstractions
2. CORRECTNESS — bug risks, race conditions, edge cases (especially around Electron session lifecycle, webRequest hooks, partition isolation, async cleanup)
3. SECURITY — credential handling (AES-256-GCM + PBKDF2 vault), cookie isolation, request interception, JWT decoding (never validation)
4. PERFORMANCE — sync I/O in hot paths, memory leaks (setInterval/addEventListener without cleanup), redundant work
5. CLARITY — naming, dead code, redundant comments, naming consistency

CRITICAL CONTEXT — CHEAT LINE:
- The launcher OBSERVES game traffic (URL/status/timing metadata only). Reading game-state response bodies = cheat. Auto-clicking, macros, auto-farm = cheat.
- The launcher DOES manage sessions, credentials, multi-profile isolation, Flash plugin loading. All legitimate.
- When evaluating security/privacy, respect this distinction.

OUTPUT FORMAT (strict markdown):
For each file you review, produce:

## <relative path>

**Verdict:** <EXCELLENT | GOOD | NEEDS WORK | CRITICAL>

**Strengths:**
- <bullet>

**Issues (sorted by severity):**
- 🔴 **CRITICAL** — <description> (line ~N)
- 🟡 **MAJOR** — <description> (line ~N)
- 🔵 **MINOR** — <description> (line ~N)

**Suggested fix (for the top issue only):**
\`\`\`js
// concrete code suggestion
\`\`\`

If a file is genuinely clean, say so and move on — don't invent issues. NEVER suggest abstractions "for the future" without a concrete current need. Be terse.`;

const SYSTEM_PROMPT_UI = `You are a senior product designer reviewing a desktop launcher UI (Electron-rendered HTML). The design system is AMOLED black + shinobi gold (#d4a543). Target audience: Brazilian PC gamers running Naruto Online (a Flash game). Language is bilingual EN+PT.

Your review focuses on:
1. VISUAL HIERARCHY — does the eye know where to land? Is the primary action obvious?
2. INFORMATION DENSITY — too sparse? Too cluttered? Are 4-6 account cards + an events panel + a settings panel coexisting gracefully?
3. ACCESSIBILITY — contrast ratios on AMOLED black, focus rings, keyboard navigation, touch targets (this is a PC launcher — mouse first, but keyboard should work)
4. CONSISTENCY — spacing scale, color usage, button states, icon style (Lucide-style line icons)
5. EMPTY/ERROR STATES — what happens with 0 accounts? 0 events? After a crash?
6. TRUST SIGNALS — does the launcher feel safe to type passwords into? (it has an encrypted vault)

OUTPUT FORMAT (strict markdown):

## UI/UX Review

**Overall impression:** <2-3 sentences>

**What's working:**
- <bullet>

**Top 5 issues (sorted by impact):**
1. 🔴 <issue> — <why it matters> — <concrete fix>
2. 🟡 ...
3. 🟡 ...
4. 🔵 ...
5. 🔵 ...

**Layout polish suggestions:**
- <bullet>

**Visual hierarchy audit:**
- Primary action: <is it obvious?>
- Secondary actions: <are they discoverable?>
- Danger zones: <are destructive actions properly gated?>

Be specific — refer to visible elements, not abstract principles. If you can read text in the screenshot, quote it.`;

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readSnippet(filePath, maxBytes = 16000) {
  const abs = path.join(SHINOBI_ROOT, filePath);
  if (!fs.existsSync(abs)) return null;
  const stat = fs.statSync(abs);
  if (stat.size > maxBytes * 4) {
    // Too big — send just the head + tail with a marker in the middle
    const content = fs.readFileSync(abs, 'utf8');
    const head = content.slice(0, maxBytes);
    const tail = content.slice(-maxBytes);
    return head + '\n\n/* ─── MIDDLE OF FILE TRUNCATED ─── */\n\n' + tail;
  }
  return fs.readFileSync(abs, 'utf8');
}

async function reviewCodeWithLLM(zai, files) {
  console.log('\n━━━ CODE REVIEW ━━━');
  console.log(`Reviewing ${files.length} files with LLM...\n`);

  // Batch files into chunks of ~3 to keep prompts manageable
  const chunks = [];
  for (let i = 0; i < files.length; i += 3) {
    chunks.push(files.slice(i, i + 3));
  }

  const sections = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    console.log(`  [${idx + 1}/${chunks.length}] ${chunk.join(', ')}`);

    const fileBlocks = chunk
      .map((f) => {
        const content = readSnippet(f);
        if (!content) return `### ${f}\n(FILE NOT FOUND)`;
        return `### ${f}\n\n\`\`\`js\n${content}\n\`\`\``;
      })
      .join('\n\n---\n\n');

    const userPrompt = `Review the following ${chunk.length === 1 ? 'file' : 'files'} from the Shinobi Launcher codebase. Be specific, terse, and concrete. Cite line numbers when you spot issues.

${fileBlocks}`;

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_CODE },
          { role: 'user', content: userPrompt }
        ],
        thinking: { type: 'disabled' }
      });
      const review = completion.choices?.[0]?.message?.content || '(no response)';
      sections.push(review);
    } catch (err) {
      sections.push(`## (chunk ${idx + 1} failed)\n\nError: ${err.message}`);
    }

    // Small delay between chunks to be polite
    if (idx < chunks.length - 1) await new Promise((r) => setTimeout(r, 500));
  }

  return sections.join('\n\n---\n\n');
}

async function captureScreenshot(url) {
  // Use agent-browser to capture a screenshot of the URL
  const { execSync } = require('child_process');
  const tmpPath = path.join(require('os').tmpdir(), `shinobi-ui-${Date.now()}.png`);
  console.log(`  Capturing screenshot of ${url}...`);
  try {
    execSync(`agent-browser open "${url}"`, { stdio: 'pipe', timeout: 30000 });
    // Give the page a moment to settle (it has CSS transitions + JS render)
    execSync('sleep 1', { stdio: 'pipe', timeout: 5000 });
    execSync(`agent-browser screenshot "${tmpPath}"`, { stdio: 'pipe', timeout: 30000 });
    if (!fs.existsSync(tmpPath)) throw new Error('screenshot file not created');
    console.log(`  Screenshot saved: ${tmpPath} (${(fs.statSync(tmpPath).size / 1024).toFixed(1)} KB)`);
    return tmpPath;
  } catch (err) {
    console.error(`  Screenshot failed: ${err.message}`);
    return null;
  }
}

function imageToBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}

async function reviewUIWithVLM(zai, screenshotPath) {
  console.log('\n━━━ UI/UX REVIEW ━━━');
  if (!screenshotPath || !fs.existsSync(screenshotPath)) {
    return '## UI/UX Review\n\n(Screenshot capture failed — skipping VLM review. Make sure the dev server is running on localhost:3000 and agent-browser is available.)';
  }

  console.log('  Sending screenshot to VLM...');
  const b64 = imageToBase64(screenshotPath);
  const dataUrl = `data:image/png;base64,${b64}`;

  try {
    const completion = await zai.chat.completions.createVision({
      model: 'glm-4.6v',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_UI },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'This is a screenshot of the Shinobi Launcher UI (rendered in a browser preview). Review it as a senior product designer. The actual desktop app uses the same HTML/CSS but renders in an Electron BrowserWindow at 1000x760.'
            },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      thinking: { type: 'disabled' }
    });
    return completion.choices?.[0]?.message?.content || '(no VLM response)';
  } catch (err) {
    return `## UI/UX Review\n\n(VLM call failed: ${err.message})`;
  }
}

async function synthesizeReport(zai, codeReview, uiReview) {
  console.log('\n━━━ SYNTHESIS ━━━');
  console.log('  Cross-referencing code + UI reviews...');

  const userPrompt = `You are the lead architect of the Shinobi Launcher. Your team just ran an automated AI review (LLM on code, VLM on UI). Your job: synthesize both into ONE actionable executive summary.

Below are the raw reviews. Produce a final report with these sections:

## Executive Summary
<3-5 sentences: overall health, top 3 wins, top 3 risks>

## Top 10 Actions (sorted by ROI)
For each: priority (P0/P1/P2), effort (S/M/L), expected impact, and a one-line description.
Format as a markdown table.

## Architecture Wins
<what's already excellent — preserve this>

## Architecture Debt
<what's tech debt worth paying down — concrete, not abstract>

## UI/UX Quick Wins
<3-5 polish items that are visually obvious from the VLM review>

## Avoid / Don't Touch
<what's working that a junior dev might "refactor" and break>

## Cheat-Line Audit
<confirm the code reviews didn't suggest anything that crosses the cheat line. If they did, flag it explicitly.>

RAW CODE REVIEW:
${codeReview}

---

RAW UI/UX REVIEW:
${uiReview}

---

Be honest. If the codebase is in great shape, say so. Don't invent work to justify the review.`;

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a lead software architect synthesizing AI review reports.' },
        { role: 'user', content: userPrompt }
      ],
      thinking: { type: 'disabled' }
    });
    return completion.choices?.[0]?.message?.content || '(no synthesis response)';
  } catch (err) {
    return `(synthesis failed: ${err.message})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const codeOnly = args.includes('--code-only');
  const uiOnly = args.includes('--ui-only');
  const fileArgIdx = args.indexOf('--file');
  const singleFile = fileArgIdx >= 0 ? args[fileArgIdx + 1] : null;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Shinobi Launcher — AI Code & UI Review                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  ensureDir(RESEARCH_BACKUP);

  let ZAI;
  try {
    ZAI = (await import('z-ai-web-dev-sdk')).default;
  } catch (err) {
    console.error('Failed to import z-ai-web-dev-sdk:', err.message);
    process.exit(1);
  }
  const zai = await ZAI.create();

  let codeReview = '(skipped)';
  let uiReview = '(skipped)';

  // ── Code review ──
  if (!uiOnly) {
    const files = singleFile ? [singleFile] : CODE_FILES;
    codeReview = await reviewCodeWithLLM(zai, files);
  }

  // ── UI review ──
  if (!codeOnly) {
    const previewUrl = 'http://localhost:3000/launcher.html';
    const screenshotPath = await captureScreenshot(previewUrl);
    uiReview = await reviewUIWithVLM(zai, screenshotPath);
  }

  // ── Synthesis ──
  let synthesis = '(skipped)';
  if (!codeOnly && !uiOnly) {
    synthesis = await synthesizeReport(zai, codeReview, uiReview);
  }

  // ── Write report ──
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(RESEARCH_BACKUP, `ai-review-${ts}.md`);
  const report = `# Shinobi Launcher — AI Review Report

**Generated:** ${new Date().toISOString()}
**Scope:** ${singleFile ? `Single file: ${singleFile}` : `${CODE_FILES.length} source files + UI screenshot`}
**Mode:** ${codeOnly ? 'Code only' : uiOnly ? 'UI only' : 'Full (code + UI + synthesis)'}

---

${synthesis !== '(skipped)' ? synthesis : ''}

${!codeOnly && !uiOnly ? '---\n\n# Raw Code Review\n\n' + codeReview + '\n\n---\n\n# Raw UI/UX Review\n\n' + uiReview : (codeOnly ? '# Code Review\n\n' + codeReview : '# UI/UX Review\n\n' + uiReview)}

---

*This report was generated automatically by \`tools/ai-review.js\`. It does NOT commit any changes — it is internal research. Read it, decide what to act on, and execute manually.*
`;
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n✓ Report written: ${reportPath}`);
  console.log(`  Size: ${(fs.statSync(reportPath).size / 1024).toFixed(1)} KB`);

  // ── Console summary ──
  console.log('\n━━━ DONE ━━━');
  if (synthesis !== '(skipped)') {
    console.log('\nExecutive summary preview (first 800 chars of synthesis):\n');
    console.log(synthesis.slice(0, 800));
    if (synthesis.length > 800) console.log('\n[... truncated — see full report]');
  }
  console.log(`\nFull report: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
