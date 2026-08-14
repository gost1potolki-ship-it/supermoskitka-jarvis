# Калькулятор ПК (офлайн)

Настольная версия на базе **того же кода расчёта**, что и приложение замерщика `calc_v2`.

## Документация

- Полная схема ценообразования: [`../calc_v2/docs/DESKTOP_CALCULATOR_PRICING_SCHEMA.md`](../calc_v2/docs/DESKTOP_CALCULATOR_PRICING_SCHEMA.md)
- JSON Schema полей: `../calc_v2/docs/desktop-calculator-input.schema.json`

## Что используется из calc_v2

| Модуль | Назначение |
|--------|------------|
| `logic/calculations.ts` → `calculatePrice` | Цена позиции |
| `logic/orderTotals.ts` → `calculateOrderTotals` | Итог заказа (монтаж 900/500, доставка, скидка, QR) |
| `docs/prices-export/prices-full.json` | Прайс без Firebase |
| `docs/prices-export/product-fields-matrix.json` | Какие поля у какого типа |
| `calc-spec.json` (локально) | Списки значений в выпадающих списках |

## Обновление прайса

В каталоге `calc_v2`:

```bash
npm run export:desktop-prices
```

Пересоберите ПК-калькулятор:

```bash
cd ../Calc_to_web
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

Firebase и Apps Script **не используются**.
