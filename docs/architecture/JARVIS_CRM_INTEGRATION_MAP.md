# Jarvis ↔ CRM Integration Map

Task 14 implements only controlled measurement intake. Conversation/lead UI and
automatic execution remain future work.

## Conversation / lead

```text
Jarvis conversation + order memory
        ↓ (future)
Presales CRM dialog / lead UI
```

Jarvis already owns AI/HUMAN conversation control and trusted preliminary quote state.

## Measurement readiness

```text
Jarvis READY_FOR_MEASUREMENT / AUTO_ALLOWED
        ↓ (explicit internal POST only)
Measurement Submission Executor
        ├── Firestore Admin upsert
        └── dedicated measurement Sheet webhook
                    ↓
upcoming_measurements
        ↓
Presales / Measurer operational flow
        ↓
measurements
```

`AUTO_ALLOWED` remains a decision signal after an ordinary customer turn. It
does **not** write operational data automatically. Task 14 permits execution
only through:

```text
POST /internal/v1/conversations/:conversationId/measurement-submit
```

The manual owner path is separate:

```text
Presales CRM “Записать на замер”
        ├── upcoming_measurements/{submissionId}
        └── dedicated measurement Sheet webhook
```

Both paths use one semantic contract, the same Firestore field mapping, and the
same `submissionId` idempotency key.

## Existing production “Отправить в работу”

```text
Presales CRM send-to-work
        ↓
current Google Apps Script / Sheets production flow
```

This path remains unchanged. Measurement intake never calls the production
order webhook and never changes production status.

## Future channels (not implemented)

```text
Website own Jarvis widget + quiz
Telegram
Avito
Email
```

### JivoSite

Temporary website chat during migration. Future target: own Jarvis website widget.

### Quiz

Structured lead channel that should:

- use central Jarvis calculation;
- be able to set `priceAccepted` + `measurementAgreed`;
- still create a Jarvis-known lead/conversation/order memory.

## Explicit non-goals of Task 14

- No Jarvis UI embedded in CRM
- No automatic measurement executor trigger after a customer message
- No writes to `measurements`, `ready_orders`, `config/prices`, or production status
- No channel adapters
- No shared Calculation Engine merge
