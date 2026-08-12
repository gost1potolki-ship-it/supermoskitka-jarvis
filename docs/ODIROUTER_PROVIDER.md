# OdiRouter LLM Provider

## Provider

- Backend: **OdiRouter** OpenAI-compatible gateway
- Base URL: `https://api.odirouter.ai/v1`
- Protocol: Chat Completions (`POST /v1/chat/completions`)
- Auth: Bearer API key
- SDK: existing `openai` package
- Adapter: `OdiRouterLlmProvider` implements vendor-neutral `LlmProvider`

Gemini, DeepSeek, and OdiRouter are interchangeable `LlmProvider` implementations.

## Required environment

```env
ODIROUTER_API_KEY=
ODIROUTER_MODEL=
ODIROUTER_BASE_URL=https://api.odirouter.ai/v1
```

- `ODIROUTER_API_KEY` — server-side only; never commit or log
- `ODIROUTER_MODEL` — exact catalog model id (not a marketing name)
- `ODIROUTER_BASE_URL` — optional; defaults to `https://api.odirouter.ai/v1`

Jarvis не зависит от конкретной модели OdiRouter.
Фактическая модель выбирается exact catalog id через env.

## Model catalog

```bash
npm run models:odirouter
```

Uses `GET /v1/models/catalog`. Not part of `npm test`.

## Role mapping

| Neutral `LlmChatMessage.role` | OdiRouter / OpenAI |
| --- | --- |
| `system` | `system` |
| `user` | `user` |
| `assistant` | `assistant` |

Provider is **stateless**: history comes only from `ConversationStore` via `ConversationOrchestrator`.

## Manual smoke

```bash
npm run smoke:odirouter
```

Requires `ODIROUTER_API_KEY` and `ODIROUTER_MODEL`.

## Out of scope (later tasks)

- Calculation Engine tools / function calling
- Automatic provider/model router
- Structured Fact Extraction
- Channel wiring
