# DeepSeek LLM Provider

## Provider

- Backend: **DeepSeek API** (OpenAI-compatible Chat Completions)
- SDK: `openai` with DeepSeek `baseURL`
- Adapter: `DeepSeekLlmProvider` implements vendor-neutral `LlmProvider`

Gemini and DeepSeek are interchangeable `LlmProvider` implementations. Neither is the only Jarvis brain.

## Required environment

```env
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

- `DEEPSEEK_API_KEY` — server-side only; never commit or log
- `DEEPSEEK_MODEL` — model id via env (suggested: `deepseek-v4-pro`)
- `DEEPSEEK_BASE_URL` — optional; defaults to `https://api.deepseek.com`

## Role mapping

| Neutral `LlmChatMessage.role` | DeepSeek / OpenAI |
| --- | --- |
| `system` | `system` |
| `user` | `user` |
| `assistant` | `assistant` |

Provider is **stateless**: history comes only from `ConversationStore` via `ConversationOrchestrator`.

## Manual smoke

```bash
npm run smoke:deepseek
```

Requires `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL`. Not part of `npm test`.

## Out of scope (later tasks)

- Calculation Engine tools / function calling
- Structured Fact Extraction
- Channel wiring / public chat HTTP endpoint
