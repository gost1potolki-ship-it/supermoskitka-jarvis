# Gemini LLM Provider

## Provider

- Backend: **Gemini Developer API** (API key)
- SDK: `@google/genai`
- Adapter: `GeminiLlmProvider` implements vendor-neutral `LlmProvider`

## Required environment

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-pro-preview
```

- `GEMINI_API_KEY` — server-side only; never commit or log
- `GEMINI_MODEL` — model id; not hardcoded in Jarvis business logic

Current suggested model example: `gemini-3.1-pro-preview`

Gemini consumer subscription and Gemini API billing/access are separate.
Для Jarvis нужен Gemini API key.

## Role mapping

| Neutral `LlmChatMessage.role` | Gemini |
| --- | --- |
| `system` | `config.systemInstruction` (not duplicated in contents) |
| `user` | `user` |
| `assistant` | `model` |

Provider is **stateless**: history comes only from `ConversationStore` via `ConversationOrchestrator`.

## Manual smoke

```bash
npm run smoke:gemini
```

Requires `GEMINI_API_KEY` and `GEMINI_MODEL`. Not part of `npm test`.

## Out of scope (later tasks)

- Calculation Engine tools / function calling
- Structured Fact Extraction
- Model router / Flash fallback
- Channel wiring / public chat HTTP endpoint
