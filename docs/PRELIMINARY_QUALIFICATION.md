# Preliminary qualification (Task 11)

## Purpose

Jarvis can quote a **preliminary all-in price** before measurement while keeping customer-facing facts separate from internal economics.

## Size resolution

| Product | No customer sizes | With sizes, no basis | With sizes + basis |
| --- | --- | --- | --- |
| FRAME / WING | calc uses **800×1600** (`ESTIMATED_AVERAGE`); **never** written to Order Memory | `NEEDS_SIZE_BASIS` | `PRODUCT_SIZE` as-is or `LIGHT_OPENING` (+40 mm each side) |
| DOOR / PLISSE_NET | `NEEDS_INPUT` (no average) | `NEEDS_SIZE_BASIS` | same basis rules |

Customer dimensions in Order Memory stay exactly as stated. Calculation may use adjusted sizes internally for `LIGHT_OPENING`.

## Margin guard and commercial pricing (Task 11.1)

Dual-catalog architecture: see **`docs/PRICING_ARCHITECTURE.md`**.

Legacy selling total comes from the unchanged Calculation Engine. Actual order direct cost uses FRAME BOM + service direct costs. Commercial policy:

```text
rawCommercialPrice = max(legacyCommercialTotal, ceil(orderDirectCost / 0.50))
finalPrice         = max(rawCommercialPrice, hardFloor47) + optional psych adjustment
hardFloor47        = ceil(orderDirectCost / 0.53)
```

- Service **direct** costs (not public selling charges): measurement 1000, city delivery 1000, install 500×FRAME qty; all zero on self-pickup.
- Regional/out delivery → fail closed (`DIRECT_COST_BASIS_INCOMPLETE`).
- Margin and direct cost are **never** shown to the customer or LLM tool JSON.

## Product pricing strategies (Task 11.1)

| Order mix | Strategy | Quote status |
| --- | --- | --- |
| FRAME only | Actual BOM + commercial policy (50% target, 47% floor, psych) | `FRAME_COMMERCIAL_PRICING_PASSED` |
| DOOR / PLISSE_NET only | Engine public total unchanged | `EXISTING_PRODUCT_FORMULA` |
| WING only / mixed FRAME+other | Fail closed on guarded path | no quote |

Legacy v1 quotes with `marginGuardPassed: true` decode as `FRAME_MARGIN_GUARD_PASSED` (still valid for readiness).

## Preliminary quote snapshot

After a successful guarded `PRELIMINARY_ALL_IN` calculation, Jarvis stores:

- `quoteId`, `inputFingerprint`, `publicTotalRub`, `pricingPolicyVersion`, `pricingPolicyStatus`
- Optional `calculationVersion`, `priceVersion`

Legacy Firestore docs with `marginGuardPassed: true` decode as `FRAME_MARGIN_GUARD_PASSED`.

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
