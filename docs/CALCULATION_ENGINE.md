# Calculation Engine — provenance & reconciliation

## Source project

- Path: `D:\calc_v2`
- Git commit: `66465b172c105dc259c2772e1c872b2e10e521c9`
- Commit message: `limit app archive to current measurer`

## Source files

- `logic/calculations.ts` → `src/calculation/legacy/calculations.ts`
- `logic/orderTotals.ts` → `src/calculation/legacy/order-totals.ts`
- calculation-related subset of `types.ts` → `src/calculation/legacy/types.ts`
- `constants.ts` → price snapshots:
  - `tests/fixtures/calculation-prices-legacy.ts` (**PARITY / historical**)
  - `tests/fixtures/calculation-prices-current.ts` (**CURRENT base catalog**)
  - `src/calculation/legacy/embedded-default-prices.ts` (legacy `orderTotals` measurement floor only)

## Two baselines

| Baseline | Meaning |
| --- | --- |
| **PARITY** | historical legacy behavior of `calc_v2 @ 66465b1` |
| **CURRENT** | approved current SuperMoskitka business behavior for Jarvis V1 |

PARITY expected values must not be rewritten to match CURRENT policy.

## Jarvis V1 public product scope

Supported:

- `FRAME`
- `WING`
- `DOOR`
- `PLISSE_NET`

Unsupported via public API:

- `ROLL`, `INSIDE_INSERT`, jalousie variants, maintenance products

## Public contract notes

- Public calculation types do **not** import legacy UI unions
- Product-specific discriminated `CalculationItemInput`
- Canonical mesh: `STANDARD | ANTIMOSHKA | ANTICAT | ANTIDUST`
- Canonical colors: `WHITE | BROWN_8017 | GRAY_7016 | CUSTOM_RAL`
- FRAME fastening: `Z_METAL | PLUNGER` only (no plastic Z)
- DOOR has no `hasBolt`; adapter always passes `hasBolt = false`
- CUSTOM_RAL `finish` is stored as metadata; legacy arithmetic uses color key `ral` only (no invented finish surcharge)

## Price / rules source

- Live prices are not hardcoded as Jarvis production source of truth
- Runtime catalog comes from `PriceCatalogProvider`
- Current labor/km overrides live in versioned `businessRules` on the snapshot
- Knowledge Base text is **not** parsed for arithmetic
- Firestore is not connected

## Reconciliation table

| Rule | Legacy behavior | Current rule | Status |
| --- | --- | --- | --- |
| FRAME labor STANDARD/ANTIMOSHKA | `assembly_labor = 250` | 250 | MATCH |
| FRAME labor ANTICAT/ANTIDUST | `assembly_labor = 250` | 300 | OVERRIDDEN_BY_CURRENT_POLICY |
| FRAME labor + PLUNGER | same labor 250 | 300 (priority, not summed) | OVERRIDDEN_BY_CURRENT_POLICY |
| WING labor | `assembly_labor = 250` | 500 | OVERRIDDEN_BY_CURRENT_POLICY |
| DOOR labor | `door_assembly_labor = 850` | 850 | MATCH |
| Regional delivery km | 50 ₽/km in snapshot | 60 ₽/km | OVERRIDDEN_BY_CURRENT_POLICY |
| Metal Z only for ordinary frame | plastic Z exists in legacy UI | public FRAME allows only Z_METAL/PLUNGER | OVERRIDDEN_BY_CURRENT_POLICY |
| WING flags fastening | ClassicEngine prices mount as `z_metal` perimeter path | business fastening = flags; no confirmed flags price key | UNRESOLVED |
| No door bolt | optional `hasBolt` in legacy | public contract omits bolt; adapter forces false | MATCH |
| Door handles/latch | one `handle_door_42mm` line + optional latch | standard kit asserted as 2 handles + latch in adapter metadata; formula still one handle line item | UNRESOLVED |
| 2 mandatory door imposts | impost materials only for FRAME/WING when height > 1m; **not for DOOR** | business requires 2 door imposts | UNRESOLVED |
| Mesh naming classic vs plisse | `anticat` vs `antikoshka`; antidust `antipyl` | explicit mapper; PLISSE+ANTIMOSHKA rejected | MATCH |
| Reinforced plisse threshold | type exists; formula ignores | no invented surcharge; warning emitted | NOT_PRICE_AFFECTING |

## CURRENT RECONCILIATION GAPS

1. **WING flags** — legacy ClassicEngine still uses classic mount cost path (`z_metal`), not a dedicated flags SKU/price.
2. **DOOR imposts** — legacy formula does not add two imposts for DOOR; not invented in Task 06.1.
3. **Door handle line** — unclear whether `handle_door_42mm` is one handle or a pair; arithmetic left unchanged.
4. **PLISSE REINFORCED** — no price effect in legacy engine.
