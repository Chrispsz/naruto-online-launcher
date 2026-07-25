#!/usr/bin/env node
/**
 * tools/ai-eval.js — AI-powered code review pipeline para Shinobi Launcher
 *
 * Usa OpenRouter free models pra fazer code review automatizado do projeto.
 * Lê src/ (todos os .js), monta prompt, envia pra LLM, salva resultado em markdown.
 *
 * Models free disponíveis (Jul 2026, via OpenRouter):
 *   - nvidia/nemotron-3-ultra-550b-a55b:free  (1M ctx, default)
 *   - nvidia/nemotron-3-super-120b-a12b:free  (262K ctx)
 *   - google/gemma-4-31b-it:free              (262K, VLM)
 *   - poolside/laguna-m.1:free                (262K, coding)
 *   - openrouter/free                         (200K, router)
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-v1-... node tools/ai-eval.js
 *   OPENROUTER_API_KEY=sk-or-v1-... node tools/ai-eval.js --model poolside/laguna-m.1:free
 *   OPENROUTER_API_KEY=sk-or-v1-... node tools/ai-eval.js --focus security
 *   OPENROUTER_API_KEY=sk-or-v1-... node tools/ai-eval.js --list-models
 *
 * Output: .launcher-research-backup/eval-<timestamp>.md
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, '.launcher-research-backup');

const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

const FOCUS_PROMPTS = {
  all: 'Faça uma avaliação completa: arquitetura, segurança, performance, UX, code quality.',
  security: 'Foque exclusivamente em segurança: vulnerabilidades, hardening Electron, crypto, IPC, supply chain.',
  perf: 'Foque exclusivamente em performance: memory leaks, hot paths, I/O blocking, DOM thrashing.',
  ux: 'Foque exclusivamente em UX/UI: fluxo do usuário, feedback, acessibilidade, consistência visual.',
  refactor: 'Foque exclusivamente em refatoração: code smells, acoplamento, duplicação, oportunidades de extração.'
};

/**
 * Lista arquivos .js do projeto (excluindo node_modules, tests, mocks).
 */
function collectSourceFiles() {
  const excludePatterns = ['node_modules', '__tests__', '__mocks__', '.git', 'tools'];
  const cmd = `find ${PROJECT_ROOT}/src -name '*.js' -not -path '*/node_modules/*' -not -path '*__tests__*' -not -path '*__mocks__*' 2>/dev/null | sort`;
  const output = execSync(cmd, { encoding: 'utf8' });
  return output.trim().split('\n').filter(Boolean);
}

/**
 * Lê conteúdo de um arquivo com header.
 */
function readFileWithHeader(filePath) {
  const rel = path.relative(PROJECT_ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  return `\n=== ${rel} (${content.split('\n').length} lines) ===\n${content}\n`;
}

/**
 * Coleta métricas do projeto (LoC, testes, versão).
 */
function collectMetrics() {
  const files = collectSourceFiles();
  let totalLoc = 0;
  const byDir = {};
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const loc = content.split('\n').length;
    totalLoc += loc;
    const rel = path.relative(path.join(PROJECT_ROOT, 'src'), f);
    const dir = rel.split(path.sep)[0] || 'root';
    byDir[dir] = (byDir[dir] || 0) + loc;
  }

  // Conta testes
  let testCount = 0;
  try {
    const testOutput = execSync(
      `find ${PROJECT_ROOT}/src -name '*.test.js' -not -path '*/node_modules/*' 2>/dev/null | wc -l`,
      { encoding: 'utf8' }
    ).trim();
    testCount = parseInt(testOutput, 10) || 0;
  } catch (_) {}

  // Versão
  let version = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    version = pkg.version;
  } catch (_) {}

  return {
    version,
    totalFiles: files.length,
    totalLoc,
    testFiles: testCount,
    byDir
  };
}

/**
 * Monta o prompt completo para o LLM.
 */
function buildPrompt(metrics, focus, sourceContent) {
  const focusDesc = FOCUS_PROMPTS[focus] || FOCUS_PROMPTS.all;

  return `Você é um arquiteto de software sênior especializado em Electron + Node.js.
Analise criticamente o código do Shinobi Launcher abaixo e produza um review técnico.

PROJETO: Shinobi Launcher v${metrics.version}
STACK: Electron 11, vanilla JS (sem TypeScript, sem framework de state management)
MÉTRICAS: ${metrics.totalFiles} arquivos fonte, ${metrics.totalLoc} linhas de código, ${metrics.testFiles} arquivos de teste
ESTRUTURA: ${JSON.stringify(metrics.byDir, null, 2)}

FOCO DESTA AVALIAÇÃO: ${focusDesc}

FORMATO DA RESPOSTA (markdown, em português do Brasil):

## Nota: X / 10
[Justificativa concisa]

## TOP 5 Issues Concretas
| # | Issue | Severidade | Arquivo | Sugestão |
|---|-------|------------|---------|----------|
| 1 | ... | alta/média/baixa | src/... | ... |

## TOP 3 Quick Wins
[Melhorias rápidas, baixo esforço, alto impacto]

## Risks Técnicos
[Dívidas técnicas ou riscos arquiteturais]

## Veredito
[Resumo: o projeto está pronto pra produção? O que falta?]

Seja específico: cite arquivos, linhas, funções. Não genérico. Se algo está bom, diga. Se algo é crítico, diga.

=== CÓDIGO FONTE ===

${sourceContent}`;
}

/**
 * Lista modelos free disponíveis na OpenRouter.
 */
function listFreeModels(apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `${OPENROUTER_BASE}/models`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const models = parsed.data || [];
            const free = models.filter(
              (m) => m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0'
            );
            free.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
            resolve(free);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
  });
}

/**
 * Chama o LLM via OpenRouter (OpenAI-compatible API).
 */
function callLLM(apiKey, model, prompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior software architect doing a critical code review. Be concise, specific, technical. Respond in Portuguese (Brazil).'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens || 3000,
      temperature: 0.2
    });

    const req = https.request(
      `${OPENROUTER_BASE}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 300000 // 5 min
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
              return;
            }
            if (!parsed.choices || !parsed.choices[0]) {
              reject(new Error('No choices in response: ' + data.slice(0, 300)));
              return;
            }
            resolve({
              content: parsed.choices[0].message.content,
              model: parsed.model || model,
              usage: parsed.usage || {}
            });
          } catch (e) {
            reject(new Error('Parse error: ' + e.message + ' | body: ' + data.slice(0, 300)));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout (5min)'));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Main.
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse args
  let model = DEFAULT_MODEL;
  let focus = 'all';
  let listModels = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      model = args[i + 1];
      i++;
    } else if (args[i] === '--focus' && args[i + 1]) {
      focus = args[i + 1];
      i++;
    } else if (args[i] === '--list-models') {
      listModels = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: OPENROUTER_API_KEY=... node tools/ai-eval.js [options]

Options:
  --model <id>      OpenRouter model id (default: ${DEFAULT_MODEL})
  --focus <area>    all|security|perf|ux|refactor (default: all)
  --list-models     Lista modelos free disponíveis e sai
  --help            Esta ajuda

Examples:
  OPENROUTER_API_KEY=sk-... node tools/ai-eval.js
  OPENROUTER_API_KEY=sk-... node tools/ai-eval.js --focus security
  OPENROUTER_API_KEY=sk-... node tools/ai-eval.js --model poolside/laguna-m.1:free`);
      process.exit(0);
    }
  }

  if (!OPENROUTER_API_KEY) {
    console.error('ERRO: OPENROUTER_API_KEY não definida.');
    console.error('Usage: OPENROUTER_API_KEY=sk-or-v1-... node tools/ai-eval.js');
    process.exit(1);
  }

  // Modo --list-models
  if (listModels) {
    console.log('Buscando modelos free disponíveis...\n');
    try {
      const models = await listFreeModels(OPENROUTER_API_KEY);
      console.log('=== MODELOS FREE DISPONÍVEIS (' + models.length + ') ===\n');
      console.log(
        models
          .map(
            (m) =>
              `  ${m.id.padEnd(55)} ctx=${String(m.context_length || 0).padStart(9)}  mod=${(m.architecture && m.architecture.modality) || '?'}`
          )
          .join('\n')
      );
    } catch (e) {
      console.error('Falhou ao listar modelos: ' + e.message);
      process.exit(1);
    }
    process.exit(0);
  }

  if (!FOCUS_PROMPTS[focus]) {
    console.error('Foco inválido: ' + focus + '. Use: all|security|perf|ux|refactor');
    process.exit(1);
  }

  console.log('=== Shinobi Launcher AI Eval ===');
  console.log('Model: ' + model);
  console.log('Focus: ' + focus);
  console.log('');

  // Coleta arquivos
  console.log('Coletando arquivos fonte...');
  const files = collectSourceFiles();
  console.log('  ' + files.length + ' arquivos encontrados');

  // Coleta métricas
  const metrics = collectMetrics();
  console.log('  Versão: v' + metrics.version);
  console.log('  LoC total: ' + metrics.totalLoc);
  console.log('  Arquivos de teste: ' + metrics.testFiles);
  console.log('');

  // Monta conteúdo do código
  console.log('Montando prompt...');
  let sourceContent = '';
  let totalChars = 0;
  const MAX_CHARS = 900000; // ~225K tokens, deixa margem pra prompt+output (model 1M ctx)
  for (const f of files) {
    const chunk = readFileWithHeader(f);
    if (totalChars + chunk.length > MAX_CHARS) {
      console.log('  Aviso: limite de ' + MAX_CHARS + ' chars atingido, truncando em ' + f);
      sourceContent += '\n[... truncated, limite de contexto atingido ...]\n';
      break;
    }
    sourceContent += chunk;
    totalChars += chunk.length;
  }
  console.log('  Conteúdo: ' + totalChars + ' chars (~' + Math.round(totalChars / 4) + ' tokens)');
  console.log('');

  // Monta prompt
  const prompt = buildPrompt(metrics, focus, sourceContent);

  // Chama LLM
  console.log('Chamando LLM (pode levar 1-3 min)...');
  const startTime = Date.now();
  let result;
  try {
    result = await callLLM(OPENROUTER_API_KEY, model, prompt, 3000);
  } catch (e) {
    console.error('LLM call falhou: ' + e.message);
    process.exit(1);
  }
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('Resposta recebida em ' + elapsed + 's');
  console.log('  Model used: ' + result.model);
  console.log(
    '  Tokens: ' +
      (result.usage.total_tokens || '?') +
      ' (prompt=' +
      (result.usage.prompt_tokens || '?') +
      ', completion=' +
      (result.usage.completion_tokens || '?') +
      ')'
  );
  console.log('');

  // Garante dir de output
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Salva resultado
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFile = path.join(OUTPUT_DIR, `eval-${timestamp}-${focus}.md`);
  const header = `# AI Eval — Shinobi Launcher v${metrics.version} (${focus})

> Executado: ${new Date().toISOString()}
> Model: ${result.model}
> Tokens: ${result.usage.total_tokens || '?'} (prompt=${result.usage.prompt_tokens || '?'}, completion=${result.usage.completion_tokens || '?'})
> Tempo: ${elapsed}s
> Custo: $0 (free tier)
> Arquivos analisados: ${files.length} (${metrics.totalLoc} LoC)

---

`;

  fs.writeFileSync(outputFile, header + result.content, 'utf8');
  console.log('Resultado salvo em: ' + outputFile);
  console.log('');
  console.log('=== PREVIEW (primeiras 50 linhas) ===');
  console.log(result.content.split('\n').slice(0, 50).join('\n'));
  if (result.content.split('\n').length > 50) {
    console.log('\n[... ver arquivo completo no caminho acima ...]');
  }
}

main().catch(function (e) {
  console.error('Erro fatal: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
