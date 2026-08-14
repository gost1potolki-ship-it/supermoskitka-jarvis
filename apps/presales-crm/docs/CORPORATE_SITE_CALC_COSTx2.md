# Себестоимость × 2 для москитных сеток на корпоративном сайте

Техническая спецификация для агента, который будет править калькулятор на **plisse-spb.ru**.

**Дата:** 2026-06-14  
**Scope:** только **Рамочные** и **КРЫЛО**. Дверные, плиссе, шторы, рулонные — не менять.

---

## 1. Контекст и файлы

| Что | Путь |
|---|---|
| **Калькулятор сайта (цель правок)** | `D:\СуперМоскитка_28_06\js\home-calculator.js` |
| Точка входа расчёта | `calcClassic(input, prices)` (~строки 121–190) |
| Роутер | `calculatePrice(input, prices)` |
| Страницы | `kalkulyator.html`, `index.html`, лендинги с `#calculator-section` |
| Закупочный прайс (себестоимость) | `D:\Calc_to_web\src\raw-prices.ts` |
| Геометрия и RAL | `D:\calc_v2\logic\calculations.ts` (ClassicEngine) |
| Полная документация формул | `D:\calc_v2\docs\DESKTOP_CALCULATOR_PRICING_SCHEMA.md` §3 |
| Розничный прайс (старая модель) | `PRICES` внутри `home-calculator.js` или `D:\calc_v2\docs\prices-export\prices-full.json` |
| CRM (опционально выровнять позже) | `D:\Calc_to_web\src\cost-calculation.ts` |

**Стек сайта:** статический HTML + vanilla JS. Серверного расчёта нет. Отдельно есть React-приложение замерщика в `/calc/` — **не трогать**.

---

## 2. Задача

Переделать расчёт **Рамочных** и **КРЫЛО** так, чтобы:

1. Программа **считала себестоимость** (материалы + сборка мастером + покраска RAL).
2. **Цена для клиента** = себестоимость × **2** (с округлением до 10 ₽).

---

## 3. Текущая логика (что заменяем)

Сейчас в `calcClassic` для классики:

```javascript
materials = /* ставки из PRICES.classic_frames — розничный прайс */
labor = 250
total = (materials + labor) × company_profit_multiplier   // ×2.0
if (color === 'ral') {
  total += Math.max(1000, Math.ceil(perimeter) × 220)
}
if (type === 'Рамочные') {
  total = Math.max(total, meshMinimum)   // 1400–3000 по полотну
}
```

### Проблема

- `materials` считаются по **розничным** ставкам (например профиль 25 мм white = **60 ₽/м**, полотно standard = **65 ₽/м²**).
- Множитель ×2 применяется к `(розничные_материалы + 250)`, а не к реальной закупке.
- Покраска RAL добавляется **после** множителя, а не внутри себестоимости.

### Целевая модель

```
costMaterials  = закупочные материалы (формула ClassicEngine, но COST_PRICES)
costAssembly   = 250 ₽
costPainting   = RAL: max(1000, ceil(perimeter) × 220), иначе 0
costTotal      = costMaterials + costAssembly + costPainting

unitPrice      = roundToTens(costTotal × 2)
total          = roundToTens(unitPrice × quantity)
```

Монтаж у клиента (500–800 ₽ в UI) — **отдельная опция**, в себестоимость изделия не входит.

---

## 4. Входные данные из UI

| Поле | Рамочные | Крыло |
|---|---|---|
| `width`, `height` | мм | мм |
| `mesh` | standard / antimoshka / anticat / antipyl | то же |
| `color` | white / brown / gray / ral | то же |
| `frameProfile` | 25 / 32 | — (всегда wing_30mm) |
| `cornerType` | plastic / aluminum | — (в движке plastic_25mm) |
| `handleType` | plastic / metal | — |
| `mount` | standard / z_metal / plunger | — |
| `quantity` | шт | шт |

### Геометрия

```
wM = width / 1000
hM = height / 1000
perimeter = (wM + hM) × 2
areaMesh = (wM + 0.1) × (hM + 0.1)    // запас полотна +100 мм
waste = 1.1
```

### Правила RAL (как в calcClassic)

- `lookupColor = 'white'` при расчёте закупочных ставок профиля/углов
- `effCorner = 'aluminum'`, `effHandle = 'metal'`
- `effMount = 'z_metal'` если был `standard`

---

## 5. Закупочный прайс (COST_PRICES)

Источник: `D:\Calc_to_web\src\raw-prices.ts` + уголки/ручки из `classic_frames` в `prices-full.json`.

| Статья | Белый | Коричн. | Серый | Примечание |
|---|---:|---:|---:|---|
| Профиль рамочный 25 мм, ₽/м | 55 | 60 | 60 | `PRICES_PROFILE` |
| Профиль крыло 30 мм, ₽/м | 77 | 80 | 80 | `wing_white` / `wing_color` |
| Импост 25 мм, ₽/м | 60 | 60 | 60 | уточнить brown/gray у бизнеса |
| Полотно standard, ₽/м² | 41 | — | — | |
| Полотно antimosquito, ₽/м² | 82 | — | — | UI: `antimoshka` |
| Полотно anticat, ₽/м² | 155 | — | — | UI: `anticat` |
| Полотно antidust, ₽/м² | 900 | — | — | UI: `antipyl` |
| Z-металл, ₽/м | 7 | 8 | 20 | mount `z_metal` |
| Z-пластик, ₽/м | 2 | 2 | 4 | mount `standard` |
| Штифты pin_41mm, ₽/шт | 95 | — | — | ×4 при `plunger` |
| Уголки пластик 25 мм, ₽/шт | 5 | 5.5 | 20 | ×4 в формуле |
| Уголки алюминий 25 мм, ₽/шт | 36 | 38 | 50 | ×4 |
| Уголки пластик 32 мм, ₽/шт | 19 | 21 | 36 | frameProfile 32 |
| Ручка пластик | 2 | 2 | 2 | |
| Ручка металл | 14 | 14 | 14 | |
| Шнур 5 мм, ₽/м | 6 | — | — | |
| Крепёж импоста | 42 | — | — | 2×15 + 12×1 |
| Коэфф. отхода профиля | 1.1 | — | — | |

**Пробел:** закупочная цена **профиля 32 мм** не зафиксирована в `raw-prices.ts`. Запросить у владельца или временно оценить (например 90% от розницы 255 ₽/м).

### Пример объекта в JS

```javascript
var COST_PRICES = {
  waste: 1.1,
  assembly: 250,
  ralPaintingRateM: 220,
  ralPaintingMin: 1000,
  profiles: {
    standard_25mm: { white: 55, brown: 60, gray: 60 },
    standard_32mm: { white: 230, brown: 234, gray: 261 },  // TODO: подтвердить закупку
    wing_30mm: { white: 77, brown: 80, gray: 80 },
    impost_25mm: { white: 60, brown: 60, gray: 60 }
  },
  corners: {
    plastic_25mm: { white: 5, brown: 5.5, gray: 20 },
    aluminum_25mm: { white: 36, brown: 38, gray: 50 },
    plastic_32mm: { white: 19, brown: 21, gray: 36 }
  },
  meshes: { standard: 41, antimoshka: 82, anticat: 155, antipyl: 900 },
  mounts: {
    cord_5mm: 6,
    pin_41mm: 95,
    impost_fasteners: 42,
    z_plastic: { white: 2, brown: 2, gray: 4 },
    z_metal: { white: 7, brown: 8, gray: 20 },
    handle_plastic: { white: 2, brown: 2, gray: 2 },
    handle_metal: { white: 14, brown: 14, gray: 14 }
  }
};
```

---

## 6. Формула себестоимости материалов

### Рамочные

```
profKey = frameProfile === '25' ? 'standard_25mm' : 'standard_32mm'
pPrice = COST_PRICES.profiles[profKey][lookupColor]
cPrice = corners по effCorner и frameProfile (цена за 1 уголок, в сумме ×4)
```

### Крыло

```
pPrice = COST_PRICES.profiles.wing_30mm[lookupColor]
cPrice = COST_PRICES.corners.plastic_25mm[lookupColor]   // даже для RAL
```

### Общая часть

```
mPrice = COST_PRICES.meshes[mesh] || meshes.standard
cordCost = perimeter × 6
mountCost = plunger ? 4×95 : perimeter × z_plastic|z_metal[lookupColor]

materials =
  perimeter × pPrice × 1.1
+ 4 × cPrice
+ areaMesh × mPrice
+ cordCost + mountCost
+ handle(plastic|metal)
```

### Импост (Рамочные и Крыло, если hM > 1.0)

```
materials += wM × impostPrice × 1.1 + 42
```

```
costMaterials = Math.round(materials)
costAssembly = 250
costPainting = isRAL ? max(1000, ceil(perimeter) × 220) : 0
costTotal = costMaterials + costAssembly + costPainting
```

---

## 7. Формула цены

```javascript
function roundToTens(value) {
  return Math.round(value / 10) * 10;
}

var cost = calcClassicCost(input, COST_PRICES);
var unitPrice = roundToTens(cost.costTotal * 2);
var total = roundToTens(unitPrice * (input.quantity || 1));

// Глобальный минимум (опционально):
if (total > 0 && total < 1200) total = 1200;

// meshMinimum 1400–3000 для Рамочных — РЕКОМЕНДУЕТСЯ УБРАТЬ
// (они рассчитаны под старую розничную формулу)

return { total: total, install: 800, cost: cost };
```

---

## 8. Что менять в коде

### Файл: `D:\СуперМоскитка_28_06\js\home-calculator.js`

1. Добавить `COST_PRICES` рядом с `PRICES` (~строка 35).
2. Добавить `calcClassicCost(input, costPrices)` → `{ costMaterials, costAssembly, costPainting, costTotal }`.
3. В `calcClassic` для типов `"Рамочные"` и `"КРЫЛО"`:
   - вызвать `calcClassicCost`;
   - `total = roundToTens(costTotal * 2 * quantity)`;
   - **не** использовать `company_profit_multiplier` и розничный `PRICES` для materials.
4. Ветки `"Дверные"`, `"Внутривставные"`, `calcPlisseNet`, `calcBlinds`, `calcRoll` — **без изменений**.
5. Опционально: `data-cost-total` в DOM для отладки; **не показывать клиенту** на публичном сайте.

### Чеклист агента

- [ ] Добавить `COST_PRICES`
- [ ] Реализовать `calcClassicCost()`
- [ ] Переключить Рамочные/КРЫЛО на `costTotal × 2`
- [ ] Убрать `meshMinimum` для Рамочных (или согласовать с владельцем)
- [ ] Прогнать тест-кейсы ниже
- [ ] Залить только `js/home-calculator.js` на хостинг
- [ ] (Опционально) выровнять `Calc_to_web/src/cost-calculation.ts`

---

## 9. Сравнение старой и новой модели

| | Старая (сайт) | Новая (×2 от себестоимости) |
|---|---|---|
| Материалы | Розница `PRICES` (60 ₽/м) | Закупка `COST_PRICES` (55 ₽/м) |
| Сборка | 250 внутри `(mat+250)×2` | 250 в cost, потом ×2 |
| RAL | После ×2 | В cost, потом ×2 |
| Маржа | ~×2 на розничных материалах | Ровно ×2 на полной себестоимости |
| Минимумы FRAME | 1400–3000 | Рекомендуется убрать |

**Ожидание:** белые стандартные рамки станут **дешевле** текущих цен на сайте. Перед выкладкой — сравнить 5–10 реальных размеров со старым калькулятором.

---

## 10. Тест-кейсы

| # | Тип | Размер | Цвет | Полотно | Крепление | Проверка |
|---|---|---|---|---|---|---|
| 1 | Рамочные | 600×1200 | white | standard | z_metal | новая цена < старая |
| 2 | Рамочные | 730×1980 | ral | standard | plunger | RAL в cost, штифты 4×95 |
| 3 | Рамочные | 1200×1400 | gray | anticat | z_metal | импост (h>1 м) |
| 4 | Крыло | 686×1926 | ral | standard | plunger | cost ≈ 2698 → price ≈ 5400 |
| 5 | Крыло | 900×900 | white | standard | z_metal | без импоста |

### Эталон: Крыло 686×1926 RAL, штифты, стандартное полотно

Ручной расчёт по закупке (июнь 2026):

| Статья | ₽ |
|---|---:|
| Профиль крыло | ~488 |
| Уголки ×4 | 20 |
| Полотно | ~104 |
| Шнур | 31 |
| Штифты ×4 | 380 |
| Импост + крепёж | 91 |
| Ручка металл | 14 |
| **Материалы** | **~1128** |
| Сборка мастером | 250 |
| Покраска RAL (6 м) | 1320 |
| **Себестоимость** | **~2698** |
| **Цена ×2** | **~5400** |

---

## 11. Деплой на reg.ru (plisse-spb.ru)

1. Править локально в `D:\СуперМоскитка_28_06`.
2. Тест: открыть `kalkulyator.html` в браузере.
3. На хостинг залить **только** `js/home-calculator.js` (и HTML, если менялся UI).
4. Не трогать `/calc/` (React-замерщик).
5. После заливки — smoke-тест с менеджером на 3–5 размеров.
6. При изменении закупки — обновлять `COST_PRICES` в одном месте (желательно скрипт экспорта из Calc_to_web).

---

## 12. Ограничения и риски

- **Профиль 32 мм** — нет закупочной цены; расчёт 32 мм неточен до уточнения.
- **Уголки Крыло при RAL** — в calc_v2 закупка пластиковых; если в цеху алюминий — формула даст занижение.
- **CRM Calc_to_web** — упрощённая себестоимость; после правки сайта возможно расхождение с CRM.
- **Не показывать costTotal клиенту** — раскрывает маржу 50%.
- **Плиссе/двери** на сайте остаются на старой формуле — не смешивать с новой логикой в одном экране без пояснения.

---

## 13. Справочные файлы

| Файл | Назначение |
|---|---|
| `D:\СуперМоскитка_28_06\js\home-calculator.js` | **Править здесь** |
| `D:\Calc_to_web\src\raw-prices.ts` | Закупочный прайс |
| `D:\Calc_to_web\src\cost-calculation.ts` | Упрощённый cost в CRM |
| `D:\calc_v2\logic\calculations.ts` | ClassicEngine (эталон геометрии) |
| `D:\calc_v2\docs\DESKTOP_CALCULATOR_PRICING_SCHEMA.md` | Полное описание всех движков |
| `D:\calc_v2\docs\prices-export\prices-full.json` | Розничный прайс (старая модель) |

---

*Документ подготовлен для передачи агенту Cursor / разработчику. Реализация — правки в `home-calculator.js`, без изменений в `calc_v2`.*
