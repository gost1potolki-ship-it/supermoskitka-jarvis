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

Measurement Sheet projection (used only by the explicit submit endpoint):

```text
MEASUREMENT_SHEET_WEBHOOK_URL
```

If this URL is absent, existing internal read/message routes remain available.
An explicit measurement submit still preserves the Firestore document and
returns `MEASUREMENT_SHEET_NOT_CONFIGURED`.

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

Missing `JARVIS_INTERNAL_API_KEY` **or** incomplete production runtime (Firestore / OdiRouter) → `/internal/v1/**` returns `503 INTERNAL_API_NOT_CONFIGURED`. `GET /health` stays up.

## Production runtime composition

`npm start` wires:

```text
JARVIS_INTERNAL_API_KEY
+ Firestore (jarvis_v1_conversations / jarvis_v1_order_memories)
+ narrow Admin adapter (upcoming_measurements only)
+ OdiRouter LLM
+ Knowledge / FactExtractor / Calculation Tool
→ JarvisApplication → createApp
```

There is **no silent InMemory fallback** in production. InMemory stores remain for tests/smoke harnesses only.

Shared wiring helper: `composeJarvisApplication` / `tryCreateProductionJarvisApplication`.

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
| `POST` | `/internal/v1/conversations/:conversationId/measurement-submit` | bearer |

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

Canonical identity:

```text
conversationId + messageId + text
```

Semantics:

| Case | Result |
| --- | --- |
| Completed AI turn (CUSTOMER + AI reply) | `200 duplicate=true`, existing `aiReply`, no LLM/extractor |
| HUMAN turn | `200 duplicate=true`, `aiReply=null`, no LLM/extractor |
| Incomplete AI turn (CUSTOMER persisted, AI missing, mode=AI) | resume same customer turn via orchestrator (no second CUSTOMER append); `duplicate=true`, optional `resumed=true`, then `aiReply` |
| Same messageId, different text | `409 MESSAGE_ID_CONFLICT` (including concurrent in-flight requests) |

Single-process single-flight: concurrent POSTs with the same `conversationId + messageId + text` share one in-flight promise. If the same `messageId` arrives concurrently with a **different** text, the second request fails immediately with `409 MESSAGE_ID_CONFLICT` without waiting for the first. Map entries are cleared in `finally`.

**Not implemented:** multi-worker / distributed idempotency (Redis lease). Firestore duplicate-message persistence remains a second defense after restart within one process.

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

Reading this endpoint never writes operational data.

## Explicit measurement submission

`POST /internal/v1/conversations/:conversationId/measurement-submit`

This is the only Jarvis Task 14 operational execution entry point. It:

1. reads the current `MeasurementAction`;
2. requires `AUTO_ALLOWED`;
3. rebuilds customer data and total from current Order Memory and the current
   trusted preliminary quote;
4. rereads memory and rejects a changed revision/quote as
   `MEASUREMENT_SUBMISSION_STALE`;
5. upserts `upcoming_measurements/{submissionId}`;
6. projects the same submission to the dedicated measurement Sheet webhook.

The HTTP request body is not an authority. Caller-provided phone, address,
items, quote ID, or total overrides are ignored.

Success `200`:

```json
{
  "conversationId": "...",
  "submissionId": "jarvis_<sha256-prefix>",
  "status": "SUBMITTED",
  "firestore": "UPSERTED",
  "sheet": "SENT"
}
```

Jarvis IDs are deterministic:

```text
jarvis_ + first 32 lowercase hex characters of SHA-256(UTF-8 conversationId)
```

The ID contains no raw phone or address. Retry and explicit update of the same
conversation use the same Firestore document and Sheet row.

Jarvis V1 uses `payerType=CUSTOMER` because payer choice is not yet a trusted
Order Memory fact. The manual CRM confirmation remains editable and explicit.

### Partial failure

Firestore is written first with `sheetSyncStatus=pending`. Sheet success marks
it `sent`; Sheet failure marks it `error` and does not delete the measurement.

Sheet failure returns controlled `502` (or `503` when unconfigured) with safe
details:

```json
{
  "error": {
    "code": "MEASUREMENT_SHEET_FAILED",
    "message": "Measurement Sheet synchronization failed",
    "requestId": "...",
    "details": {
      "conversationId": "...",
      "submissionId": "jarvis_<sha256-prefix>",
      "status": "PARTIAL",
      "firestore": "UPSERTED",
      "sheet": "ERROR"
    }
  }
}
```

Retry is safe and uses the same `submissionId`.

## Operational write boundary

Task 14 permits only:

```text
upcoming_measurements/{submissionId}
dedicated measurement Sheet projection
```

Still forbidden:

```text
measurements
ready_orders
config/prices
production status
```

The existing “Отправить в работу” contract is unchanged. `AUTO_ALLOWED` after
an ordinary customer message still performs zero operational writes; execution
requires the explicit POST above.

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
MEASUREMENT_NOT_READY
MEASUREMENT_OWNER_APPROVAL_REQUIRED
MEASUREMENT_SUBMISSION_STALE
MEASUREMENT_SHEET_NOT_CONFIGURED
MEASUREMENT_SHEET_FAILED
MEASUREMENT_PERSISTENCE_FAILED
INTERNAL_ERROR
```

Stack traces and secrets are never returned to clients.

## Request logging

Each request gets `x-request-id` (caller header reused when safe, otherwise generated).

Logged by default: requestId, method, route/path, status, duration, conversationId when present.

Not logged by default: customer text, phone, address, API keys, system prompts, provider raw payloads, supplier prices, full Order Memory.
