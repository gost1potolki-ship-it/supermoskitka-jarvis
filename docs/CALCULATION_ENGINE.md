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

## Versions

- `calculationVersion`: `supermoskitka-calculation-v1.2` (runtime fail-closed enums + PLISSE antimoshka price reference)
- `businessRulesVersion` (CURRENT): `current-business-rules-v1.2`

## Jarvis V1 public product scope

Supported:

- `FRAME`
- `WING`
- `DOOR` (profile **42** only in CURRENT until 32mm hardware pricing is confirmed)
- `PLISSE_NET` (including `ANTIMOSHKA` via current price reference)

Unsupported via public API:

- `ROLL`, `INSIDE_INSERT`, jalousie variants, maintenance products

## Public contract notes

- Public calculation types do **not** import legacy UI unions
- Product-specific discriminated `CalculationItemInput`
- Canonical mesh: `STANDARD | ANTIMOSHKA | ANTICAT | ANTIDUST`
- Canonical colors: `WHITE | BROWN_8017 | GRAY_7016 | CUSTOM_RAL`
- `GRAY_7016` is the single business color. Legacy keys `gray` and `anthracite` are technical aliases for the same color (classic → `gray`, plisse → `anthracite`)
- FRAME fastening: `Z_METAL | PLUNGER` only (no plastic Z)
- DOOR has no `hasBolt`; adapter always passes `hasBolt = false`
- CUSTOM_RAL `finish` is stored as metadata; legacy arithmetic uses color key `ral` only (no invented finish surcharge)
- Runtime JSON callers: all public enum-like fields are validated fail-closed (unknown → `needs_input` / `unsupported`, never silent default)

## Price / rules source

- Live prices are not hardcoded as Jarvis production source of truth
- Runtime catalog comes from `PriceCatalogProvider`
- Current labor/km overrides and PLISSE mesh price references live in versioned `businessRules` on the snapshot
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
| GRAY_7016 naming | classic `gray` / plisse `anthracite` keys | one canonical `GRAY_7016` | MATCH_AFTER_NORMALIZATION |
| PLISSE ANTIMOSHKA | no separate plisse catalog key | supported; mesh unit price references PLISSE ANTIDUST (`antipyl`) | OVERRIDDEN_BY_CURRENT_POLICY |
| WING flags fastening | ClassicEngine prices mount as `z_metal` perimeter path | business fastening = flags; no confirmed flags price key | UNRESOLVED |
| No door bolt | optional `hasBolt` in legacy | public contract omits bolt; adapter forces false | MATCH |
| Door handles/latch | one `handle_door_42mm` line + optional latch | standard kit asserted as 2 handles + latch in adapter metadata; formula still one handle line item | UNRESOLVED |
| 2 mandatory door imposts | impost materials only for FRAME/WING when height > 1m; **not for DOOR** | business requires 2 door imposts | UNRESOLVED |
| DOOR 32 | formula can use `standard_32mm` profile + 42mm hardware lines | refuse silent 42mm hardware substitution | CURRENT_PRICING_GAP |
| Reinforced plisse threshold | type exists; formula ignores | no invented surcharge; warning emitted | NOT_PRICE_AFFECTING_IN_CURRENT_ENGINE |

## CURRENT RECONCILIATION GAPS

1. **WING flags** — legacy ClassicEngine still uses classic mount cost path (`z_metal`), not a dedicated flags SKU/price.
2. **DOOR imposts** — legacy formula does not add two imposts for DOOR; not invented.
3. **Door handle line** — unclear whether `handle_door_42mm` is one handle or a pair; arithmetic left unchanged (not multiplied by 2).
4. **PLISSE REINFORCED** — no price effect in legacy engine (`NOT_PRICE_AFFECTING_IN_CURRENT_ENGINE`).
5. **DOOR 32** — profile `standard_32mm` exists, but dedicated 32mm door hardware (handles/hinges/corners) does not; CURRENT returns `unsupported` / `CURRENT_PRICING_GAP` instead of silently billing 42mm SKUs.
