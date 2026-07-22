# AI APIs Gratuitas — Pesquisa (Julho 2026)

> Objetivo: encontrar LLMs e VLMs gratuitos capazes o suficiente pra avaliar
> o Shinobi Launcher (code review, refactor suggestions, UI/UX critique via
> screenshots). Pesquisa feita via web-search em 2026-07-22.
>
> **STATUS: research only — nada aqui foi integrado ao projeto.**
> Commitar só mediante autorização explícita do usuário.

---

## TL;DR — Recomendação prática

| Uso | Melhor opção free | Por quê |
|-----|-------------------|---------|
| **LLM p/ code review + refactor** | **OpenRouter free tier** | 1 API key, 20+ modelos grátis (Kimi K2.6, DeepSeek R1, Qwen3, GLM), ~1000 req/dia agregado, sem cartão |
| **LLM p/ coding pesado (1-shot)** | **DeepSeek direto** | 5M tokens de signup credit (one-time), modelo top em SWE-Bench (80.6%), preço pago mais baixo do mercado depois |
| **VLM p/ UI/UX (screenshots)** | **Google Gemini Flash** | Multimodal nativo, free tier 5K req/mês, sem cartão, analisa imagem + texto junto |
| **VLM p/ UI/UX (backup)** | **Kimi K2.6 free no OpenRouter** | Multimodal, mesma API OpenRouter, não consome quota Gemini |

**Stack recomendada pra avaliar o projeto:**
1. OpenRouter (LLM) — alimentar `src/` inteiro num contexto de 1M tokens (Kimi K2.6)
2. Gemini Flash (VLM) — screenshot de cada tela do launcher → crítica de UI/UX
3. DeepSeek (LLM coding) — refatorações profundas específicas

---

## 1. LLMs Gratuitos (text-only / code)

### 1.1 OpenRouter — Free Tier ⭐ RECOMENDADO
- **URL**: https://openrouter.ai/collections/free-models
- **Setup**: 1 API key, sem cartão de crédito
- **Modelos free (Jul 2026)**: ~20 modelos, incluindo:
  - `moonshotai/kimi-k2.6:free` — multimodal, long-horizon coding, UI/UX generation
  - `deepseek/deepseek-r1-0528:free` — 20 RPM, reasoning forte
  - `qwen3-coder-480b:free` — coding especializado
  - `zhipuai/glm-*:free` — GLM-4.6
  - `meta-llama/llama-4-*:free`
  - `openrouter/free` — router que balanceia entre todos os free
- **Limites**: ~1000 requests/dia agregado entre todos os free models
- **API**: OpenAI-compatible (`/v1/chat/completions`)
- **Pró**: 1 integração, 20+ modelos, fallback automático
- **Contra**: rate-limit compartilhado, latência variável

### 1.2 Google Gemini API — Free Tier
- **URL**: https://ai.google.dev/gemini-api/docs/pricing
- **Setup**: Google account, sem cartão
- **Limites free (Jul 2026)**:
  - Gemini Flash: 5,000 req/mês, 10 RPM, 1M TPM (tokens por minuto)
  - Gemini Flash-Lite: 30 RPM, 1M TPM
  - Gemini 2.5 Pro: 5 RPM, 50-100 req/dia (muito restrito)
- **Contexto**: até 1M tokens (Flash)
- **Pró**: multimodal nativo (texto + imagem + áudio), contexto enorme
- **Contra**: 5K req/mês é pouco pra pipeline pesado

### 1.3 DeepSeek Direto
- **URL**: https://platform.deepseek.com
- **Setup**: signup → ganha 5M tokens credit (one-time)
- **Modelos**: DeepSeek V4 Pro, DeepSeek R1
- **Benchmarks**: 80.6% SWE-Bench Verified, 93.5% LiveCodeBench (top em coding)
- **Pró**: qualidade de coding top-tier, preço pago mais baixo (~$0.14/M input)
- **Contra**: free é one-time credit, não recorrente; depois é pago (mas barato)

### 1.4 Groq
- **URL**: https://groq.com
- **Setup**: free tier, sem cartão
- **Modelos**: Llama 4, Qwen, Gemma (hospedados em hardware LPU próprio)
- **Pró**: velocidade extrema (LPU hardware), TTFT baixíssimo
- **Contra**: modelos menores, não tem os Chineses top (DeepSeek/Kimi)

### 1.5 Requesty
- **URL**: https://requesty.ai/models/free
- **Setup**: 1 API key OpenAI-compatible
- **Limites**: 200 req/dia free
- **Modelos**: Zhipu GLM, MiniMax, Qwen, Llama
- **Pró**: 1 API unificada, roteamento inteligente
- **Contra**: 200/dia é pouco

### 1.6 NVIDIA NIM
- **URL**: https://build.nvidia.com
- **Setup**: 1000 free credits no signup
- **Modelos**: 100+ (DeepSeek, Llama, Qwen, GLM)
- **Pró**: variedade enorme, enterprise-grade
- **Contra**: credits acabam, depois é pago

### 1.7 SiliconFlow
- **URL**: https://siliconflow.cn
- **Setup**: free tier recorrente (modelos open-source chineses)
- **Modelos**: Qwen, DeepSeek, GLM, Yi
- **Pró**: free tier permanente, modelos chineses top
- **Contra**: UI/docs em chinês, latência da China

---

## 2. VLMs Gratuitos (vision + text)

### 2.1 Google Gemini Flash/Flash-Lite ⭐ RECOMENDADO
- **Capability**: multimodal nativo — analisa imagem + texto + áudio + vídeo
- **Free tier**: 5,000 req/mês (Flash), 30 RPM (Flash-Lite)
- **Uso prático**: screenshot do launcher → "avalie UI/UX, contraste, hierarquia visual, sugira melhorias"
- **API**:
  ```js
  // OpenAI-compatible via @google/genai SDK
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ inlineData: { mimeType: 'image/png', data: screenshotB64 } },
               { text: 'Avalie a UI/UX deste launcher...' }]
  });
  ```
- **Pró**: melhor VLM free do mercado, contexto 1M tokens
- **Contra**: 5K req/mês (dá pra ~166 screenshots/dia)

### 2.2 Kimi K2.6 (via OpenRouter free)
- **Capability**: multimodal, "coding-driven UI/UX generation"
- **Free**: no OpenRouter, mesmo key do LLM
- **Uso**: mesmo endpoint OpenAI-compatible, manda imagem em base64
- **Pró**: não consome quota Gemini, mesma API do LLM
- **Contra**: qualidade VLM levemente abaixo do Gemini

### 2.3 Qwen3-VL (open-source)
- **Capability**: VLM top da Alibaba, forte em reasoning visual
- **Hospedagem free**: NVIDIA NIM (credits), SiliconFlow (free tier), ou roda local
- **Pró**: open-weight, pode rodar local
- **Contra**: pesado pra rodar local (precisa GPU)

### 2.4 LLaVA (open-source)
- **Capability**: VLM acadêmico, bom pra document understanding
- **Hospedagem free**: NVIDIA NIM, ou roda local
- **Pró**: leve, roda em GPU consumer
- **Contra**: qualidade abaixo dos comerciais

---

## 3. Plano de Integração (proposta, NÃO implementado)

### Fase 1 — Eval pipeline offline (não-acoplado ao launcher)
Script `tools/ai-eval.js` (novo) que:
1. Lê todo `src/` do shinobi-launcher
2. Monta prompt: "Avalie este codebase Electron. Liste: (a) bugs potenciais, (b) code smells, (c) oportunidades de refactor, (d) melhorias de UX sugeridas"
3. Envia pra OpenRouter (Kimi K2.6 free, 1M contexto)
4. Salva resultado em `.launcher-research-backup/eval-<timestamp>.md`

### Fase 2 — UI/UX eval via screenshots
Script `tools/ui-eval.js` (novo) que:
1. Tira screenshot de cada tela do launcher (via agent-browser no preview Next.js)
2. Pra cada screenshot, manda pro Gemini Flash: "Avalie UI/UX: contraste, hierarquia, acessibilidade, espaço em branco, consistência. Seja crítico."
3. Salva resultado em `.launcher-research-backup/ui-eval-<timestamp>.md`

### Fase 3 — Refactor assistido (opcional)
1. Pega top 5 issues do eval da Fase 1
2. Pra cada, pede pro DeepSeek: "refatore este arquivo resolvendo issue X"
3. Mostra diff pro usuário aprovar antes de aplicar

**Custo**: $0 em todos os passos (free tiers).
**Tempo**: ~2h de implementação pra Fases 1+2.

---

## 4. Comparativo rápido de rate-limits (Jul 2026)

| Provider | RPM free | RPD free | Contexto | Multimodal |
|----------|----------|----------|----------|------------|
| OpenRouter (agregado) | ~20 | ~1000 | até 1M (modelos free) | Sim (Kimi K2.6) |
| Gemini Flash | 10 | ~166 | 1M | Sim (nativo) |
| Gemini Flash-Lite | 30 | ~1000 | 1M | Sim (nativo) |
| DeepSeek direto | — | 5M tokens (one-time) | 128K | Não |
| Groq | 30 | ~10000 | 128K | Não |
| Requesty | 20 | 200 | 256K | Não |
| NVIDIA NIM | 40 | 1000 credits | 256K | Não |

---

## 5. Resposta direta às perguntas do usuário

> "tem alguma api gratuita como kimi k3 ou outras ias muito capazes pra gente ter
> uma avaliacao mais apla do projeto, correcoes, melhorias e ate mesmo uma
> refatoracao ainda melhor e com vlm que avalie ui/ux"

**SIM.** As 3 melhores opções (todas grátis, sem cartão):

1. **OpenRouter free tier** — Kimi K2.6 (multimodal!) + DeepSeek R1 + Qwen3 + GLM, 1 key, ~1000 req/dia. **Melhor pra LLM eval do codebase inteiro.**

2. **Google Gemini Flash** — multimodal nativo, 5K req/mês free. **Melhor pra VLM (UI/UX via screenshots).**

3. **DeepSeek direto** — 5M tokens signup, top em SWE-Bench. **Melhor pra refactor específico de código.**

Dá pra combinar os 3: OpenRouter pra eval geral → DeepSeek pra refactor → Gemini Flash pra UI/UX. Tudo $0.

---

## 6. Fontes (validadas Jul 2026)

- https://openrouter.ai/blog/tutorials/free-llm-apis-compared (Jun 2026)
- https://openrouter.ai/collections/free-models (live)
- https://ai.google.dev/gemini-api/docs/pricing (live)
- https://ai.google.dev/gemini-api/docs/rate-limits (live)
- https://requesty.ai/models/free (live)
- https://openrouter.ai/moonshotai/kimi-k2.6:free (live)
- https://www.datacamp.com/blog/top-vision-language-models (2026)
- https://felloai.com/best-free-ai-for-coding (2026)
- https://github.com/12britz/awesome-free-models (curated list)
- https://github.com/open-free-llm-api/awesome-freellm-apis (134+ APIs)

---

**Próximo passo**: aguardar autorização do usuário pra implementar Fase 1
(eval pipeline) ou Fase 2 (UI/UX eval). Regra vigente: commitar só o que for
autorizado.

---

## 7. Verificação Real da Key (2026-07-22)

Key OpenRouter fornecida pelo usuário testada e **válida**. 342 modelos totais, **17 modelos free** disponíveis:

### Modelos free confirmados (ordenados por contexto):

| Modelo | Contexto | Modalidade | Melhor uso |
|--------|----------|------------|------------|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | **1M** | text→text | **LLM eval de codebase inteiro** ⭐ |
| `google/lyria-3-pro-preview` | 1M | text+image→text+audio | VLM + áudio |
| `google/lyria-3-clip-preview` | 1M | text+image→text+audio | VLM + áudio |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K | text→text | LLM coding |
| `google/gemma-4-31b-it:free` | 262K | **text+image+video→text** | **VLM UI/UX** ⭐ |
| `google/gemma-4-26b-a4b-it:free` | 262K | **text+image+video→text** | VLM backup |
| `poolside/laguna-m.1:free` | 262K | text→text | coding (poolside é coding-focused) |
| `poolside/laguna-s-2.1:free` | 262K | text→text | coding |
| `poolside/laguna-xs-2.1:free` | 262K | text→text | coding |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K | **text+image+audio+video→text** | VLM omni |
| `nvidia/nemotron-3-nano-30b-a3b:free` | 256K | text→text | LLM geral |
| `cohere/north-mini-code:free` | 256K | text→text | coding |
| `openrouter/free` | 200K | text+image→text | router (balanceia entre todos) |
| `openai/gpt-oss-20b:free` | 131K | text→text | GPT open-source |
| `nvidia/nemotron-nano-12b-v2-vl:free` | 128K | **text+image+video→text** | VLM leve |
| `nvidia/nemotron-3.5-content-safety:free` | 128K | text+image→text | safety check |
| `nvidia/nemotron-nano-9b-v2:free` | 128K | text→text | LLM leve rápido |

### Stack recomendada (confirmada, $0):
1. **`nvidia/nemotron-3-ultra-550b-a55b:free`** (1M ctx) — LLM eval do codebase inteiro (12.8K LoC cabe folgado)
2. **`google/gemma-4-31b-it:free`** (262K, multimodal) — VLM pra UI/UX via screenshots
3. **`openrouter/free`** — fallback automático quando algum modelo estoura rate-limit

**Teste real executado**: prompt de 28 linhas descrevendo o projeto → resposta completa em ~15s. Key funcional.

### Modelos NOTÁVEIS que NÃO estão mais free (mudou desde pesquisa inicial):
- ❌ `moonshotai/kimi-k2.6:free` — não aparece mais na lista (virou pago)
- ❌ `deepseek/deepseek-r1-0528:free` — não aparece mais
- ❌ `qwen3-coder-480b:free` — não aparece mais
- ❌ `zhipuai/glm-*:free` — não aparecem mais

O landscape de modelos free da OpenRouter rotaciona. Os 17 atuais são majoritariamente **NVIDIA Nemotron + Google Gemma + Poolside + Cohere + OpenAI gpt-oss** — todos capazes, mas o "who's free" muda mês a mês.

---

## 8. Avaliação Real do Projeto (executada via nemotron-3-ultra-550b)

**Nota: 7.5/10** — dada por LLM após análise da arquitetura.

### TOP 5 avanços concretos (não-cosméticos) sugeridos:
1. **Migrar pra TypeScript** — 12.8K LoC em vanilla JS é risco de manutenção
2. **Hardening Electron** — contextIsolation, sandbox, CSP rigorosa, preload tipado
3. **Quebrar app.js (1760 linhas) em modules** + state management
4. **Plano pós-Flash** — Ruffle (WASM) ou wrapper nativo (Tauri)
5. **Supply-chain security** — npm audit, code signing, auto-update assinado

### Menções honrosas:
- IPC tipado (Zod/Valibot validation no preload)
- Observabilidade (structured logs + Sentry/Crashpad)
- Testes de contrato IPC + fuzzing do CryptoService

Resultado completo salvo em `.launcher-research-backup/eval-20260722.md`.

