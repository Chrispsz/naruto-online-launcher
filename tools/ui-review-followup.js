/**
 * Quick UI re-review after improvements
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT = `You are a senior product designer doing a quick FOLLOW-UP review. The dev team already applied your previous suggestions. Your job: verify if the fixes are effective and surface anything new.

Be terse. Output:

## Follow-up Review

**Fixes verified:**
- ✅/⚠️/❌ <fix> — <observation>

**New observations:**
- <bullet>

**Verdict:** <IMPROVED | SAME | REGRESSED> — <one line>`;

async function main() {
  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();

  const screenshotPath = '/tmp/shinobi-v2-final.png';
  if (!fs.existsSync(screenshotPath)) {
    console.error('Screenshot not found');
    process.exit(1);
  }

  const b64 = fs.readFileSync(screenshotPath).toString('base64');

  console.log('Sending updated screenshot to VLM...');

  const completion = await zai.chat.completions.createVision({
    model: 'glm-4.6v',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'PREVIOUSLY you flagged these issues on the Shinobi Launcher Accounts tab:\n1. Delete button had no visual warning\n2. Action buttons fought for attention (4 per card)\n3. "Nova conta" button was visually weak\n\nThe dev team applied:\n- Delete button now has a btn-danger-ghost class (red on hover, distinct from other ghost buttons)\n- Progressive disclosure already existed (secondary actions at opacity 0.6, full on hover) — verified in CSS\n- Empty state now has a shuriken SVG mark + the primary CTA has a gold glow box-shadow\n\nThis is the updated Accounts tab. Verify the fixes.'
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${b64}` }
          }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  const review = completion.choices?.[0]?.message?.content || '(no response)';
  console.log('\n' + review);

  const outPath = '/home/z/my-project/.launcher-research-backup/ui-review-followup.md';
  fs.writeFileSync(outPath, `# Shinobi Launcher — UI/UX Follow-up Review\n\n**Generated:** ${new Date().toISOString()}\n**VLM:** glm-4.6v\n\n---\n\n${review}\n`);
  console.log(`\n✓ Written to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
