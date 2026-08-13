# Pricing architecture (Task 11.1)

## Two independent catalogs

Jarvis maintains **two semantic layers** that must never be conflated:

| Layer | Purpose | Mutability in Task 11.1 |
| --- | --- | --- |
| **Legacy Selling Catalog** | Historical commercial calculator — what the client pays under existing product formulas | **Unchanged** |
| **Actual Cost Catalog** | Owner-confirmed purchase costs — what the company spends today | **Added** (V1) |

Updating actual costs must **not** silently rewrite legacy selling prices. GRAY / premium configurations may keep higher public prices even when actual material cost is closer to WHITE.

Actual Cost Catalog is configuration data (`src/calculation/actual-cost/`). It is **not** duplicated per lead in Order Memory.

---

## FRAME actual cost (BOM)

For FRAME only, product direct cost is built bottom-up from:

- frame profile (perimeter, rounded up to whole meters)
- impost (when height > 1000 mm, width rounded up to whole meters)
- mesh (exact m²)
- corners (4 for standard rectangle)
- cord (perimeter rounded up)
- impost connectors (2 when impost applies)
- manufacturing labor (from current business rules)

### V1 waste reserve

Centralized in `actual-cost-config.ts`:

```text
LINEAR_PROFILE_WASTE_RATE = 5%  (profile + impost)
MESH_WASTE_RATE           = 5%  (mesh)
```

5% is a provisional operational reserve; owner can adjust later.

### Verification fixture

600×1800 mm, WHITE, STANDARD mesh:

```text
base materials     ≈ 435.80 ₽
waste              ≈  19.10 ₽
materials + waste  ≈ 454.90 ₽
labor (STANDARD)      250 ₽
product direct cost ≈ 704.90 ₽
```

---

## ORDER DIRECT COST

Profitability is evaluated on the **whole order**, not product cost alone:

```text
ORDER DIRECT COST =
  sum(actual FRAME product direct costs)
+ measurement direct cost
+ delivery direct cost
+ installation direct cost
```

### Service direct costs (V1)

| Service | Direct cost |
| --- | --- |
| Measurement (city visit) | 1000 ₽ / order |
| City delivery | 1000 ₽ / order |
| FRAME installation | 500 ₽ × installed FRAME qty |

**Self-pickup** (client measures, picks up, installs): all three service direct costs = 0.

### Public charges ≠ direct costs

Legacy engine public totals include selling charges (e.g. 800 ₽/frame install). These are **never** used as direct cost for margin analysis.

Regional/out delivery without confirmed driver payout → `DIRECT_COST_BASIS_INCOMPLETE` (fail closed).

---

## Commercial pricing policy

Pipeline:

```text
Legacy Selling Engine  → legacyCommercialTotal
Actual Cost Engine     → orderDirectCost
Commercial policy      → finalCustomerPrice
```

### Normal target — 50% gross margin

```text
targetPrice50 = ceil(orderDirectCost / 0.50)
```

### Hard floor — 47% gross margin

```text
hardFloor47 = ceil(orderDirectCost / 0.53)
grossMargin = (finalPrice - orderDirectCost) / finalPrice
```

### Raw commercial price (before psychology)

```text
rawCommercialPrice = max(legacyCommercialTotal, targetPrice50)
final = max(rawCommercialPrice, hardFloor47)
```

Legacy selling price **never reduced** merely because actual cost became cheaper (GRAY / premium preservation).

### Psychological pricing (V1)

If `raw ∈ [N×1000, N×1000 + 50]` → candidate `N×1000 − 30` (e.g. 9000 → 8970).

Applied only when candidate still satisfies the 47% floor. No customer-facing “discount” language.

Implementation: `src/jarvis/pricing/commercial-pricing-policy.ts`.

Trusted quote status for FRAME: `FRAME_COMMERCIAL_PRICING_PASSED`.

---

## Non-FRAME products

| Product | Task 11.1 policy |
| --- | --- |
| DOOR | Existing public formula — `EXISTING_PRODUCT_FORMULA` |
| PLISSE_NET | Existing public formula — `EXISTING_PRODUCT_FORMULA` |
| WING | No trusted actual cost V1 — fail closed on guarded path |
| Mixed FRAME + other | Fail closed — no invented overall margin |

FRAME BOM and ×2 target policy are **not** applied to DOOR / PLISSE / WING.

---

## Customer vs owner visibility

**Customer / main LLM** may receive:

- `finalCustomerPriceRub`, quote id, current/stale status

**Never exposed** to customer LLM:

- Actual Cost Catalog, component costs, waste %, service payouts, order direct cost, gross margin, 50%/47% formulas, legacy vs actual delta

Future **Director Channel** may expose full economics breakdown (owner-only).

---

## Trusted preliminary input

`TrustedPreliminaryCalculationInput` is the single normalized source for:

- Calculation Engine request (legacy selling)
- Actual cost calculation
- Quote fingerprint
- `PreliminaryQuoteSnapshot`

Resolver wins over LLM tool dimensions. See `docs/PRELIMINARY_QUALIFICATION.md` for size/basis rules.

Missing required cost basis → `DIRECT_COST_BASIS_INCOMPLETE` (never `directCost ?? 0`).
