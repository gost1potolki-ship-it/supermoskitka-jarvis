# Fact Extraction + Order Memory

## Architecture

```text
Customer message
  → FactExtractor (proposal only)
  → strict JSON / evidence / enum validator
  → item resolver (existing IDs / ordinal / CREATE)
  → existing Order Memory apply APIs
  → compact [INTERNAL ORDER MEMORY DATA] as untrusted user/data message
  → main LLM / calculate_order
```

Provider = transport. Memory policy = Jarvis Core.

`extract_order_facts` is an **internal** structured-output tool. It is not registered in customer `ToolRuntime`.

## Current-message source rule

New auto-applied facts always use:

```text
sourceMessageId = current CUSTOMER message id
```

Recent chat is context only (references like «вторая», «нет, всё-таки серый»).

## Evidence

Every EXPLICIT fact needs `evidenceText` that appears in the current customer message
(trim / collapse whitespace / case-insensitive / ё→е).

No evidence → proposal rejected, memory unchanged for that field.

## Explicitness

| Value | Auto-apply |
| --- | --- |
| EXPLICIT | yes, if DTO + evidence + target valid |
| UNCERTAIN | no |
| HYPOTHETICAL | no |

Confidence is diagnostic only. It never overrides these rules.

## Item matching

- UPDATE `targetItemId` must already exist
- `targetOrdinal` is 1-based and must resolve uniquely
- If both `targetItemId` and `targetOrdinal` are set, they must point to the **same** item (otherwise reject)
- CREATE: Jarvis generates `item-N` only after ≥1 applicable EXPLICIT fact (no ghost empty items)
- Invented IDs are rejected

## Supported fields (Task 09)

Customer: `name`, `phone`, `address`, `customerType`

Items: `productType`, `quantity`, `widthMm`, `heightMm`, `meshType`, `profileType`, `profileColor`, `ral`, `colorFinish`, `fastening`, `openingType`, `comment`

Fulfillment (semantic only): `installationRequested`, `pickupRequested`, `deliveryRequested`, `deliveryType`, `deliveryKm`

Prices / discounts are never written to Order Memory from extraction.

## Memory context

Main LLM sees current values only, not Fact history, source IDs, or OrderChange objects.

Order Memory is **data**, not instructions:

```text
system → trusted Jarvis instructions only
user → [INTERNAL ORDER MEMORY DATA] ... [/INTERNAL ORDER MEMORY DATA]
```

Customer-originated strings inside memory must never be elevated to `role=system`.

## Live provider

OdiRouter + `ODIROUTER_MODEL` (smoke uses `grok-4.5`) via `npm run smoke:odirouter:facts`.
