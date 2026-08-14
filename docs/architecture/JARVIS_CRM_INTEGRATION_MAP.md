# Jarvis ↔ CRM Integration Map

Task 14.1 hardens controlled measurement intake for coexistence with the live
Sheet and legacy Sheet → Firestore sync. Conversation/lead UI and automatic
execution remain future work.

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
        └── dedicated webhook action: upsert_measurement_sheet
                    ↓ (Sheet only)
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
        ↓ one browser request; no Firestore browser write
Measurement Intake Apps Script: upsert_measurement
        ├── Firestore REST merge upcoming_measurements/{submissionId}
        └── Google Sheet “Замеры” upsert by submission_id
```

Both paths use one semantic contract, the same Firestore field mapping, and the
same `submissionId` idempotency key. The visible Sheet columns remain:

```text
Имя | Телефон | Адрес | Изделия | Заказчик | сумма
```

The compatibility adapter intentionally maps Sheet `Изделия` / canonical
`itemSummary` to Firestore `comment`. A separate free customer comment does not
replace that product summary.

The legacy Sheet → Firestore sync prefers `submission_id` for Task 14 rows and
keeps `m_<hash(phone|address)>` only for old rows. Its masked updates preserve
measurer-owned metadata and Task 14.1.1 financial technical fields
(`preliminaryTotalRub`, `measurerPayoutRub`, `measurerPayer`,
`customerDepositRub`, `remainingBalanceRub`), and cleanup is limited to legacy
`m_` documents.

## Financial model (Task 14.1.1)

Measurement intake now separates:

```text
preliminaryTotalRub   = full customer order total
measurerPayoutRub     = payout to measurer, currently 1000
measurerPayer         = CUSTOMER | COMPANY
customerDepositRub    = amount already paid by customer toward the order
remainingBalanceRub   = customer total still due
```

Operational Sheet mapping:

```text
E = who physically pays the measurer ("Заказчик" | "фирма")
F = measurerPayoutRub
```

Legacy measurer compatibility:

```text
amount_rub = measurerPayoutRub
payer_text = "Заказчик" | "фирма"
comment    = itemSummary
```

When `measurerPayer=CUSTOMER`, deposit equals payout and balance equals
`total - payout`. When `measurerPayer=COMPANY`, deposit is `0` and balance
equals the full total. The payout is never added on top of the customer total.

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

## Explicit non-goals of Task 14.1

- No Jarvis UI embedded in CRM
- No automatic measurement executor trigger after a customer message
- No writes to `measurements`, `ready_orders`, `config/prices`, or production status
- No channel adapters
- No shared Calculation Engine merge
