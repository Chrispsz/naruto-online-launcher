/**
 * Single-file code review — fast, no chunking
 * Usage: node tools/code-review-single.js <relative-path>
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT = `You are a senior software architect reviewing a single file from the Shinobi Launcher (Electron-based Naruto Online launcher). Be terse, concrete, cite line numbers. Don't invent issues. If the file is clean, say so.

Output format (strict markdown):

## <filename>

**Verdict:** EXCELLENT | GOOD | NEEDS WORK | CRITICAL

**Strengths:**
- <bullet>

**Issues (sorted by severity):**
- 🔴 CRITICAL — <description> (line ~N)
- 🟡 MAJOR — <description> (line ~N)
- 🔵 MINOR — <description> (line ~N)

**Top fix:**
\`\`\`js
// concrete suggestion
\`\`\`

CONTEXT — CHEAT LINE: The launcher OBSERVES game traffic (URL/status/timing metadata only). Reading game-state response bodies = cheat. Auto-clicking, macros, auto-farm = cheat. Managing sessions, credentials, multi-profile isolation, Flash plugin loading = legitimate.`;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node code-review-single.js <relative-path>');
    process.exit(1);
  }

  const abs = path.join(__dirname, '..', file);
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs);
    process.exit(1);
  }

  const content = fs.readFileSync(abs, 'utf8');
  console.log(`Reviewing ${file} (${content.length} chars)...`);

  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Review this file:\n\n### ${file}\n\n\`\`\`js\n${content}\n\`\`\``
      }
    ],
    thinking: { type: 'disabled' }
  });

  const review = completion.choices?.[0]?.message?.content || '(no response)';
  console.log('\n' + review);

  const outDir = '/home/z/my-project/.launcher-research-backup/code-reviews';
  fs.mkdirSync(outDir, { recursive: true });
  const baseName = file.replace(/[/\\]/g, '_');
  const outPath = path.join(outDir, `${baseName}.md`);
  fs.writeFileSync(outPath, `# Code Review: ${file}\n\n**Generated:** ${new Date().toISOString()}\n\n---\n\n${review}\n`);
  console.log(`\n✓ Written: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
