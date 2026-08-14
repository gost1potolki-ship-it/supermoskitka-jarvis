# Аудит проекта Calc_to_web → CRM

**Дата:** 17 июня 2026  
**Статус:** только анализ, код не менялся

## Краткий вывод

Это **не React/Next**, а **Vite + TypeScript + vanilla DOM**. Приложение уже частично CRM: дашборд, замеры, заказы, калькулятор. Данные — **Firebase Firestore** + **localStorage** (черновики и offline-outbox). Отдельного backend-сервера нет.

---

## 1. Стек

| Компонент | Технология |
|-----------|------------|
| Сборка | **Vite 5** (`vite`, `tsc && vite build`) |
| Язык | **TypeScript** (strict) |
| UI | **Vanilla TS** — `document.createElement`, без React/Vue/Angular |
| Стили | `src/styles.css` |
| Общая логика расчёта | Соседний проект **`calc_v2`** через alias `@calc` |
| Облако | **Firebase 12** (Firestore client SDK) |
| Интеграция | **Google Apps Script webhook** → Google Sheets |
| Шрифты | Google Fonts (Inter) |

**React, Next.js, Vue — не используются.**

Конфигурация alias: `vite.config.ts` → `@calc` → `../calc_v2`

---

## 2. Backend

**Собственного backend (Node/Express, Python и т.д.) нет.**

Архитектура — **BaaS + внешние сервисы**:

- **Firestore** — чтение/запись из браузера (`src/firebase.ts`, `src/orders-store.ts`, `src/lib/archive-outbox.ts`)
- **Google Apps Script** — отправка заказа «в работу» (`src/lib/sheet-webhook.ts`)
- **localStorage** — черновики, auth, outbox

Авторизация — **локальная** (логин/пароль в `src/auth.ts`), не Firebase Auth.

---

## 3. База данных

**Да, но только облачная BaaS:**

| Хранилище | Назначение |
|-----------|------------|
| **Firestore** `measurements` | Сохранённые заказы (архив) |
| **Firestore** `upcoming_measurements` | Заявки на замер |
| **IndexedDB** (через Firestore persistence) | Offline-кэш Firestore |
| **localStorage** | Черновик корзины, outbox синхронизации, сессия, тема |

PostgreSQL/MySQL/SQLite на сервере — **нет**.

---

## 4. Где хранятся заказы

Многоуровневая схема:

```
┌─────────────────────────────────────────────────────────┐
│  Черновик (текущая корзина)                             │
│  localStorage: calc_pc_draft_v2                         │
│  → cart, customer, delivery, скидки, комментарий        │
└─────────────────────────────────────────────────────────┘
                          │ saveOrder()
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Outbox (ожидают синхронизации)                         │
│  localStorage: calc_pc_pending_archive_orders           │
└─────────────────────────────────────────────────────────┘
                          │ syncOutbox()
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Firestore: collection "measurements"                   │
│  doc id = archiveId                                     │
└─────────────────────────────────────────────────────────┘
                          │ sendOrderToProduction()
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Google Sheets (через Apps Script webhook)              │
└─────────────────────────────────────────────────────────┘
```

Ключевые файлы:

- Черновик: `src/main.ts` → `STORAGE_KEY = 'calc_pc_draft_v2'`
- Сохранение: `src/lib/archive-outbox.ts` → `saveToArchive()`, `syncOutbox()`
- Подписка: `src/orders-store.ts` → `onSnapshot(collection(db, 'measurements'))`

---

## 5. Логика калькулятора

### Ядро (общее с calc_v2, не трогать без необходимости)

| Модуль | Функция | Назначение |
|--------|---------|------------|
| `calc_v2/logic/calculations.ts` | `calculatePrice` | Розничная цена позиции |
| `calc_v2/logic/orderTotals.ts` | `calculateOrderTotals` | Итог заказа (монтаж, доставка, скидка, QR) |
| `calc_v2/docs/prices-export/prices-full.json` | — | Прайс |
| `calc_v2/docs/prices-export/product-fields-matrix.json` | — | Какие поля у типа изделия |

### Веб-слой (Calc_to_web)

| Файл | Роль |
|------|------|
| `src/cost-calculation.ts` | `calculateWithCost`, `calculateOrderCostMetrics` — розница + себестоимость |
| `src/retail-markup.ts` | Наценка 0–50% на москитные сетки |
| `src/raw-prices.ts` | Себестоимость материалов/монтажа |
| `src/field-config.ts` | Видимость полей по matrix |
| `calc-spec.json` | Опции select-ов |
| `src/main.ts` → `calcFromForm()` | Связка формы → расчёт |

**Не используется:** `calculator-web-engine.ts` в корне — legacy, в импортах не фигурирует.

---

## 6. Корзина

| Аспект | Где |
|--------|-----|
| State | `AppState.cart: WebCartItem[]` в `src/main.ts` |
| Добавление | `renderCalcForm()` → кнопка «В корзину» |
| UI | `renderCart()`, `renderCartWorkspace()`, `renderCartItemsCard()`, `renderOrderSidebar()` — всё в `main.ts` |
| Персистентность | `persistState()` → localStorage |
| Итоги | `calculateOrderTotals(buildOrder(), PRICES)` |

`main.ts` — **~1450 строк**, монолит: роутинг, калькулятор, корзина, CRM-заголовок.

---

## 7. Сохранение заказа

Цепочка:

1. **`saveOrder()`** (`main.ts`) — валидация, `buildOrder()`, очистка state
2. **`saveToArchive()`** (`archive-outbox.ts`) — формирует `ArchivedOrder`, кладёт в outbox
3. **`syncOutbox()`** — `setDoc(doc(db, 'measurements', archiveId), orderPayload, { merge: true })`
4. **`sendOrderFromCart()`** — сохранение + `handleSendOrderToWork()` → Google Sheets

Редактирование: `startArchiveEdit()` загружает заказ из архива обратно в корзину.

---

## 8. Сущности

| Сущность | Статус | Где определена |
|----------|--------|----------------|
| **Client** | ❌ Нет отдельной сущности | Вместо неё `CustomerInfo` внутри заказа |
| **Order** | ✅ Есть | `OrderState` (черновик), `ArchivedOrder` (сохранённый) |
| **CartItem** | ✅ Есть | `calc_v2/types.ts`; веб-расширение `WebCartItem` |
| **CalculationResult** | ✅ Есть | `src/cost-calculation.ts` (total, install + cost/profit) |

Дополнительно:

- `ArchiveOrderView` — view-модель для списка заказов (`src/lib/archive.ts`)
- `UpcomingMeasurement` — замеры (`calc_v2/types.ts`)
- `PendingArchiveOutboxEntry` — очередь синхронизации

**Client как отдельная таблица/модель — пока отсутствует.** В меню пункт «Клиенты» disabled (`menu.ts`).

---

## 9. UI-файлы

| Экран | Файл | Функции |
|-------|------|---------|
| **Главная / дашборд CRM** | `src/screens/menu.ts` | `renderMenuScreen()` — sidebar, карточки, уведомления (заглушки) |
| **Карточка заказа** | `src/screens/orders.ts` | `renderOrderCard()` — список архивных заказов |
| **Корзина** | `src/main.ts` | `renderCart()`, `renderCartItem()`, `renderOrderSidebar()` |
| **Калькулятор (выбор изделия)** | `src/main.ts` | `renderProducts()` |
| **Форма расчёта** | `src/main.ts` | `renderCalcForm()` |
| **Замеры** | `src/screens/measurements.ts` | Список из Firestore |
| **Логин** | `src/screens/login.ts` | |
| **DOM-хелперы** | `src/dom.ts` | `el()`, `btn()`, `segmentToggle()` |
| **Стили** | `src/styles.css` | |
| **Точка входа** | `index.html` → `src/main.ts` | |

Роутинг — `state.screen`: `'menu' | 'measurements' | 'orders' | 'products' | 'calc' | 'cart'`.

---

## 10. Что нельзя ломать при миграции в CRM

### Критичные зоны (не трогать без тестов)

1. **`calc_v2`** — единый источник ценообразования; alias `@calc` в Vite/tsconfig
2. **Контракт `CartItem` / `OrderState` / `ArchivedOrder`** — Firestore и Google Sheets завязаны на эту структуру
3. **`saveToArchive` + outbox** — offline-first; при рефакторинге сохранить merge-логику и guard по `workStatus`
4. **`calculateWithCost` + `calculateOrderTotals`** — итоги в корзине и карточках заказов
5. **`product-fields-matrix.json` + `calc-spec.json`** — динамические поля формы
6. **`enrichCartItemCosts` / `refreshCartItemPricing`** — пересчёт при изменении qty и наценки

### Безопасно выносить / расширять

- UI из `main.ts` в отдельные модули (`screens/cart.ts`, `screens/calc.ts`)
- Новые CRM-разделы (клиенты, дашборд) — поверх существующих stores
- `CustomerInfo` → полноценный `Client` — **с миграцией данных** и обратной совместимостью в `normalizeArchiveOrder`

### Технический долг (учесть в плане)

- `main.ts` — монолит ~1450 строк
- README устарел («Firebase не используется» — неактуально)
- Auth — hardcoded credentials в `auth.ts`
- Firebase config в клиенте (норма для SPA, но нужны Firestore rules)
- Уведомления на дашборде — статические заглушки

---

## План миграции в CRM

### Фаза 0 — Подготовка (без изменения поведения)

1. **Зафиксировать контракты** — snapshot тестов на `calculatePrice`, `calculateOrderTotals`, `saveToArchive`
2. **Разрезать `main.ts`** на модули без смены API:
   - `screens/calc-form.ts`
   - `screens/cart.ts`
   - `screens/products.ts`
   - `state/app-state.ts` (load/persist)
3. **Обновить README** под реальную архитектуру

### Фаза 1 — Data layer (CRM-фундамент)

1. **Ввести сущность `Client`**:
   - `id`, `name`, `phone`, `addresses[]`, `createdAt`, `notes`
   - Firestore collection `clients`
   - Пока `Order.customer` дублирует данные (denormalization) для совместимости
2. **Связать заказ с клиентом**: `clientId?: string` в `ArchivedOrder`
3. **Репозитории** поверх Firestore:
   - `clients-store.ts`
   - расширить `orders-store.ts`
4. **Поиск** на дашборде — по клиентам/заказам из Firestore

### Фаза 2 — CRM UI

1. **Раздел «Клиенты»** — список, карточка, история заказов
2. **Создание заказа из клиента** — автозаполнение `CustomerInfo`
3. **Дашборд** — реальные метрики (замеры, заказы по статусам) вместо заглушек
4. **Связь «Замер → Заказ»** — из `UpcomingMeasurement` в корзину

### Фаза 3 — Auth и безопасность

1. **Firebase Auth** вместо localStorage-login
2. **Firestore Security Rules** — роли (менеджер/админ)
3. Вынести webhook URL и секреты из клиента (Cloud Function / Apps Script с токеном)

### Фаза 4 — Опционально: архитектура

| Вариант | Плюсы | Минусы |
|---------|-------|--------|
| **Остаться на Vite + TS** | Минимальный риск для калькулятора | Сложнее масштабировать UI |
| **React + Vite** | Компоненты, экосистема CRM | Большой рефакторинг |
| **Backend API** | Единая бизнес-логика, интеграции | Новая инфраструктура |

**Рекомендация:** сначала **Vite + модули + Firestore**, калькулятор оставить изолированным пакетом `@calc`. React — только если команда готова к полному переписыванию UI.

### Фаза 5 — Миграция данных

1. Скрипт: из `measurements` извлечь уникальных клиентов по phone → `clients`
2. Проставить `clientId` в существующие заказы
3. Сохранить `customer` в документе для rollback

---

## Диаграмма текущей архитектуры

```
UI (Vanilla TS)
├── menu.ts — Dashboard
├── orders.ts — Карточки заказов
├── main.ts — Calc + Cart
└── measurements.ts

Локальное состояние
├── localStorage (draft + outbox + auth)
└── AppState.cart

calc_v2 (@calc)
├── calculatePrice
├── calculateOrderTotals
└── prices-full.json

Облако
├── Firestore (measurements, upcoming_measurements)
└── Google Apps Script → Sheets
```
