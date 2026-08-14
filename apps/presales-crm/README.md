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

CRM читает и записывает рабочие данные через Firebase/Firestore. Кнопка
«Записать на замер» создаёт или обновляет документ
`upcoming_measurements/{submissionId}` и отдельно синхронизирует проекцию в
Google Таблицу через dedicated measurement webhook.

Для локального запуска задайте в `.env.local`:

```text
VITE_MEASUREMENT_SHEET_WEBHOOK_URL=
```

Реальный URL не хранится в репозитории. Production-order webhook
`VITE_GOOGLE_SHEET_WEBHOOK_URL` остаётся отдельным от записи на замер.
