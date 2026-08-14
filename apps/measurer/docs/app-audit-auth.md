# Аудит авторизации и регистрации замерщиков

**Дата:** 2026-06-18  
**Контекст:** дополнение к `docs/app-audit.md` и `docs/AUDIT_APK_PREBUILD.md` (тот аудит — Capacitor, память, API; этот — только auth, пользователи, роли, регистрация замерщиков).

---

## 1. Текущее состояние авторизации

| Вопрос | Ответ |
|--------|-------|
| Firebase Auth | **Не используется.** В `firebase.ts` только `initializeApp` + `getFirestore` + persistence. `getAuth()`, `signIn`, `onAuthStateChanged` — **отсутствуют**. |
| Экран входа/регистрации | **Нет.** Единственный «вход» — modal с паролем для **админки прайса** в `App.tsx`. |
| Где хранится пользователь | **Нигде.** Приложение работает анонимно. Имя мастера — `localStorage` ключ `measurer_master_name` (только в `AdminScreen`, не связано с auth). |
| Logout | **Нет.** |
| Открытие без пользователя | Splash 3 сек → сразу `menu`. Все экраны доступны без проверки identity. |

### Единственная «авторизация» — пароль админки

В `App.tsx` функция `handleAdminLogin` сравнивает введённый пароль со строкой, захардкоженной в клиенте. Это **UI-заглушка**, не backend-auth:

- пароль в исходниках клиента;
- нет сессии, токена, expiry;
- после входа любой может снова открыть admin, зная пароль;
- `config/prices` в Firestore доступен **без** этого пароля (rules открыты).

### Cloud Functions

`functions/src/index.ts` — `sendOrderToManager`, `sendVkOrderReport`. **`context.auth` не проверяется** — любой клиент с Firebase SDK может вызвать callable.

### Firestore Rules

```text
match /{document=**} {
  allow read, write: if true;
}
```

Любой, у кого есть web config (он в `firebase.ts`), читает и пишет **все** коллекции.

---

## 2. Пользователи и роли

| Вопрос | Ответ |
|--------|-------|
| Коллекция `users` / `employees` / `measurers` | **Не найдена** в коде приложения и GAS sync |
| Поля `role`, `userRole`, `isAdmin`, `isMeasurer` | **Не найдены** в `types.ts`, screens, GAS |
| Проверка прав в коде | Только сравнение пароля в `App.tsx` для admin-экрана |
| Разделение admin / manager / measurer | **Нет.** Фактически один анонимный пользователь + опциональный «знающий пароль» |
| Риск видимости всех данных | **Критический.** `App.tsx` подписан на **весь** `measurements`; `UpcomingScreen` — на **весь** `upcoming_measurements` |

### Что есть вместо пользователей

| Механизм | Где | Назначение |
|----------|-----|------------|
| `measurer_master_name` | `AdminScreen` → localStorage | Отображаемое имя в админке, **не в Firestore/CRM** |
| `measurer_comp_v5` | `UpcomingScreen`, `App.saveToArchive` | Локально «выполненные» заявки (per-device) |
| `measurer_upcoming_ids` | `UpcomingScreen` | Кэш id+address заявок |

Ни один из них не идентифицирует замерщика в облаке.

---

## 3. Замеры и назначение замерщиков

### Предстоящие замеры (заявки)

| Аспект | Детали |
|--------|--------|
| Экран | `UpcomingScreen.tsx` |
| Коллекция | `upcoming_measurements` |
| Загрузка | `getDocsFromServer` + fallback `getDocsFromCache`, `orderBy('address')` |
| Источник данных | Google Sheets лист «Замеры» → GAS `syncToFirestore()` → Firestore |

**Поля в Firestore** (из `buildMeasurementWrite_` в GAS):

- `name`, `phone`, `address`, `comment`, `payer_text`, `amount_rub`
- `source_hash`, `source_key`, `updated_at`
- опционально `lat`/`lon` (читаются UI-адаптером, GAS пока не пишет)

**Тип в приложении** (`UpcomingMeasurement` в `types.ts`): `id`, `address`, `apartment`, `customerName`, `phone`, `comment`, `price`, `payerType`, `time`, `coordinates`.

**Поля назначения:** `measurerId`, `assignedTo`, `executorId`, `assignedMeasurerId` — **отсутствуют** в типах, GAS и UI.

**Doc ID заявки:** `m_` + SHA256(`phone|address`)[0:32] — стабильный, из CRM.

### Можно ли сейчас назначить замер замерщику?

**Нет.** CRM читает только 6 колонок листа «Замеры» (имя, телефон, адрес, комментарий, плательщик, сумма). Колонки «Замерщик» в sync нет.

### Архивные замеры (результат работы)

| Аспект | Детали |
|--------|--------|
| Сохранение | `App.saveToArchive()` → outbox → `measurements/{archiveId}` |
| Чтение | `App.tsx` — `onSnapshot(query(collection('measurements'), orderBy('archiveId', 'desc')))` — **без фильтра** |
| Doc ID | `{timestamp}-{random}` — генерируется клиентом |

**Поля `ArchivedOrder`:** заказ + `archiveId`, `date`, `workStatus`, `syncToken`. **`measurerId` / `upcomingId` — нет.**

### Связь заявка ↔ архив

- Явного поля **нет**.
- При сохранении нового замера — match по **совпадению address** с кэшем `measurer_upcoming_ids` → локально `measurer_comp_v5`.
- На другом устройстве или при другом address — связь теряется.

### Статусы

| Статус | Где выставляется |
|--------|------------------|
| `waiting` | По умолчанию при сохранении в архив |
| `in_production` | `ArchiveScreen.handleSendToManager` после webhook |
| `ready` | GAS `syncReadyOrders` из производственных листов |

«Выполнено» на экране заявок — только **localStorage** (`measurer_comp_v5`), не Firestore.

### Что сохраняется обратно после замера

1. **Firestore `measurements`** — полный заказ (позиции, клиент, доставка, скидка, оплата, комментарий).
2. **CRM webhook** (при «Отправить в работу») — `orderID`, `customer`, `items`, totals, `generalComment` — **без measurerId**.
3. **localStorage** — completed marker для заявки (только на устройстве).

---

## 4. Связь с CRM

### ID между системами

| Сущность | ID | Связь |
|----------|-----|-------|
| Заявка (upcoming) | `m_<hash(phone\|address)>` | Из CRM sync |
| Архив (measurements) | `archiveId` = timestamp-random | Генерирует приложение |
| Заказ в CRM (webhook) | `orderID` = `archiveId` | При отправке в работу |
| Ready order | `orderId` из кол. W таблицы | Может ≠ `archiveId` |

### Данные CRM → приложение

- Заявки: имя, телефон, адрес, комментарий, сумма, плательщик.
- Статус `ready` на архив — через sync производства (не через заявки).

### Данные приложение → CRM

Webhook POST из `ArchiveScreen.tsx` → GAS `doPost` → строки в листы «Рамочные»/«Плиссе»/«Шторы».

Payload **без** идентификатора замерщика.

### Можно ли безопасно добавить назначение из CRM?

**Да, архитектурно** — CRM уже master для `upcoming_measurements`. Нужно:

1. Колонка «Замерщик» в листе «Замеры» (телефон, email или uid).
2. GAS: читать колонку, писать `assignedMeasurerId` / `assignedMeasurerPhone` в Firestore.
3. Приложение: query `where('assignedMeasurerId', '==', auth.uid)` + **Firestore rules** с тем же условием.
4. Маппинг phone/email → Firebase Auth uid в коллекции `users` (или custom claims).

**Без rules** назначение из CRM бесполезно для безопасности — любой клиент всё равно прочитает все заявки.

### Изменения в CRM для «только мои задачи»

| Компонент | Изменение |
|-----------|-----------|
| Google Sheets «Замеры» | Колонка G (или др.): замерщик (phone/email/имя) |
| `readMeasurementsSheetWithStats_` | Читать новую колонку |
| `buildMeasurementWrite_` | Писать `assignedMeasurerId`, `assignedMeasurerPhone`, `assignedMeasurerName` |
| `DATABASE_MAPPING` в `types.ts` | Добавить ключ для UI-адаптера |
| `UpcomingScreen` | Firestore query с фильтром (после auth) |
| Firestore index | Composite: `assignedMeasurerId` + `address` |
| `users` collection | Связь phone/email ↔ auth.uid |

---

## 5. Минимальная безопасная схема регистрации замерщиков

### Рекомендуемый MVP (без over-engineering)

```text
Firebase Auth (email+password или phone OTP)
    ↓
users/{uid}: { role: 'measurer', displayName, phone, active: true }
    ↓
Firestore rules: measurer видит/пишет только свои данные
    ↓
upcoming_measurements.assignedMeasurerId == uid  (из CRM)
measurements.measurerId == uid                 (при saveToArchive)
    ↓
LoginScreen → auth gate в App.tsx → logout в MenuScreen
```

### По пунктам задачи

| Требование | Решение |
|------------|---------|
| Экран входа | Новый `LoginScreen.tsx` (+ опционально Register) |
| Регистрация | **Admin-only** (безопаснее): admin создаёт user в Firebase Console / Cloud Function; self-register — только после модерации |
| Профиль | `users/{uid}` в Firestore |
| Роль `measurer` | `users.role` или custom claim `role: measurer` |
| auth.uid ↔ документ | `users/{uid}` doc id = Firebase Auth uid |
| Фильтрация замеров | `where('assignedMeasurerId', '==', uid)` + rules |
| Запрет чужих данных | **Firestore rules** (обязательно, не только UI) |
| Logout | `signOut(auth)` + очистка локального state/outbox policy |

### Что НЕ делать на первом этапе

- Self-registration без модерации при открытых rules.
- Фильтрация только на frontend при `allow read: if true`.
- Сохранение admin-пароля параллельно с Firebase Auth.
- Webhook с секретом в клиенте без auth proxy.

---

## 6. Какие файлы менять

### Точно надо

| Файл | Зачем |
|------|-------|
| `firebase.ts` | `getAuth()`, export auth |
| `firestore.rules` | Rules по uid/role |
| `App.tsx` | Auth gate, logout, `measurerId` в save, фильтр archive snapshot |
| `types.ts` | `UserProfile`, `assignedMeasurerId`, `measurerId` |
| `screens/UpcomingScreen.tsx` | Query по assignedMeasurerId |
| `screens/MenuScreen.tsx` | Logout, имя пользователя |
| **Новые:** `screens/LoginScreen.tsx`, `lib/auth.ts` | Вход, хелперы auth |
| `scripts/google-apps-script/firebase-crm.js` | Колонка замерщика в sync |
| `functions/src/index.ts` | Auth check на callable; опционально webhook proxy |

### Возможно надо

| Файл | Зачем |
|------|-------|
| `screens/ArchiveScreen.tsx` | measurerId в webhook payload; webhook → Cloud Function |
| `screens/AdminScreen.tsx` | Admin по role, не по паролю |
| `screens/CartScreen.tsx` | Если выбор заявок — фильтр по measurer |
| `firebase.json` | Storage rules (если позже фото) |
| `capacitor.config.ts` / Android | Deep links для auth redirect (phone OTP) |

### Лучше не трогать (на первом этапе)

| Файл | Почему |
|------|--------|
| `constants.ts` | Правило проекта: не менять структуру PRICES |
| `logic/calculations.ts` | Auth не затрагивает расчёты |
| `screens/CalcScreen.tsx` | Матрица изделий — риск регрессий |
| `logic/orderTotals.ts` | Только если webhook payload расширяется |

---

## 7. Что нужно добавить в Firestore

### Новая коллекция `users/{uid}`

```typescript
{
  uid: string;           // = doc id = Firebase Auth uid
  role: 'measurer' | 'admin' | 'manager';
  displayName: string;
  phone?: string;        // для матчинга с CRM
  email?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
```

### Новые поля в существующих коллекциях

**`upcoming_measurements/{docId}`:**

```typescript
assignedMeasurerId?: string;    // Firebase uid
assignedMeasurerPhone?: string; // fallback из CRM
assignedMeasurerName?: string;
```

**`measurements/{archiveId}`:**

```typescript
measurerId: string;       // auth.uid автора
measurerName?: string;
upcomingId?: string;      // m_... — явная связь с заявкой
```

### Indexes (Firestore Console)

- `upcoming_measurements`: `assignedMeasurerId ASC, address ASC`
- `measurements`: `measurerId ASC, archiveId DESC`

### Rules (концепция)

```text
users/{uid}: read own; admin read all
upcoming_measurements: read if assignedMeasurerId == request.auth.uid || isAdmin()
measurements: read/write if measurerId == request.auth.uid || isAdmin()
config/prices: read all authenticated; write admin only
ready_orders: admin/installer only
```

---

## 8. Что нужно добавить в CRM

| Изменение | Где |
|-----------|-----|
| Колонка «Замерщик» в листе «Замеры» | Google Sheets |
| Чтение колонки в GAS | `readMeasurementsSheetWithStats_` (сейчас 6 колонок A–F) |
| Запись в Firestore | `buildMeasurementWrite_` |
| Маппинг замерщика → uid | Таблица соответствий или поле phone в `users` |
| Webhook payload | `measurerId`, `measurerName` в `handleIncomingOrderWebhook_` |
| (Опционально) запись замерщика в строку заказа | `buildSheetOrderRow_` |

---

## 9. Риски

### Где можно сломать существующую работу

| Зона | Риск |
|------|------|
| `App.tsx` outbox/sync | Закрытые rules без auth gate → приложение перестанет сохранять |
| `onSnapshot(measurements)` без миграции | Старые документы без `measurerId` — не видны замерщику |
| GAS sync | Неверная колонка → потеря/пустые assigned поля |
| Admin password removal | Кто-то потеряет доступ к прайсу без role admin |
| Race outbox vs webhook | Уже есть; auth не усугубляет, но save с measurerId добавляет merge-логику |

### Где риск открыть чужие данные

| Сейчас | После auth без rules |
|--------|---------------------|
| Все видят все `measurements` и `upcoming_measurements` | Frontend filter без rules = **та же дыра** |
| Webhook URL в клиенте | Любой может POST фейковый заказ |
| Callable functions без auth | Спам email/VK |
| Admin password в bundle | Любой редактирует `config/prices` |

### Где нужны Firestore Rules (не frontend)

- Чтение `upcoming_measurements` — **обязательно**
- Чтение/запись `measurements` — **обязательно**
- Запись `config/prices` — **обязательно**
- Callable + webhook — server-side auth

### Вопросы перед началом правок

1. Self-register или только admin создаёт аккаунты?
2. Auth: phone OTP, email+password, Google?
3. Как в CRM идентифицировать замерщика — телефон, email, имя?
4. Замерщик видит только назначенные или также «общий пул»?
5. Старый архив без `measurerId` — скрыть, показать всем admin, или мигрировать?
6. Admin-прайс: role `admin` или отдельный доступ?
7. Есть staging Firebase для теста rules?
8. Webhook переносим в Cloud Function?
9. Нужна роль `manager` (видит все замеры)?
10. `InstallationScreen` / монтажники — отдельная роль?

---

## 10. Рекомендуемый порядок внедрения маленькими шагами

1. **Согласовать** auth-метод и модель назначения с владельцем (вопросы выше).
2. **Staging:** включить Firebase Auth, создать 2 тестовых measurer + 1 admin.
3. **Schema:** коллекция `users`, поля `assignedMeasurerId` / `measurerId`.
4. **CRM:** колонка замерщика + правка GAS (dry run).
5. **Rules draft** на staging — проверить, что текущий flow не ломается.
6. **`LoginScreen` + auth gate** в `App.tsx`.
7. **`saveToArchive`** — писать `measurerId`, `upcomingId`.
8. **`UpcomingScreen`** — query + rules по `assignedMeasurerId`.
9. **Archive snapshot** — filter по `measurerId`; миграция/backfill старых записей.
10. **Admin:** role вместо пароля; rules на `config/prices`.
11. **Webhook** → Cloud Function с auth; measurerId в payload.
12. **Prod deploy** rules + GAS + app; тест двумя аккаунтами.
13. Logout, блокировка `active: false`.

---

## Краткий вывод

**Регистрацию замерщиков «прямо сейчас» в prod добавлять нельзя** — сначала нужен фундамент:

1. **Firestore rules** (сейчас `allow read, write: if true` — любая регистрация не даст изоляции).
2. **Коллекция `users` + Firebase Auth** — без этого нет uid для привязки.
3. **Поля назначения в CRM/GAS** — без `assignedMeasurerId` нельзя показать «только мои заявки».
4. **`measurerId` в `measurements`** — без этого архив останется общим.

**Можно начинать параллельно на staging:** Auth + `users` + rules + CRM-колонка — это 4 независимых подготовительных шага. UI (LoginScreen) — после rules, иначе приложение сломается для всех устройств сразу после deploy rules без auth gate.

**Итог:** сначала доработать **структуру пользователей, rules и поля замеров в CRM**, затем UI регистрации/входа. Порядок критичен: rules без login gate = поломка; login без rules = иллюзия безопасности.

---

## Связанные документы

- `docs/app-audit.md` — общий технический аудит приложения
- `docs/AUDIT_APK_PREBUILD.md` — аудит перед сборкой APK (Capacitor, память, API)
- `MEASUREMENTS_STATUS_ANALYSIS_FOR_CHATGPT.md` — race condition статусов архива
- `scripts/google-apps-script/firebase-crm.js` — CRM sync и webhook
