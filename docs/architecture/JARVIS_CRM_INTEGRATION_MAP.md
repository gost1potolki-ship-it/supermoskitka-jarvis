# Jarvis ↔ CRM Integration Map (documentation only)

Current map — **no implementation in Task 13**.

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
        ↓ (future controlled measurement executor)
upcoming_measurements
        ↓
Presales / Measurer operational flow
        ↓
measurements
```

`AUTO_ALLOWED` is an internal Jarvis decision signal only. It is **not** an automatic CRM write today.

## Existing production “Отправить в работу”

```text
Presales CRM send-to-work
        ↓
current Google Apps Script / Sheets production flow
```

This path remains the existing production workflow. It is **not** triggered automatically from Jarvis readiness in Task 13.

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

## Explicit non-goals of Task 13

- No Jarvis UI embedded in CRM
- No measurement executor
- No `upcoming_measurements` writes from Jarvis
- No channel adapters
- No shared Calculation Engine merge
