# Measurement Sheet Webhook setup

Task 14.1 hardens the dedicated Google Apps Script source for measurement intake:

```text
integrations/google-apps-script/measurement-intake.gs
```

It is separate from the existing production-order webhook. Do not replace or
modify the “Отправить в работу” deployment with this script.

## Deployment

1. Open Apps Script for the spreadsheet that contains the `Замеры` sheet.
2. Add the contents of `measurement-intake.gs`.
3. Set the `MEASUREMENT_FIREBASE_PROJECT_ID` Script Property.
4. If the script is standalone, set the `SPREADSHEET_ID` Script Property.
5. Optionally set `MEASUREMENT_SHEET_NAME`; the default is `Замеры`.
6. Deploy the script as a Web App using the account that can edit the sheet and
   access the configured Firebase project.
7. Store the Web App URL outside Git:
   - Jarvis backend: `MEASUREMENT_SHEET_WEBHOOK_URL`
   - Presales CRM: `VITE_MEASUREMENT_SHEET_WEBHOOK_URL`

Never commit the deployed URL, OAuth data, API keys, or spreadsheet content.

Task 14.1 changes source and configuration contracts only. It does not deploy
the script, Firestore rules, CRM, or Jarvis.

## Firestore boundary

The Presales browser does not write `upcoming_measurements` directly and does
not require Firestore create permission. It sends one request to the intake Web
App. For `upsert_measurement`, Apps Script uses its OAuth token and Firestore
REST to merge `upcoming_measurements/{submissionId}` before writing the Sheet.
No service-account key or private key is stored in the script.

Jarvis keeps its trusted Admin SDK Firestore upsert. It calls the same Web App
with `upsert_measurement_sheet`, which performs only the Sheet projection.
Firestore rules are neither weakened nor deployed by this task.

## Request contract

Task 14.1.1 separates customer order total, measurer payout, customer deposit,
and remaining balance. The payout is not added on top of the order total.

```json
{
  "action": "upsert_measurement",
  "submissionId": "stable-id",
  "address": "Customer-visible address",
  "name": "Customer name",
  "phone": "Customer phone",
  "itemSummary": "2 × Рамочная — Антимошка",
  "customerComment": "Позвонить заранее",
  "preliminaryTotalRub": 15000,
  "measurerPayoutRub": 1000,
  "measurerPayer": "CUSTOMER",
  "customerDepositRub": 1000,
  "remainingBalanceRub": 14000,
  "amount_rub": 1000,
  "payer_text": "Заказчик",
  "apt": "12",
  "time": "После 18:00",
  "source": "PRESALES_CRM"
}
```

Field meaning:

- `preliminaryTotalRub` — full customer order total
- `measurerPayoutRub` — payout to measurer, currently `1000`
- `measurerPayer` — `CUSTOMER` or `COMPANY`
- `customerDepositRub` — amount already paid by customer toward the order
- `remainingBalanceRub` — customer total still due after measurement
- `amount_rub` — legacy measurer field, always equals `measurerPayoutRub`
- `payer_text` — legacy measurer field: `Заказчик` or `фирма`

When `measurerPayer=CUSTOMER`, deposit equals payout and balance equals
`preliminaryTotalRub - measurerPayoutRub`. When `measurerPayer=COMPANY`, deposit
is `0` and balance equals the full total.

`submissionId` is the idempotency key shared with
`upcoming_measurements/{submissionId}`.

`itemSummary` is the product summary. It is projected to Sheet column D
`Изделия` and, for legacy measurer compatibility, to Firestore `comment`.
`customerComment` is separate and never replaces column D.

Jarvis sends the same fields with `"action": "upsert_measurement_sheet"` after
its Admin Firestore upsert.

## Sheet behavior

- The production-visible layout is exactly:
  `Имя | Телефон | Адрес | Изделия | Заказчик | сумма`.
- Column E stores who physically pays the measurer: `Заказчик` or `фирма`.
- Column F stores `measurerPayoutRub` (currently `1000`), not
  `preliminaryTotalRub` and not `remainingBalanceRub`.
- Existing A–F columns are never renamed, reordered, or shifted.
- Supported payer headers are `Заказчик`, `Платит`, and `Плательщик`.
- If A–F are all blank, the same positional layout is used as a legacy fallback.
- Partial, reordered, or ambiguous headers fail closed with
  `SHEET_SCHEMA_MISMATCH`.
- If `submission_id` is absent, it is appended as a technical column.
- A new `submission_id` appends one row.
- An existing `submission_id` updates that row.
- `LockService` serializes concurrent requests.
- A missing `Замеры` sheet returns `SHEET_NOT_FOUND`; the script does not create
  another sheet silently.

## Firestore and failure behavior

- REST writes use update masks, so reservation, status, coordinates, completion,
  Task 14 financial technical fields, and other measurer-owned fields are preserved.
- New documents receive `createdAt`; updates preserve the existing value.
- Firestore failure prevents any Sheet write and returns `FAILED`.
- Sheet failure after Firestore returns `PARTIAL`; the document remains with
  `sheetSyncStatus=error`.
- Retrying the same `submissionId` updates the same document and Sheet row.

## Controlled errors

The Web App returns JSON with one of:

```text
INVALID_ACTION
VALIDATION_ERROR
SHEET_NOT_FOUND
SHEET_SCHEMA_MISMATCH
DUPLICATE_CONFLICT
FIRESTORE_NOT_CONFIGURED
INTERNAL_ERROR
```

Responses do not include stack traces, OAuth tokens, deployment URLs, or sheet
contents.
