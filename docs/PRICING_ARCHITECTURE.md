# Pricing architecture (Task 11.1.1)

## Two independent catalogs

Jarvis maintains **two semantic layers** that must never be conflated:

| Layer | Purpose | Role after Task 11.1.1 |
| --- | --- | --- |
| **Legacy Selling Catalog** | Historical commercial calculator — **authoritative customer price** | Unchanged. `publicTotalRub === Calculation Engine total` |
| **Actual Cost Catalog** | Owner-confirmed purchase costs | Internal profitability analytics only |

Updating actual costs must **not** rewrite, raise, or lower customer selling prices.

Actual Cost Catalog is configuration data (`src/calculation/actual-cost/`). It is **not** duplicated per lead in Order Memory.

---

## Customer price invariant

```text
FINAL CUSTOMER PRICE = LEGACY CALCULATION ENGINE TOTAL
publicTotalRub === outcome.total
```

Actual Cost Engine must never:

- raise or lower customer price;
- apply psychological adjustment (9000 → 8970 is **not active**);
- substitute the legacy formula;
- block a quote because actual cost is incomplete.

---

## Profitability analytics (internal)

```text
LEGACY SELLING ENGINE → customer price → Preliminary Quote
                      ↘ Actual Cost Engine → Profitability Analytics
```

When cost basis is **EXACT**:

```text
grossProfitRub     = sellingTotalRub - actualDirectCostRub
grossMarginPercent = grossProfitRub / sellingTotalRub × 100
markupPercent      = grossProfitRub / actualDirectCostRub × 100
```

Example: cost 4400 / selling 8800 → profit 4400, **margin 50%**, **markup 100%**.

Bands (indicators only — they do not change price or readiness):

| Band | Rule |
| --- | --- |
| GREEN | gross margin ≥ 50% |
| YELLOW | 47% ≤ gross margin < 50% |
| RED | gross margin < 47% |
| UNAVAILABLE | exact direct cost cannot be proven |

`PARTIAL` / `UNAVAILABLE` must not invent exact margin or markup.

Implementation: `src/jarvis/pricing/profitability-analytics.ts`.

Psychological pricing is **postponed / not active**.

---

## FRAME actual cost (known BOM)

For FRAME, a **known subtotal** is built from confirmed components:

- frame profile 25 (perimeter, rounded up to whole meters)
- impost (when height > 1000 mm)
- mesh (exact m²)
- PVC corners (4)
- cord
- impost connectors (2 when impost applies)
- manufacturing labor

Missing hardware (handles, Z/plunger quantity, screws) is **never treated as 0** for an EXACT claim → `PARTIAL` + `FRAME_HARDWARE_ACTUAL_COST_UNKNOWN`.

FRAME profile **32** never silently uses profile 25 actual cost → `FRAME_PROFILE_32_ACTUAL_COST_UNKNOWN`.

CUSTOM_RAL painting actual cost is not inferred from the legacy RAL surcharge.

Catalog prices (including screws) may exist without being included in an EXACT BOM.

### V1 waste reserve

```text
LINEAR_PROFILE_WASTE_RATE = 5%  (profile + impost)
MESH_WASTE_RATE           = 5%  (mesh)
```

### Poll-tex / ANTIDUST

Invoice: 432.79 ₽ / linear m net, VAT 22%, width 1.6 m → **330.00 ₽/m²**.

### Verification fixture

600×1800 mm, WHITE, STANDARD mesh — known materials + labor ≈ 704.90 ₽ (not an EXACT claim).

---

## ORDER DIRECT COST (analytics)

```text
known order direct subtotal =
  sum(known FRAME product subtotals)
+ measurement direct cost
+ delivery direct cost
+ installation direct cost
```

| Service | Direct cost |
| --- | --- |
| Measurement (city visit) | 1000 ₽ / order |
| City delivery | 1000 ₽ / order |
| FRAME installation | 500 ₽ × installed FRAME qty |

Self-pickup: all three = 0. Public measurement/install charges are also off on the trusted pickup request.

Regional/out driver payout unknown → profitability `PARTIAL`/`UNAVAILABLE` with `REGIONAL_DELIVERY_DIRECT_COST_UNKNOWN`. **Quote still succeeds** if the legacy engine calculated.

WING / mixed orders: quote succeeds; profitability is not EXACT.

---

## Quote trust vs economics

| Concern | Field |
| --- | --- |
| Customer quote trust | `quoteTrustStatus: TRUSTED_LEGACY_CALCULATION` |
| Internal economics | `OrderProfitabilitySnapshot` (`EXACT` / `PARTIAL` / `UNAVAILABLE`) |

Legacy documents with `marginGuardPassed: true` or Task 11.1 `pricingPolicyStatus` values migrate to `TRUSTED_LEGACY_CALCULATION`. Unknown status → `PersistenceDataError`.

Trusted quotes are created only via `calculateTrustedPreliminaryQuote` after:

```text
trusted normalized input → Calculation Engine → calculated outcome → proof
```

Callers cannot pass a fabricated `CalculationOutcome` into a public proof factory. A plain object or forged constructor token cannot become a readiness-qualified quote.

When FRAME actual cost `missingCostReasons` is empty and known subtotal > 0, profitability becomes `EXACT` automatically (orchestration path). Incomplete hardware/profile still yields `PARTIAL`.

Partial known subtotals are never exposed as exact-looking `totalDirectCostRub`.

---

## Customer vs owner visibility

**Customer / main LLM** may receive:

- public selling total, quote id, current/stale state

**Never** in `SafeToolResult` or `buildOrderMemoryContext()`:

- actual/direct cost, known subtotal, profit, margin, markup, band, supplier prices, waste %, labor/measurement/install/delivery payouts, missing internal cost reasons

---

## Trusted preliminary input

`TrustedPreliminaryCalculationInput` remains the single normalized source for:

- Calculation Engine request (legacy selling)
- Actual cost analytics
- Quote fingerprint
- `PreliminaryQuoteSnapshot`

Resolver wins over LLM tool dimensions. Pickup: `installation.enabled = false`, `measurement.includeFee = false`.
