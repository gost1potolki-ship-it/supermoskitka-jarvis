# Аудит приложения «Калькулятор Замерщика»

**Дата:** 2026-06-18  
**Цель:** понять устройство приложения и безопасный путь добавления регистрации/входа замерщиков.

---

## 1. Краткое описание

**«Калькулятор Замерщика»** (`supermoskitka-app`) — мобильное веб-приложение (PWA + Capacitor Android) для замерщиков компании «Супермоскитка». Мастер на объекте:

- видит **заявки на замер** из CRM (через Firestore);
- считает стоимость изделий (москитные сетки, шторы плиссе, услуги);
- оформляет заказ в **корзине** (клиент, доставка, монтаж, скидка, оплата);
- сохраняет замер в облачный **архив** (`measurements`);
- отправляет заказ **в производство** через Google Apps Script → Google Sheets;
- работает **офлайн** за счёт `localStorage`, Firestore persistence и локальной outbox-очереди.

Сейчас приложение **не различает замерщиков**: нет входа, нет ролей, все видят все данные. Единственная «защита» — UI-пароль для экрана редактирования прайса.

---

## 2. Технологический стек

| Слой | Технологии |
|------|------------|
| Frontend | React 19, TypeScript 5, Vite 5, Tailwind CSS 3, PostCSS, `lucide-react`, `qrcode.react`, `@fontsource/inter` |
| Mobile | Capacitor 6, Android-проект в `android/` |
| Backend / DB | Firebase Web SDK 10, **Firestore** (modular SDK), offline persistence |
| Serverless | Firebase Cloud Functions (Node 18), `nodemailer` |
| CRM | Google Apps Script + Google Sheets (`scripts/google-apps-script/firebase-crm.js`) |
| Интеграции | Yandex STT (голосовой комментарий), Tochka API (QR СБП), VK API, Gmail (callable functions) |
| Dev proxy | Vite: `/api/yandex-stt`, `/api/yandex-gpt`, `/api/tochka` |

**Точка входа:** `index.html` → `index.tsx` → `App.tsx`.

**Роутинг:** React Router **не используется** — состояние `currentScreen` в `App.tsx`.

---

## 3. Структура проекта

| Папка / файл | Назначение |
|--------------|------------|
| `App.tsx` | Главный компонент: навигация, state заказа/архива, Firestore sync, outbox, admin modal |
| `index.tsx`, `index.html`, `index.css` | Bootstrap React-приложения |
| `firebase.ts` | Инициализация Firebase App + Firestore + offline persistence |
| `firestore.rules` | Правила Firestore (сейчас полностью открыты) |
| `firebase.json`, `.firebaserc` | Конфиг Firebase (Functions, rules) |
| `types.ts` | Типы изделий, заказа, архива, заявок; `DATABASE_MAPPING` |
| `constants.ts` | Прайс, коэффициенты, подписи UI (**источник истины для расчётов**) |
| `logic/calculations.ts` | Расчёт цены позиции (`calculatePrice`, движки по типам) |
| `logic/orderTotals.ts` | Итоги заказа, скидки, доставка, webhook totals |
| `screens/` | Экраны UI (см. раздел 4) |
| `components/` | Иконки карты/маршрута |
| `lib/` | phone, tochkaApi, formatOrderForManager, emailExport, vkManager, txtExport |
| `functions/src/index.ts` | Callable: email и VK отчёты |
| `scripts/google-apps-script/` | CRM ↔ Firestore sync, webhook приёма заказа |
| `android/` | Capacitor Android shell |
| `public/` | PWA manifest, favicon |
| `docs/`, `scripts/` | Экспорт прайсов, аналитика плиссе (не runtime) |
| `.tmp-analysis*` | Временные скомпилированные артефакты (не основной код) |

---

## 4. Навигация и экраны

**Состояния экрана** (`App.tsx`):

```
splash → menu → upcoming | archive | products → calc → cart
                admin (по паролю)
                inProgress (есть код, но не в меню)
```

| Экран | Файл | Маршрут / переход | Назначение |
|-------|------|-------------------|------------|
| Splash | `App.tsx` | Старт 3 сек → menu | Заставка |
| Меню | `MenuScreen.tsx` | `menu` | Заявки, архив, калькулятор, admin |
| Заявки на замер | `UpcomingScreen.tsx` | `upcoming` | Список из `upcoming_measurements` |
| Выбор изделия | `HomeScreen.tsx` | `products` | Каталог типов изделий |
| Расчёт | `CalcScreen.tsx` | `calc` | Параметры одной позиции |
| Корзина | `CartScreen.tsx` | `cart` | Оформление замера, сохранение |
| Архив | `ArchiveScreen.tsx` | `archive` | Сохранённые замеры, «отправить в работу» |
| Админка прайса | `AdminScreen.tsx` | `admin` | Редактирование `config/prices` |
| В работе | `InProgressScreen.tsx` | `inProgress` | Заглушка, **не подключена к меню** |
| Монтажник | `InstallationScreen.tsx` | — | **Не импортирован в App.tsx** |

**Навигация:** условный рендер по `currentScreen`, header с «Назад / Домой / Корзина».

**localStorage-ключи:**

| Ключ | Назначение |
|------|------------|
| `measurer_current_order` | Черновик заказа |
| `measurer_pending_archive_orders` | Outbox синхронизации архива |
| `measurer_prices` | Кэш прайса |
| `measurer_comp_v5` | Локально «выполненные» заявки |
| `measurer_upcoming_ids` | Кэш id/адресов заявок |
| `measurer_master_name` | Имя мастера (только localStorage, **не в Firestore/CRM**) |
| `measurer_current_order_editing_archive_*` | Контекст редактирования архива |

---

## 5. Авторизация

### Что есть сейчас

| Аспект | Статус |
|--------|--------|
| Регистрация замерщика | **Нет** |
| Вход замерщика | **Нет** |
| Firebase Authentication | **Не подключён** (`firebase.ts` — только Firestore) |
| Роли (`measurer`, `admin`, …) | **Нет** |
| Защита маршрутов | **Нет** (все экраны доступны сразу после splash) |
| Текущий «пользователь» | Анонимный клиент Firestore; имя мастера — `localStorage` |
| Админка прайса | UI-modal с паролем в `App.tsx` (`handleAdminLogin`, пароль захардкожен в клиенте) |
| Cloud Functions auth | `context.auth` **не проверяется** |
| Firestore rules | `allow read, write: if true` — **полный открытый доступ** |

### Файлы, связанные с «авторизацией»

- `App.tsx` — modal пароля админки
- `screens/AdminScreen.tsx` — `measurer_master_name` в localStorage
- `firestore.rules` — правила (открытые)
- `firebase.ts` — нет `getAuth()`

**Вывод:** для multi-user замерщиков текущая модель **непригодна** — нужны Firebase Auth + Firestore rules + фильтрация данных.

---

## 6. База данных и коллекции

**БД:** Firebase Firestore, проект `supermoskitka-587fb`.

| Коллекция / документ | Кто пишет | Кто читает | Назначение |
|---------------------|-----------|------------|------------|
| `upcoming_measurements/{docId}` | Google Apps Script (`syncToFirestore`) | `UpcomingScreen`, `CartScreen` | Заявки на замер из листа «Замеры» |
| `measurements/{archiveId}` | `App.tsx` (outbox), `ArchiveScreen` (статус), GAS (`syncReadyOrders`) | `App.tsx`, `ArchiveScreen`, `InstallationScreen` | Архив замеров / заказы |
| `config/prices` | `AdminScreen` / `App.tsx` | `App.tsx` (onSnapshot) | Облачный прайс |
| `ready_orders/{orderId}` | Google Apps Script (`syncReadyOrders`) | `InstallationScreen` | Заказы готовые к монтажу |

### ID-схемы

| Сущность | ID |
|----------|-----|
| Заявка на замер | `m_` + первые 32 hex SHA256(`phone\|address`) — стабильный, из CRM |
| Архивный замер | `{timestamp}-{random}` — генерируется в `App.generateArchiveId()` |
| Заказ в CRM (webhook) | `orderID` = `archiveId` |
| Ready order | `orderId` из колонки W таблицы производства |

### Поля основных сущностей

**`upcoming_measurements`:** `name`, `phone`, `address`, `comment`, `payer_text`, `amount_rub`, `source_hash`, `source_key`, `updated_at` (+ опционально `lat`/`lon` через UI-адаптер). **Поля `assignedMeasurer` / `measurerId` — не найдены.**

**`measurements` (ArchivedOrder):** `archiveId`, `date`, `items[]`, `customer`, `deliveryType`, `deliveryKm`, `globalInstall`, `installOverride`, `orderDiscountPercent`, `includeMeasurementFee`, `paymentMethod`, `generalComment`, `workStatus`, `workStatusLabel`, `workStatusUpdatedAt`, `syncToken`. **Нет `measurerId`, `upcomingId`, фото.**

**`CartItem`:** размеры, тип изделия, цвет, полотно, параметры плиссе, `price`, `installPrice`, `comment` (на позицию).

### Функции чтения/записи

| Операция | Где |
|----------|-----|
| Чтение заявок | `UpcomingScreen.load()`, `CartScreen` (выбор адреса) |
| Чтение архива | `App.tsx` — `onSnapshot(collection('measurements'))` |
| Запись архива | `App.saveToArchive()` → outbox → `setDoc(measurements/{archiveId})` |
| Удаление | `App.deleteFromArchive()` → outbox delete → `deleteDoc` |
| Статус «в производстве» | `ArchiveScreen.handleSendToManager()` → webhook + `setDoc` |
| Прайс | `onSnapshot(config/prices)`, `AdminScreen` → `setDoc` |
| CRM → Firestore | `scripts/google-apps-script/firebase-crm.js` |
| Firestore → CRM | Webhook POST из `ArchiveScreen` → `doPost` / `handleIncomingOrderWebhook_` |

---

## 7. Основные бизнес-процессы

### Замер (end-to-end)

1. **Заявка:** CRM-лист «Замеры» → GAS `syncToFirestore()` → `upcoming_measurements`.
2. **Просмотр:** замерщик открывает «Замеры», звонит, строит маршрут, отмечает выполненной (только **localStorage**).
3. **Старт:** «Начать замер» → клиент подставляется в черновик → калькулятор.
4. **Расчёт:** `CalcScreen` → `calculatePrice()` → позиция в корзину.
5. **Оформление:** `CartScreen` — клиент, доставка, монтаж, скидка 0/5/10%, оплата cash/qr (+8%), комментарий (текст + **Yandex STT**).
6. **Сохранение:** «Сохранить замер» → `saveToArchive()`:
   - outbox в localStorage;
   - `setDoc(measurements/{archiveId})`;
   - при совпадении адреса — заявка помечается выполненной локально.
7. **Отправка в работу:** в архиве → «Отправить в работу» → подтверждение оплаты замера → POST webhook → строки в листы «Рамочные»/«Плиссе»/«Шторы» со статусом «В работе» → `workStatus: in_production` в Firestore.

### Статусы

| Статус | Значение | Кто выставляет |
|--------|----------|-----------------|
| `waiting` | В ожидании | По умолчанию при сохранении |
| `in_production` | В производстве | `ArchiveScreen` после webhook |
| `ready` | Готов к монтажу | GAS `syncReadyOrders` (из таблицы производства) |

### Фото / комментарии / размеры

| Данные | Есть? |
|--------|-------|
| Размеры позиций | Да — `width`, `height`, `quantity` в `CartItem` |
| Комментарий заказа | Да — `generalComment` |
| Комментарий позиции | Да — `CartItem.comment` |
| Голосовой комментарий | Да — Yandex STT в `CartScreen` |
| **Фото** | **Нет** — загрузки Storage, camera API не найдены |

### Действия пользователя

Просмотр заявок, маршрут/карта, расчёт, корзина, сохранение/редактирование/удаление архива, отправка в CRM, QR оплаты (статичный PNG + Tochka в `InstallationScreen`), admin-прайс.

---

## 8. Интеграция с CRM

### Архитектура

```
Google Sheets (CRM)
    ↕ Google Apps Script (firebase-crm.js)
Firestore (upcoming_measurements, measurements, ready_orders)
    ↕ React App (замерщик)
    → webhook POST → Google Sheets (заказ в работу)
```

### Что приложение **получает** из CRM

| Данные | Канал | Поля |
|--------|-------|------|
| Заявки на замер | Firestore `upcoming_measurements` | имя, телефон, адрес, комментарий, сумма, кто платит, время, координаты |
| Статус «готов» | GAS → `measurements.workStatus=ready` | через sync производственных листов |
| Прайс | Firestore `config/prices` | редактируется в admin UI, не из CRM |

### Что приложение **отправляет** в CRM

| Данные | Канал | Payload |
|--------|-------|---------|
| Заказ в работу | POST webhook (`ArchiveScreen`) | `orderID`, `customer`, `items[]`, `deliveryCost`, `totalInstallCost`, `total`, `grandTotal`, `measurementFee`, `measurementPaidCash`, `paymentMethod`, `generalComment` |

Webhook URL **зашит в клиенте** (`ArchiveScreen.tsx`), режим `no-cors` — клиент **не видит ответ** сервера.

### Единые ID

- Заявка (`upcoming`) и архив (`measurements`) **не связаны явным полем** — только неявно по совпадению `address` при сохранении.
- `archiveId` = `orderID` в CRM при отправке в работу.
- `ready_orders.orderId` может **не совпадать** с `archiveId` (известный race, см. `MEASUREMENTS_STATUS_ANALYSIS_FOR_CHATGPT.md`).

### Не используется в активных экранах

- `lib/emailExport.ts`, `lib/vkManager.ts`, `lib/formatOrderForManager.ts` — задел, экранами не импортируются.

---

## 9. Что нужно добавить для замерщиков

Минимальный **безопасный** план (без полного рефакторинга):

### Этап 1 — Auth foundation

1. **`firebase.ts`:** добавить `getAuth()`, при необходимости persistence.
2. **Новые файлы:** `screens/LoginScreen.tsx`, `screens/RegisterScreen.tsx` (или один экран), `lib/auth.ts` / `hooks/useAuth.ts`.
3. **`App.tsx`:** gate — если нет `auth.currentUser`, показывать login; после входа — menu.
4. **Firestore коллекция `users/{uid}`:**
   ```ts
   { uid, role: 'measurer' | 'admin', displayName, phone, active: true, createdAt }
   ```
5. **Firebase Auth:** email+password или phone OTP (уточнить у владельца).

### Этап 2 — Firestore rules (критично, до prod)

```javascript
// Концепция (не код для деплоя сейчас):
// - measurer читает upcoming_measurements где assignedMeasurerId == uid
// - measurer читает/пишет measurements где measurerId == uid
// - admin — полный доступ + config/prices
// - ready_orders — только admin/installer role
```

### Этап 3 — Привязка замерщика к заявкам

1. **CRM:** колонка «Замерщик» в листе «Замеры» → GAS `buildMeasurementWrite_` добавляет `assignedMeasurerId` или `assignedMeasurerPhone`.
2. **`types.ts`:** поля `assignedMeasurerId?`, `assignedMeasurerName?` в `UpcomingMeasurement`.
3. **`UpcomingScreen`:** query с `where('assignedMeasurerId', '==', uid)` (нужен composite index).
4. **Fallback:** если назначения нет — показывать только admin или пул «без назначения» (бизнес-решение).

### Этап 4 — Профиль и архив

1. **`users/{uid}`** или `measurers/{uid}` — профиль (имя, телефон, активен/заблокирован).
2. **`saveToArchive()`:** записывать `measurerId: auth.uid`, `measurerName`.
3. **`App.tsx` onSnapshot:** фильтр `where('measurerId', '==', uid)` **или** фильтр на клиенте (временно, но **небезопасно без rules**).
4. Заменить `measurer_master_name` localStorage на профиль из Firestore.

### Этап 5 — Отправка результатов в CRM

1. Webhook payload: добавить `measurerId`, `measurerName`.
2. **Перенести webhook на Cloud Function** с проверкой Auth + role — URL и секрет не в клиенте.
3. GAS `handleIncomingOrderWebhook_` — записывать замерщика в строку заказа.

### Этап 6 — Admin

- Роль `admin` через custom claims или поле `users.role`.
- Admin UI-пароль заменить на auth role (не смешивать с measurer login).

**Минимум для MVP:** этапы 1 + 2 + 3 + 4 (auth, rules, назначение, фильтр архива).

---

## 10. Риски и слабые места

| Риск | Где | Последствие |
|------|-----|-------------|
| **Открытые Firestore rules** | `firestore.rules` | Любой с API key видит/меняет все замеры, прайс, заявки |
| **Нет Firebase Auth** | `firebase.ts` | Невозможна изоляция по замерщику |
| **Пароль админки в клиенте** | `App.tsx` | Любой может открыть DevTools и прочитать пароль |
| **Webhook в клиенте + no-cors** | `ArchiveScreen.tsx` | URL публичен; нет проверки auth; ложный success |
| **Весь архив всем замерщикам** | `App.tsx onSnapshot` без filter | Утечка данных клиентов между мастерами |
| **Расчёты только на frontend** | `logic/calculations.ts` | Подмена цен теоретически возможна (для внутренних замерщиков допустимо) |
| **Race status outbox vs webhook** | `App.tsx` + `ArchiveScreen` | Статус «В ожидании» после «В производстве» (см. `MEASUREMENTS_STATUS_ANALYSIS_FOR_CHATGPT.md`) |
| **archiveId ≠ ready orderId** | GAS sync | Статус `ready` может не попасть на нужный документ |
| **Заявка ↔ архив не связаны ID** | `saveToArchive` | Только match по address; дубли/ошибки |
| **completed заявки только localStorage** | `measurer_comp_v5` | На другом устройстве заявка снова «активна» |
| **Секреты в VITE_*** | `tochkaApi`, STT | Попадают в bundle APK |
| **Монолитный App.tsx** (~1070 строк) | state + sync + nav | Легко сломать outbox/archive при добавлении auth |
| **Изменение constants.ts** | правила проекта | Запрещено без явного указания — не трогать при auth |
| **InstallationScreen не в App** | отдельный контур | При добавлении auth его тоже нужно учесть |

### Где можно случайно сломать функционал

- `App.tsx` — outbox merge, `saveToArchive`, `onSnapshot` measurements.
- `logic/calculations.ts`, `constants.ts` — расчёты других изделий.
- `scripts/google-apps-script/firebase-crm.js` — CRM sync (production data).
- `ArchiveScreen.handleSendToManager` — CRM webhook.

### Где нет проверки ролей

- Везде: Firestore, Functions, все экраны, webhook.

---

## 11. Рекомендуемый порядок доработки

1. **Уточнить у владельца** auth-метод, модель назначения замерщиков, self-registration vs admin-only.
2. **Спроектировать Firestore schema** — `users`, поля `measurerId` / `assignedMeasurerId`.
3. **Включить Firebase Auth** + экраны login/register + auth gate в `App.tsx`.
4. **Написать и задеployить Firestore rules** (staging project сначала).
5. **CRM:** колонка замерщика + правка GAS `buildMeasurementWrite_`.
6. **Фильтрация** `UpcomingScreen` и `App.tsx` archive query по uid.
7. **`saveToArchive` + webhook** — добавить `measurerId`, перенести webhook в Cloud Function.
8. **Заменить admin password** на role-based admin.
9. **Composite indexes** в Firestore Console.
10. **Тест:** два аккаунта — каждый видит только свои заявки/архив.
11. (Опционально) фото через Firebase Storage, связь `upcomingId` ↔ `archiveId`.

---

## Файлы на следующем этапе

### Нужно будет менять

| Файл | Зачем |
|------|-------|
| `firebase.ts` | Auth init |
| `firestore.rules` | Изоляция данных |
| `App.tsx` | Auth gate, фильтр архива, `measurerId` при save |
| `types.ts` | `measurerId`, `assignedMeasurerId`, UserProfile |
| `screens/UpcomingScreen.tsx` | Query по назначенному замерщику |
| `screens/ArchiveScreen.tsx` | Webhook → Cloud Function; measurer в payload |
| `screens/AdminScreen.tsx` | Admin role вместо localStorage name |
| `screens/MenuScreen.tsx` | Login/logout, профиль |
| **Новые:** `LoginScreen.tsx`, `lib/auth.ts` | Регистрация/вход |
| `functions/src/index.ts` | Authenticated webhook proxy |
| `scripts/google-apps-script/firebase-crm.js` | Поле замерщика в sync + webhook |
| `firebase.json` | При необходимости Storage rules |

### Трогать нельзя без крайней необходимости

| Файл | Почему |
|------|--------|
| `constants.ts` (структура PRICES) | Правило проекта: база материалов недотrogа |
| `logic/calculations.ts` | Изоляция изделий; auth не требует изменений формул |
| `screens/CalcScreen.tsx` | Матрица полей изделий — риск сломать расчёты |
| `capacitor.config.ts`, `android/*` | Не связано с auth на первом этапе |

### Вопросы владельцу проекта перед правками

1. **Регистрация:** самостоятельная или только admin создаёт аккаунты?
2. **Auth-метод:** телефон (SMS OTP), email+пароль, или корпоративный Google?
3. **Назначение замерщика:** кто назначает в CRM — менеджер в Google Sheets? Есть ли уже колонка?
4. **Видимость данных:** замерщик видит **только свои** заявки или также «общий пул» без назначения?
5. **Архив:** общий для всех (как сейчас) или строго per-measurer?
6. **Admin:** тот же login с role `admin` или отдельный доступ к прайсу?
7. **Отправка в CRM:** webhook остаётся через GAS или переносим на Cloud Function?
8. **Фото замера:** нужны ли на первом этапе?
9. **Staging Firebase:** есть ли отдельный проект для теста rules до prod?
10. **InstallationScreen / монтажники:** нужна ли отдельная роль `installer` в том же приложении?

---

## Неясности в коде

- Точная схема колонок производственных листов (частично в GAS, но не полная документация в репо).
- Есть ли в CRM уже поле «замерщик» — в текущем `buildMeasurementWrite_` его **нет**.
- Кто и как должен модерировать новых замерщиков — бизнес-процесс не описан.
- `InProgressScreen` и `InstallationScreen` — будущие роли или legacy; в prod-навигации замерщика не участвуют.

---

## Связанные документы

- `PROJECT_OVERVIEW_FOR_CHATGPT.md` — общий обзор проекта
- `MEASUREMENTS_STATUS_ANALYSIS_FOR_CHATGPT.md` — анализ race condition статусов архива
- `scripts/google-apps-script/firebase-crm.js` — CRM sync и webhook
