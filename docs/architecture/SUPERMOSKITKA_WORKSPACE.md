# SuperMoskitka Workspace Layout

```text
D:\supermoskitka-jarvis
│
├── Jarvis API (root)          # current Node/Express backend + Application API
├── apps/presales-crm          # office Presales CRM (imported from Calc_to_web)
└── apps/measurer              # measurer / mobile Capacitor app (imported from calc_v2)
```

## Why this layout

- Root remains the Jarvis backend repository and history.
- Jarvis sources stay in existing root paths (`src/`, `tests/`, `scripts/`, …).
- CRM and measurer are imported as independent applications under `apps/`.
- Package locks stay independent on Task 13 (no npm workspaces yet).

## Independent packages

Each app keeps its own `package.json` / lockfile:

```text
/package-lock.json                      # Jarvis
/apps/presales-crm/package-lock.json
/apps/measurer/package-lock.json
/apps/measurer/functions/package-lock.json
```

Shared packages (`packages/calculation`, contracts, monorepo workspace) are future work.

## CRM ↔ measurer calculation wiring

Presales CRM resolves `@calc` to `apps/measurer` inside this repository.

Jarvis Calculation Engine and measurer retail calculation remain separate systems until an explicit reconciliation task.

## Firestore ownership (no cross-writes in Task 13)

Jarvis runtime namespaces:

```text
jarvis_v1_conversations
jarvis_v1_order_memories
```

Operational system (Presales / measurer production):

```text
measurements
upcoming_measurements
config/prices
ready_orders
users
```

Task 13 adds **no** new writes and **no** Jarvis → operational collection integration.

## Server production builds

Task 13 does not deploy REG.RU CRM, Firebase Functions, Apps Script, or APK builds.
Imported sources are for controlled consolidation and local verification only.
