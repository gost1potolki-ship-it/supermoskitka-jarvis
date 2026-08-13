# Lead readiness (Task 11)

## Status

| Status | Meaning |
| --- | --- |
| `NOT_READY` | Missing data, stale quote, or missing consent |
| `READY_FOR_MEASUREMENT` | All gates passed; measurement draft can be built |

## Blocking codes

| Code | Trigger |
| --- | --- |
| `PRODUCT_MISSING` | No items or missing `productType` |
| `NEEDS_INPUT` | DOOR/PLISSE without sizes, or partial dimensions |
| `NEEDS_SIZE_BASIS` | Sizes present without `measurementBasis` |
| `QUOTE_MISSING` | No `preliminaryQuote` on memory |
| `PRICING_POLICY_INCOMPLETE` | Quote missing valid `pricingPolicyStatus` (`FRAME_COMMERCIAL_PRICING_PASSED`, legacy `FRAME_MARGIN_GUARD_PASSED`, or `EXISTING_PRODUCT_FORMULA`) |
| `QUOTE_STALE` | Fingerprint changed or acceptance bound to old quote |
| `PRICE_NOT_ACCEPTED` | `preliminaryPriceAccepted !== true` |
| `MEASUREMENT_NOT_AGREED` | `measurementAgreed !== true` |
| `CONTACT_MISSING` | No customer phone |
| `ADDRESS_MISSING` | No customer address |

## Measurement action decisions

| Decision | When |
| --- | --- |
| `NOT_READY` | Readiness not satisfied or policy `DISABLED` |
| `AWAITING_OWNER_APPROVAL` | Ready but policy `ALWAYS_MANUAL` |
| `AUTO_ALLOWED` | Ready and policy `AUTO_WHEN_READY` |

`AUTO_ALLOWED` is an internal signal only — no CRM write in Task 11.

## Measurement draft

`buildMeasurementDraft(memory)` returns customer contact, item facts (including customer-stated sizes), fulfillment flags, and quote ids — **no** cost or margin fields.
