/**
 * Quick UI review — sends both screenshots (accounts + settings) to VLM
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT_UI = `You are a senior product designer reviewing a desktop launcher UI (Electron-rendered HTML). The design system is AMOLED black + shinobi gold (#d4a543). Target audience: Brazilian PC gamers running Naruto Online (a Flash game). Language is bilingual EN+PT.

Your review focuses on:
1. VISUAL HIERARCHY — does the eye know where to land? Is the primary action obvious?
2. INFORMATION DENSITY — too sparse? Too cluttered?
3. ACCESSIBILITY — contrast ratios on AMOLED black, focus rings, keyboard nav, touch targets
4. CONSISTENCY — spacing scale, color usage, button states, icon style
5. EMPTY/ERROR STATES — what happens with 0 accounts? 0 events?
6. TRUST SIGNALS — does the launcher feel safe to type passwords into?

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

async function main() {
  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();

  const accountsPath = '/tmp/shinobi-accounts.png';
  const settingsPath = '/tmp/shinobi-settings.png';

  if (!fs.existsSync(accountsPath) || !fs.existsSync(settingsPath)) {
    console.error('Screenshots not found');
    process.exit(1);
  }

  const accountsB64 = fs.readFileSync(accountsPath).toString('base64');
  const settingsB64 = fs.readFileSync(settingsPath).toString('base64');

  console.log('Sending 2 screenshots to VLM (glm-4.6v)...');

  const completion = await zai.chat.completions.createVision({
    model: 'glm-4.6v',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_UI },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'I am sharing TWO screenshots of the Shinobi Launcher UI (Electron desktop app for Naruto Online).\n\nScreenshot 1: The "Contas" (Accounts) tab — shows a list of demo accounts (Anbu_NA, Genin_HK, Hokage_BR, Jounin_BR, etc.) with action buttons (Jogar/Play, Editar/Edit, Credenciais/Credentials, Excluir/Delete) and a "Nova conta" (New account) button at top.\n\nScreenshot 2: The "Configurações" (Settings) tab — shows optimization presets, hardware detection, language picker, and an About card at the bottom.\n\nReview BOTH screenshots together. The design system is AMOLED black + shinobi gold. Target audience: Brazilian PC gamers. Bilingual EN+PT.'
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${accountsB64}` }
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${settingsB64}` }
          }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  const review = completion.choices?.[0]?.message?.content || '(no response)';
  console.log('\n' + review);

  const outPath = '/home/z/my-project/.launcher-research-backup/ui-review-quick.md';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `# Shinobi Launcher — UI/UX Quick Review\n\n**Generated:** ${new Date().toISOString()}\n**VLM:** glm-4.6v\n**Inputs:** 2 screenshots (accounts + settings tabs)\n\n---\n\n${review}\n`);
  console.log(`\n✓ Written to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
