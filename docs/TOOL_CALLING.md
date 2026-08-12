# Tool Calling — Calculation Engine

## Architecture

```text
ConversationOrchestrator
  → Tool-capable LlmProvider (generateWithTools)
  → calculate_order
  → CalculationEngine
  → safe tool result (transient)
  → LLM final answer
```

Provider-neutral contract lives in `src/llm/tool-calling-types.ts`.
OpenAI/OdiRouter types stay inside `src/llm/odirouter/**`.

## Tool

- Name: `calculate_order`
- Args: public Jarvis `CalculationRequest`
- Products: `FRAME | WING | DOOR | PLISSE_NET`
- Result: customer-safe projection (`status`, `total`, `items`, `missingFields`, `warnings`)
- Internal economics are never returned to the LLM

## Tool loop

- Transient assistant/tool protocol messages only (not stored in ConversationStore)
- Persisted: CUSTOMER + final AI text
- Limits: `MAX_TOOL_ROUNDS = 3`, `MAX_TOOL_CALLS_PER_TURN = 3`
- After a tool round completes, follow-up LLM call uses `toolChoice=none` to force a final text answer
- HUMAN mode: no LLM, no tools, no CalculationEngine

## Runtime protections

- invalid JSON → `invalid_arguments`
- unknown tool → `unknown_tool`
- engine exception → `tool_error`
- `needs_input` / `unsupported` preserved from CalculationEngine

## Current live implementation

- OdiRouter Chat Completions tools API
- Model via `ODIROUTER_MODEL` (smoke uses tool_calling-capable catalog id)

## Smoke

```bash
npm run smoke:odirouter:calculation
```

Uses DEV current price snapshot — **NOT production live prices**.
