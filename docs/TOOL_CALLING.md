# Tool Calling — Calculation Engine + Price Integrity

## Architecture

```text
ConversationOrchestrator
  → Tool-capable LlmProvider (generateWithTools)
  → calculate_order (TrustedCalculationToolInput)
  → Trusted Pricing Policy → CalculationRequest
  → CalculationEngine
  → safe tool result (status + total [+ mode])
  → LLM candidate final text
  → PriceIntegrityGuard
  → persisted / customer-facing AI text
```

Provider-neutral contract lives in `src/llm/tool-calling-types.ts`.
OpenAI/OdiRouter types stay inside `src/llm/odirouter/**`.
Price integrity lives in `src/jarvis/pricing/**` (Jarvis Core policy).

## Tool

- Name: `calculate_order`
- Args: trusted AI-facing DTO (`mode`, `customerType`, `items`, optional `delivery`)
- Modes: `PRODUCT_ONLY` | `PRELIMINARY_ALL_IN`
- Products: `FRAME | WING | DOOR | PLISSE_NET`
- Result (calculated): `{ status, total, mode? }` — no item unit/product/install breakdown
- No LLM-controlled `discount`, `payment`, `installation.overrideAmount`, or other monetary authority
- Internal economics are never returned to the LLM

## Price integrity

- Last successful `calculate_order` total in the turn is authoritative
- Final LLM text is checked for currency-marked amounts only (`₽` / `руб` / …)
- Wrong / missing / conflicting money → deterministic fallback (no second LLM “fix”)
- Only guarded text is persisted to ConversationStore

## Tool loop

- Transient assistant/tool protocol messages only (not stored in ConversationStore)
- Persisted: CUSTOMER + final guarded AI text
- Limits: `MAX_TOOL_ROUNDS = 3`, `MAX_TOOL_CALLS_PER_TURN = 3`
- After a tool round completes, follow-up LLM call uses `toolChoice=none` to force a final text answer
- HUMAN mode: no LLM, no tools, no CalculationEngine

## Runtime protections

- invalid / unknown / monetary fields → `invalid_arguments`
- unknown tool → `unknown_tool`
- engine exception → `tool_error`
- PRELIMINARY_ALL_IN missing delivery facts → `needs_input` (no silent PRODUCT_ONLY)
- `needs_input` / `unsupported` preserved from CalculationEngine / policy

## Current live implementation

- OdiRouter Chat Completions tools API
- Model via `ODIROUTER_MODEL` (smoke uses tool_calling-capable catalog id)

## Smoke

```bash
npm run smoke:odirouter:calculation
```

Uses DEV current price snapshot — **NOT production live prices**.
