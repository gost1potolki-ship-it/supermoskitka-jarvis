# Persistence (Firestore)

Jarvis runtime state is persisted with **Firebase Admin → Firestore** in **Jarvis-only** collections.

## Collections (write namespace)

| Collection | Document ID | Contents |
| --- | --- | --- |
| `jarvis_v1_conversations` | `conversationId` | Conversation aggregate + messages |
| `jarvis_v1_order_memories` | `conversationId` | Canonical `OrderMemory` |

Operational CRM collections are **read-only** for future CRM Watcher and must **not** be written by Task 10:

- `measurements`
- `upcoming_measurements`
- `ready_orders`
- `config` / `prices`
- dealer / Sheets integrations

## Architecture

```text
ConversationOrchestrator
  → ConversationStore / OrderMemoryStore (interfaces)
  → FirestoreConversationStore / FirestoreOrderMemoryStore
  → JarvisFirestoreGateway (Admin or in-memory fake)
```

Domain and Jarvis core **do not** import `firebase-admin`.

## Composition

```ts
import { createPersistentJarvisRuntime } from './infrastructure/firestore/index.js';

const { conversationStore, orderMemoryStore } = createPersistentJarvisRuntime();
```

Missing `JARVIS_FIRESTORE_PROJECT_ID` (or incomplete explicit credentials) → controlled `PersistenceConfigError`. **No silent InMemory fallback** when Firestore is selected.

Unit tests keep using `InMemoryConversationStore` / `InMemoryOrderMemoryStore`, or `InMemoryFirestoreGateway` behind the Firestore adapters.

## Env

```text
JARVIS_FIRESTORE_PROJECT_ID=...
# optional explicit service account:
JARVIS_FIRESTORE_CLIENT_EMAIL=...
JARVIS_FIRESTORE_PRIVATE_KEY=...   # supports escaped \n
```

Prefer Application Default Credentials when email/key are omitted. Never commit service-account JSON or print private keys. No `VITE_*` client keys.

## Revision / concurrency

Each aggregate document has `schemaVersion` + integer `revision` (starts at 1).

Updates run inside a Firestore transaction: read → compare expected revision → write `revision + 1`.

**Fail-closed rules:**

| Operation | Missing / `0` revision |
| --- | --- |
| `OrderMemoryStore.save` create (no doc) | allowed → revision `1` |
| `OrderMemoryStore.save` update (doc exists) | `PERSISTENCE_CONFLICT` |
| `saveConversation` (existing) | `PERSISTENCE_CONFLICT` (revision required) |
| `appendMessage` | caller revision not required (atomic over current aggregate) |

Stale or revisionless overwrite → `PersistenceConflictError` (`PERSISTENCE_CONFLICT`). `undefined` does **not** disable optimistic concurrency.

`appendMessage` sets `conversation.updatedAt = max(existing.updatedAt, message.createdAt)` so out-of-order messages do not move activity time backwards.

### Firebase Admin app boundary

Jarvis uses a **named** Admin app `jarvis-firestore-<projectId>`. It never reuses `getApps()[0]` without verifying `projectId`. Injected apps with a mismatched project → `PersistenceConfigError`.

Document IDs must be safe (`[A-Za-z0-9][A-Za-z0-9_.-]{0,127}`) — no `/` or `..`.

## Codecs

`firestore-codec.ts` encodes/decodes domain ↔ plain JSON. Firestore `Timestamp` must not leak into domain types (ISO strings). Corrupted / invalid enums → `PersistenceDataError` (fail closed, no silent repair).

`OrderChange.oldValue` / `newValue` are decoded with the same field-specific enum/number rules as item facts.

## Size guard

`MAX_PERSISTED_AGGREGATE_BYTES = 800_000` (below Firestore ~1 MiB). Oversized write → `PersistenceSizeLimitError`. History is **not** truncated.

## Transient (never persisted in ConversationStore)

- Runtime system prompt / Knowledge Base dump
- Synthetic `[INTERNAL ORDER MEMORY DATA]` context
- Tool protocol (`assistant` tool_calls, `role=tool`, raw calculate/extract payloads)
- API keys / private keys / env secrets

Compact memory context is rebuilt from persistent `OrderMemory` each turn.

## Partial failure

| Failure | Behavior |
| --- | --- |
| CUSTOMER message append fails | Turn fails; do not continue as if saved |
| OrderMemory save fails after CUSTOMER saved | Mark extraction failed; continue LLM with **pre-apply** memory; do not pretend memory updated |

No distributed transaction between Conversation and OrderMemory in this stage.

## Live smoke

```bash
npm run smoke:firestore:persistence
```

Writes only under `jarvis_v1_*` with a synthetic `smoke-<id>` conversation, verifies WHITE → GRAY_7016 + history, then deletes smoke docs in `finally`.

If project/credentials are missing:

```text
SMOKE: NOT RUN — FIRESTORE_CONFIG_MISSING
```

This does not fail `build` / `lint` / `npm test`.
