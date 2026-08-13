# Jarvis Application API (Internal v1)

Internal control/application boundary for Jarvis Core.

```text
External/Internal caller
→ HTTP /internal/v1
→ Application layer (JarvisApplication)
→ Jarvis Core (ConversationOrchestrator, stores, readiness, quote)
```

## Namespace

All application routes live under:

```text
/internal/v1/**
```

`GET /health` remains public and does not require authentication.

This is **not** a public customer browser API. Do not enable wildcard CORS in Task 12.

## Authentication

Env:

```text
JARVIS_INTERNAL_API_KEY
```

Request header:

```text
Authorization: Bearer <token>
```

Rules:

| Condition | Result |
| --- | --- |
| Missing/empty `JARVIS_INTERNAL_API_KEY` on server | `503 INTERNAL_API_NOT_CONFIGURED` |
| Missing/wrong bearer token | `401 UNAUTHORIZED` |
| Correct bearer token | route allowed |

There is no development default key. Tokens are compared with a timing-safe equality check and are never logged or returned in error bodies.

## Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/health` | public |
| `POST` | `/internal/v1/conversations` | bearer |
| `GET` | `/internal/v1/conversations/:conversationId` | bearer |
| `GET` | `/internal/v1/conversations/:conversationId/messages` | bearer |
| `POST` | `/internal/v1/conversations/:conversationId/messages` | bearer |
| `POST` | `/internal/v1/conversations/:conversationId/mode` | bearer |
| `GET` | `/internal/v1/conversations/:conversationId/order-state` | bearer |
| `GET` | `/internal/v1/conversations/:conversationId/measurement-action` | bearer |

Machine-readable contract: `docs/openapi.internal.v1.yaml`.

## Create conversation

`POST /internal/v1/conversations`

```json
{
  "channel": "telegram",
  "customerId": "optional-external-customer"
}
```

Response `201`:

```json
{
  "conversationId": "...",
  "mode": "AI",
  "channel": "telegram",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Creates a Conversation only. Does **not** create CRM leads, measurements, orders, or Google Sheet rows.

## Customer message

`POST /internal/v1/conversations/:conversationId/messages`

```json
{
  "messageId": "channel-stable-id",
  "text": "Здравствуйте"
}
```

AI mode response `200`:

```json
{
  "conversationId": "...",
  "conversationMode": "AI",
  "customerMessageId": "channel-stable-id",
  "duplicate": false,
  "aiReply": {
    "messageId": "...",
    "text": "..."
  }
}
```

HUMAN mode response `200`:

```json
{
  "conversationId": "...",
  "conversationMode": "HUMAN",
  "customerMessageId": "channel-stable-id",
  "duplicate": false,
  "aiReply": null
}
```

### AI / HUMAN semantics

- `mode=HUMAN`: customer message is persisted; FactExtractor / LLM / Calculation Tool are not called; no AI reply is created.
- `POST .../mode` with `{ "mode": "AI" | "HUMAN" }` switches ownership without clearing transcript, Order Memory, or quote.

### Message idempotency

- Same `conversationId + messageId + text` → `200`, `duplicate=true`, no reprocessing.
- Same `messageId` with different text → `409 MESSAGE_ID_CONFLICT`.

## Order state (internal)

`GET /internal/v1/conversations/:conversationId/order-state`

Compact internal DTO for future CRM adapters:

- customer facts
- items
- public preliminary quote (`publicTotalRub`, current/accepted)
- readiness
- measurement action kind
- optional profitability **summary**

Profitability:

- `EXACT` may include `grossProfitRub` / `grossMarginPercent` / `markupPercent` / band
- `PARTIAL` / `UNAVAILABLE` never invent percents from partial subtotals; band is `UNAVAILABLE`

Never returned:

- supplier/BOM/catalog dumps
- trusted proof internals
- system prompts / tool transcripts
- measurement payouts / waste %

## Measurement action

`GET /internal/v1/conversations/:conversationId/measurement-action`

Uses existing Task 11 readiness + measurement action policy + draft builders.

Kinds:

```text
NOT_READY
AUTO_ALLOWED
AWAITING_OWNER_APPROVAL
```

When ready, may include a safe draft (customer/items/fulfillment/public quote). No internal economics in the draft.

## CRM / production writes

Task 12 does **not** implement:

```text
submitMeasurement
writeMeasurement
sendToCrm
createPresalesLead
```

Operational collections remain untouched:

```text
measurements
upcoming_measurements
ready_orders
config/prices
```

`AUTO_ALLOWED` is an internal decision signal only.

## Error contract

```json
{
  "error": {
    "code": "CONVERSATION_NOT_FOUND",
    "message": "Conversation not found",
    "requestId": "..."
  }
}
```

Stable codes:

```text
UNAUTHORIZED
INTERNAL_API_NOT_CONFIGURED
VALIDATION_ERROR
CONVERSATION_NOT_FOUND
MESSAGE_ID_CONFLICT
MODE_INVALID
PERSISTENCE_CONFLICT
PROVIDER_UNAVAILABLE
INTERNAL_ERROR
```

Stack traces and secrets are never returned to clients.

## Request logging

Each request gets `x-request-id` (caller header reused when safe, otherwise generated).

Logged by default: requestId, method, route/path, status, duration, conversationId when present.

Not logged by default: customer text, phone, address, API keys, system prompts, provider raw payloads, supplier prices, full Order Memory.
