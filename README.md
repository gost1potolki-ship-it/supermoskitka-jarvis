# SuperMoskitka Jarvis

HTTP backend scaffold for the SuperMoskitka AI manager. This repository is separate from the surveyor React/Firebase app.

## Project documentation

- `docs/JARVIS_CORE_V1.md` — общая архитектурная спецификация Jarvis V1
- `AGENTS.md` — обязательные правила работы AI coding agents / Cursor
- `docs/GEMINI_PROVIDER.md` — Gemini Developer API provider (`LlmProvider` adapter)
- `docs/DEEPSEEK_PROVIDER.md` — DeepSeek API provider (`LlmProvider` adapter)
- `docs/ODIROUTER_PROVIDER.md` — OdiRouter gateway provider (`LlmProvider` adapter)
- `docs/TOOL_CALLING.md` — provider-neutral tool calling + `calculate_order`
- `docs/FACT_EXTRACTION.md` — Fact Extraction + live Order Memory

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
cp .env.example .env
npm install
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API with hot reload |
| `npm test` | Run unit tests once |
| `npm run smoke:gemini` | Manual live Gemini smoke (requires API key; not in `npm test`) |
| `npm run smoke:deepseek` | Manual live DeepSeek smoke (requires API key; not in `npm test`) |
| `npm run models:odirouter` | List OdiRouter text LLM catalog ids (requires API key; not in `npm test`) |
| `npm run smoke:odirouter` | Manual live OdiRouter smoke (requires API key + model id; not in `npm test`) |
| `npm run smoke:odirouter:calculation` | Live OdiRouter calculation tool smoke (DEV price snapshot; not in `npm test`) |
| `npm run smoke:odirouter:facts` | Live OdiRouter fact extraction + Order Memory smoke (not in `npm test`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |

## Health check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "supermoskitka-jarvis"
}
```

## Docker

Build:

```bash
docker build -t supermoskitka-jarvis .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e LOG_LEVEL=info \
  supermoskitka-jarvis
```

## Project layout

Domain modules under `src/` (`channels`, `jarvis`, `llm`, `knowledge`, `calculation`, `crm`, `storage`, `domain`, `jobs`) are placeholders for later stages. Do not add business logic here until the corresponding task.

## Configuration

Environment variables (see `.env.example`):

- `NODE_ENV` — `development` | `test` | `production`
- `PORT` — HTTP listen port
- `LOG_LEVEL` — `debug` | `info` | `warn` | `error`
- `GEMINI_API_KEY` / `GEMINI_MODEL` — optional until Gemini provider is used (see `docs/GEMINI_PROVIDER.md`)
- `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL` — optional until DeepSeek provider is used (see `docs/DEEPSEEK_PROVIDER.md`)
- `ODIROUTER_API_KEY` / `ODIROUTER_MODEL` / `ODIROUTER_BASE_URL` — optional until OdiRouter provider is used (see `docs/ODIROUTER_PROVIDER.md`)
