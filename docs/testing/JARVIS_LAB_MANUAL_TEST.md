# Jarvis Lab — manual test checklist

Jarvis Lab is a **local dev-only** operator stand inside Presales CRM. It is **not** a production customer channel and **does not** submit measurements.

## Local setup

Terminal 1 — Jarvis backend:

```bash
cd D:\supermoskitka-jarvis
npm start
```

Terminal 2 — Presales CRM dev server:

```bash
cd D:\supermoskitka-jarvis\apps\presales-crm
npm run dev
```

Configure `apps/presales-crm/.env.local`:

```text
JARVIS_DEV_API_BASE_URL=http://127.0.0.1:3000
JARVIS_DEV_INTERNAL_API_KEY=<same value as root JARVIS_INTERNAL_API_KEY>
```

Open the local Vite URL, authenticate into CRM, open **Jarvis** from the left sidebar, tab **Диалоги**.

In production build the Jarvis section is visible, but the working dev Lab is not available there.

## TEST A — basic qualification

Send:

```text
Мне нужны 3 сетки
```

Expected:

- Jarvis asks short reasonable clarifying questions
- Transcript shows `Клиент` / `Jarvis`
- Order state panel updates without exposing tool/system internals

## TEST B — price

Drive the dialog to a trusted preliminary quote.

Expected:

- UI quote equals Jarvis trusted quote
- No supplier/BOM/actual-cost internals in the panel

## TEST C — price accepted but measurement not agreed

Accept price without explicit measurement agreement.

Expected:

- Readiness remains below full measurement readiness
- Measurement action is not `AUTO_ALLOWED`

## TEST D — explicit combined acceptance

Send something like:

```text
Да, всё устраивает, записывайте
```

Expected:

- `price accepted = yes`
- `measurement agreed = yes`
- Readiness = `READY_FOR_MEASUREMENT`
- Measurement action = `AUTO_ALLOWED`
- Banner: `ТЕСТОВЫЙ РЕЖИМ — заявка не отправлена`
- **No** operational measurement write

## TEST E — correction

After quote, change color / mesh / quantity.

Expected:

- Quote stale/recalculation behavior matches current Jarvis policy
- UI quote updates after canonical refresh

## TEST F — HUMAN mode

Switch to `HUMAN` in **Jarvis → Управление**, send a customer message.

Expected:

- Message persists in transcript
- `aiReply = null`
- Banner: `HUMAN — Jarvis не отвечает`

Switch back to `AI` and continue in the same transcript.

## TEST G — reload

Reload the browser while Jarvis → Диалоги is open.

Expected:

- Same active conversation restores from localStorage
- Transcript and order state reload from backend

## TEST H — failed/retried message

Stop Jarvis backend or break network, send a message, click **Повторить**.

Expected:

- Same `messageId` and same text on retry
- No duplicate customer/AI messages after recovery
