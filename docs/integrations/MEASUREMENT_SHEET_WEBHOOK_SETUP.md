# Measurement Sheet Webhook setup

Task 14 adds a dedicated Google Apps Script source for measurement intake:

```text
integrations/google-apps-script/measurement-intake.gs
```

It is separate from the existing production-order webhook. Do not replace or
modify the “Отправить в работу” deployment with this script.

## Deployment

1. Open Apps Script for the spreadsheet that contains the `Замеры` sheet.
2. Add the contents of `measurement-intake.gs`.
3. If the script is standalone, set the `SPREADSHEET_ID` Script Property.
4. Optionally set `MEASUREMENT_SHEET_NAME`; the default is `Замеры`.
5. Deploy the script as a Web App using the account that can edit the sheet.
6. Store the Web App URL outside Git:
   - Jarvis backend: `MEASUREMENT_SHEET_WEBHOOK_URL`
   - Presales CRM: `VITE_MEASUREMENT_SHEET_WEBHOOK_URL`

Never commit the deployed URL, OAuth data, API keys, or spreadsheet content.

Task 14 creates source and configuration contracts only. It does not deploy the
script.

## Firestore rules prerequisite

The manual Presales path writes `upcoming_measurements/{submissionId}` with the
Firebase browser SDK. The imported rules source currently denies document
creation and limits updates to measurer reservation fields. Task 14 intentionally
does not modify `apps/measurer/firestore.rules` and does not deploy rules.

Before enabling the CRM button in a live environment, review and deploy a
least-privilege rule (or move the browser write behind an authenticated backend)
that permits the exact Task 14 intake fields. Without that separate operational
approval, the UI will fail closed before the Sheet call and show its retry state.
The Jarvis Admin adapter is not governed by browser Firestore rules.

## Request contract

```json
{
  "action": "upsert_measurement",
  "submissionId": "stable-id",
  "address": "Customer-visible address",
  "name": "Customer name",
  "phone": "Customer phone",
  "comment": "Public measurement note",
  "amount_rub": 8970,
  "payer_text": "Клиент",
  "apt": "12",
  "time": "После 18:00",
  "source": "PRESALES_CRM"
}
```

`submissionId` is the idempotency key shared with
`upcoming_measurements/{submissionId}`.

## Sheet behavior

- Existing headers are matched case-insensitively using the operational aliases.
- Existing A–F columns are not renamed or reordered.
- If `submission_id` is absent, it is appended as a technical column.
- A new `submission_id` appends one row.
- An existing `submission_id` updates that row.
- `LockService` serializes concurrent requests.
- A missing `Замеры` sheet returns `SHEET_NOT_FOUND`; the script does not create
  another sheet silently.

## Controlled errors

The Web App returns JSON with one of:

```text
INVALID_ACTION
VALIDATION_ERROR
SHEET_NOT_FOUND
DUPLICATE_CONFLICT
INTERNAL_ERROR
```

Responses do not include stack traces, OAuth tokens, deployment URLs, or sheet
contents.
