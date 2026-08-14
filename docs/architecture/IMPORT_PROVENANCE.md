# Import Provenance — Task 13

Import date: 2026-08-14 (local)

Target repository: `D:\supermoskitka-jarvis`

## apps/measurer ← calc_v2

| Field | Value |
| --- | --- |
| Source path | `D:\calc_v2` |
| Source project name | `supermoskitka-app` (measurer / calc_v2) |
| Source HEAD | `66465b172c105dc259c2772e1c872b2e10e521c9` |
| Source branch | `main` |
| Source tree | dirty (uncommitted local changes present at import time) |
| Import mode | working-tree snapshot (current local source wins) |
| Pre-import hash manifest | `docs/architecture/IMPORT_HASHES_calc_v2_preimport.json` |
| Source integrity manifest | `docs/architecture/IMPORT_HASHES_calc_v2_source_integrity_before.json` |
| Imported copy hash | `docs/architecture/IMPORT_HASHES_apps_measurer_current.json` |
| Hash compare: imported `apps/measurer` matches original importable files (250); `__pycache__` excluded as generated. Android copied web assets (`android/app/src/main/assets/public`, Capacitor generated config, `capacitor-cordova-android-plugins`, `local.properties`, `*.log`) remain on disk identical to source but stay gitignored by the original measurer Android `.gitignore` (no `git add -f`).

Excluded from import (generated / secrets / VCS):

```text
.git
node_modules
dist
build
coverage
.gradle
android/.gradle
android/app/build
functions/node_modules
.env / .env.*
*.jks / *.keystore / *.pem / *.key / *.p12
*.apk / *.aab
service-account / serviceAccount JSON
.tmp-analysis*
scripts/output
IDE caches
```

## apps/presales-crm ← Calc_to_web

| Field | Value |
| --- | --- |
| Source path | `D:\Calc_to_web` |
| Source project name | `calc-to-web-pc` (Presales CRM) |
| Source HEAD | n/a (no `.git` in source directory) |
| Source branch | n/a |
| Source tree | snapshot of current directory contents |
| Pre-import hash manifest | `docs/architecture/IMPORT_HASHES_presales_crm_preimport.json` |

Same generated/secret exclusions as above.

## Post-import wiring (allowed Task 13 changes only in CRM)

- `apps/presales-crm/vite.config.ts` — `@calc` → `../measurer`
- `apps/presales-crm/tsconfig.json` — paths/includes → `../measurer`
- `apps/presales-crm/src/auth.ts` — login/password from `VITE_PRESALES_*` env
- `apps/presales-crm/src/lib/sheet-webhook.ts` — webhook URL from `VITE_GOOGLE_SHEET_WEBHOOK_URL`
- `apps/presales-crm/.env.example` — placeholders only
- `apps/presales-crm/.env.local` — gitignored local compatibility values (not committed)
- `apps/presales-crm/src/vite-env.d.ts` — Vite `import.meta.env` types for the env wiring above

Hash compare vs CRM source: exactly the four wiring files above differ; `.env.example` and `vite-env.d.ts` are extra allowed files.

## Originals

`D:\calc_v2` and `D:\Calc_to_web` were used read-only. Task 13 must leave `D:\calc_v2` byte-for-byte unchanged vs the source integrity manifest.

Measurer import excludes generated `__pycache__` only. No business-logic edits were applied to `apps/measurer`. After the required Functions `tsc` verification, `apps/measurer/functions/lib/*` was restored from the original so the imported tree stays hash-identical to `D:\calc_v2` (except `__pycache__`). Pre-existing Google Apps Script URL literals remain in measurer source (identical to `D:\calc_v2`) and were not rewritten, because that would change runtime and break hash equality.

