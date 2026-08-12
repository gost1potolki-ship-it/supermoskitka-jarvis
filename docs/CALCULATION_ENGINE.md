# Calculation Engine — provenance

## Source project

- Path: `D:\calc_v2`
- Git commit: `66465b172c105dc259c2772e1c872b2e10e521c9`
- Commit message: `limit app archive to current measurer`

## Source files

- `logic/calculations.ts` → `src/calculation/legacy/calculations.ts`
- `logic/orderTotals.ts` → `src/calculation/legacy/order-totals.ts`
- calculation-related subset of `types.ts` → `src/calculation/legacy/types.ts`
- `constants.ts` → `PRICES` snapshot for:
  - legacy `DEFAULT_PRICES` floor used by `orderTotals` (`embedded-default-prices.ts`)
  - test/parity fixture (`tests/fixtures/calculation-prices.ts`)

## What was ported

- `roundToTens`
- `calculatePrice` and private engines (`ClassicEngine`, `PlisseNetEngine`, `BlindsEngine`, `RollEngine`, `MaintenanceEngine`)
- `calculateOrderTotals` and related archive/manager helpers from the same file

## Jarvis V1 public product scope

Supported:

- `FRAME`
- `WING`
- `DOOR`
- `PLISSE_NET`

Intentionally unsupported via public `CalculationEngine`:

- `ROLL` (temporarily not manufactured)
- `INSIDE_INSERT`
- `JALOUSIE_CLASSIC` / `JALOUSIE_LIGHT` / `JALOUSIE_COZY`
- `SEAL` / `COMB` / `CHILD_LOCK` / `ADJUSTMENT`

Legacy formulas for unsupported products remain inside the ported file for fidelity, but are not exposed by the Jarvis adapter.

## Door policy (adapter boundary)

- Public contract supports door profiles `32` / `42`
- Latch and hinges are supported
- `hasBolt` / шпингалет is **not** part of the Jarvis public contract
- Adapter always calls legacy calculator with `hasBolt = false`

## Prices

- Live prices are **not** hardcoded as Jarvis production source of truth
- Runtime prices come from `PriceCatalogProvider`
- `tests/fixtures/calculation-prices.ts` is a **TEST / PARITY SNAPSHOT**
- Firestore / remote `config/prices` is **not** connected on Task 06

## Customer type / discount

- `customerType` is accepted for future policy
- It does **not** auto-apply dealer/corporate discounts
- Discount is applied only when explicitly provided as `0 | 5 | 10` (legacy UI values)

## Known legacy notes (not fixed here)

- Regional delivery km rate in snapshot is `50` ₽/km (`constants.ts`), while Knowledge Base text mentions `60` ₽/km — engine follows legacy source
- `PlisseThreshold = 'reinforced'` exists in types but is unused by formula
- Classic pet mesh key is `anticat`; plisse pet mesh key is `antikoshka`
