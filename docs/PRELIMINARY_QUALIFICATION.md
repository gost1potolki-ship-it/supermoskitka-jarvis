# Preliminary qualification (Task 11)

## Purpose

Jarvis can quote a **preliminary all-in price** before measurement while keeping customer-facing facts separate from internal economics.

## Size resolution

| Product | No customer sizes | With sizes, no basis | With sizes + basis |
| --- | --- | --- | --- |
| FRAME / WING | calc uses **800×1600** (`ESTIMATED_AVERAGE`); **never** written to Order Memory | `NEEDS_SIZE_BASIS` | `PRODUCT_SIZE` as-is or `LIGHT_OPENING` (+40 mm each side) |
| DOOR / PLISSE_NET | `NEEDS_INPUT` (no average) | `NEEDS_SIZE_BASIS` | same basis rules |

Customer dimensions in Order Memory stay exactly as stated. Calculation may use adjusted sizes internally for `LIGHT_OPENING`.

## Selling vs actual cost (Task 11.1.1)

Dual-catalog architecture: see **`docs/PRICING_ARCHITECTURE.md`**.

1. Legacy Selling Engine remains the **authoritative customer-price engine**.
2. Actual Cost Catalog **cannot mutate** customer price.
3. Profitability is internal analytics (`grossProfit`, `grossMarginPercent`, `markupPercent` when EXACT).
4. 50% GREEN target and 47% warning floor are **indicators only**.
5. Psychological pricing is postponed / **not active**.
6. Incomplete actual cost **never blocks** an otherwise valid legacy quote (WING, mixed, regional, FRAME 32).
7. Exact margin/markup only when a complete cost basis is proven.
8. Internal economics never reaches customer LLM / `SafeToolResult`.

Pickup trusted request: `installation.enabled = false`, `measurement.includeFee = false`.

## Preliminary quote snapshot

After a successful trusted `PRELIMINARY_ALL_IN` calculation, Jarvis stores:

- `quoteId`, `inputFingerprint`, `publicTotalRub`, `pricingPolicyVersion`, `quoteTrustStatus: TRUSTED_LEGACY_CALCULATION`
- Optional `calculationVersion`, `priceVersion`

Legacy Firestore docs with `marginGuardPassed: true` or Task 11.1 `pricingPolicyStatus` values decode as `TRUSTED_LEGACY_CALCULATION`. Unknown status → `PersistenceDataError`.

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
