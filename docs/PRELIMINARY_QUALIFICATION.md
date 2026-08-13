# Preliminary qualification (Task 11)

## Purpose

Jarvis can quote a **preliminary all-in price** before measurement while keeping customer-facing facts separate from internal economics.

## Size resolution

| Product | No customer sizes | With sizes, no basis | With sizes + basis |
| --- | --- | --- | --- |
| FRAME / WING | calc uses **800×1600** (`ESTIMATED_AVERAGE`); **never** written to Order Memory | `NEEDS_SIZE_BASIS` | `PRODUCT_SIZE` as-is or `LIGHT_OPENING` (+40 mm each side) |
| DOOR / PLISSE_NET | `NEEDS_INPUT` (no average) | `NEEDS_SIZE_BASIS` | same basis rules |

Customer dimensions in Order Memory stay exactly as stated. Calculation may use adjusted sizes internally for `LIGHT_OPENING`.

## Margin guard (47% floor)

```text
margin = (publicTotal - trustedDirectCost) / publicTotal
if margin < 0.47 → publicTotal = ceil(trustedDirectCost / 0.53)
```

- `trustedDirectCost` = sum(item materials+labor [+ RAL painting]) + measurementFee + installTotal + deliveryCost
- Never lower public price
- If direct cost unavailable → `MARGIN_COST_BASIS_UNAVAILABLE` (fail closed)
- Margin and direct cost are **never** shown to the customer or LLM tool JSON

## Preliminary quote snapshot

After a successful `PRELIMINARY_ALL_IN` calculation with margin guard passed, Jarvis stores:

- `quoteId`, `inputFingerprint`, `publicTotalRub`, `pricingPolicyVersion`, `marginGuardPassed: true`
- Optional `calculationVersion`, `priceVersion`

Fingerprint covers price-relevant fields (products, resolved sizes, mesh, color, fulfillment) — not customer name.

## Commercial consent (separate)

| Fact | Meaning |
| --- | --- |
| `preliminaryPriceAccepted` | Client explicitly agrees to the quoted preliminary price |
| `measurementAgreed` | Client explicitly agrees to schedule measurement |

Price acceptance binds `acceptedPreliminaryQuoteId` to the current non-stale quote.

Quoted amounts from chat are **never** extracted as authoritative facts.

## Measurement action policy

Default: `AUTO_WHEN_READY`

When lead readiness is `READY_FOR_MEASUREMENT`, internal decision may be `AUTO_ALLOWED`. This does **not** write to CRM (`measurements`, `ready_orders`, etc.).
