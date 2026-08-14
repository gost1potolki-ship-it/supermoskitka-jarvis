# Калькулятор ПК (офлайн)

Настольная версия на базе **того же кода расчёта**, что и приложение замерщика `../measurer`.

## Документация

- Полная схема ценообразования: [`../measurer/docs/DESKTOP_CALCULATOR_PRICING_SCHEMA.md`](../measurer/docs/DESKTOP_CALCULATOR_PRICING_SCHEMA.md)
- JSON Schema полей: `../measurer/docs/desktop-calculator-input.schema.json`

## Что используется из measurer

| Модуль | Назначение |
|--------|------------|
| `logic/calculations.ts` → `calculatePrice` | Цена позиции |
| `logic/orderTotals.ts` → `calculateOrderTotals` | Итог заказа (монтаж 900/500, доставка, скидка, QR) |
| `docs/prices-export/prices-full.json` | Прайс без Firebase |
| `docs/prices-export/product-fields-matrix.json` | Какие поля у какого типа |
| `calc-spec.json` (локально) | Списки значений в выпадающих списках |

## Обновление прайса

В каталоге `../measurer`:

```bash
npm run export:desktop-prices
```

Затем из `apps/presales-crm` пересоберите ПК-калькулятор:

```bash
npm run build
```

## Запуск

```bash
npm install
npm run dev
```

Сборка для офиса: `npm run build` → папка `dist/`, открыть через `npm run preview` или любой статический сервер.

## Функции

- Расчёт всех типов изделий (как в замерщике)
- Корзина с монтажом, доставкой, скидкой, QR
- **Экспорт КП** в `.txt`

## Интеграции

CRM продолжает читать рабочие данные из Firebase/Firestore. Кнопка «Записать
на замер» не пишет operational Firestore из браузера: она делает один вызов
dedicated measurement webhook. Measurement Intake Apps Script сначала
merge-safe обновляет `upcoming_measurements/{submissionId}` через Firestore
REST, затем upsert-ит строку листа `Замеры`.

Production-visible layout листа не меняется:

```text
Имя | Телефон | Адрес | Изделия | Заказчик | сумма
```

`submission_id` добавляется только справа как техническая колонка. Значение
`Изделия` также попадает в legacy Firestore field `comment`; отдельный свободный
комментарий не заменяет список изделий.

Финансовая модель Task 14.1.1:

```text
preliminaryTotalRub   = полная предварительная сумма заказа
measurerPayoutRub     = выплата замерщику, сейчас 1000
measurerPayer         = CUSTOMER | COMPANY
customerDepositRub    = уже внесённая клиентом сумма в счёт заказа
remainingBalanceRub   = остаток клиента после замера
```

На листе `Замеры` колонка E — кто платит замерщику (`Заказчик` / `фирма`), колонка
F — выплата замерщику (`1000`), а не полная сумма заказа. При `CUSTOMER` депозит
равен выплате; при `COMPANY` депозит `0`, остаток равен полной сумме.

Для локального запуска задайте в `.env.local`:

```text
VITE_MEASUREMENT_SHEET_WEBHOOK_URL=
```

Реальный URL не хранится в репозитории. Production-order webhook
`VITE_GOOGLE_SHEET_WEBHOOK_URL` остаётся отдельным от записи на замер.

## Jarvis (permanent CRM section)

`Jarvis` — постоянный раздел Presales CRM для управления ИИ-менеджером SuperMoskitka.

- Sidebar: **Калькулятор → Jarvis → Клиенты**
- Страница с вкладками **Диалоги / Управление / Настройки**
- В production build раздел виден, но рабочие каналы ещё не подключены

## Jarvis Lab (local dev only, inside Jarvis → Диалоги)

`Jarvis Lab` — dev-only функциональность внутри вкладки **Диалоги** для живого диалога с Jarvis через локальный Vite proxy `/jarvis-dev`.

- **Не** production customer channel
- **Не** measurement executor
- **Не** пишет `upcoming_measurements`, Google Sheet или другие operational namespaces

Настройка:

```text
JARVIS_DEV_API_BASE_URL=http://127.0.0.1:3000
JARVIS_DEV_INTERNAL_API_KEY=
```

Переменные задаются в `apps/presales-crm/.env.local` без префикса `VITE_`. Bearer добавляется только на Node-side Vite dev proxy.

Ручной чеклист: [`docs/testing/JARVIS_LAB_MANUAL_TEST.md`](../../docs/testing/JARVIS_LAB_MANUAL_TEST.md)
