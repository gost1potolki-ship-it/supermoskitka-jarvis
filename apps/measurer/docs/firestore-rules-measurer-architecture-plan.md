# Firestore rules под архитектуру «CRM — центр, приложение — инструмент замерщика»

Анализ и план. Проект: `D:/calc_v2` (приложение замерщика).

## Архитектурное решение

- **CRM** — центральный пункт управления (менеджер, админ, полный архив).
- **Приложение** — рабочий инструмент замерщика, не админ-панель.
- В приложении замерщик видит только свои архивные заказы (`measurerId === uid`).
- Полный общий архив — в CRM, не в приложении.

## Текущее состояние приложения

- Архив запрашивается через `where('measurerId', '==', userProfile.uid)` + локальная сортировка по `archiveId`.
- В заказах есть: `measurerId`, `measurerName`, `upcomingId`.
- Ручные заказы без заявки тоже получают `measurerId`.
- Legacy-заказы без `measurerId` в приложении не показываются.

---

## 1. Collections, которые использует приложение

| Collection | Где используется | Операции в prod-потоке |
|------------|------------------|------------------------|
| **`users/{uid}`** | `lib/auth.ts` → `getUserProfile` | **read** (свой профиль) |
| **`measurements/{archiveId}`** | `App.tsx` (outbox sync, onSnapshot, refresh), `ArchiveScreen.tsx` (отправка в работу) | **read**, **create/update** (`setDoc` merge), **delete** |
| **`upcoming_measurements/{id}`** | `UpcomingScreen.tsx`, `CartScreen.tsx` (модалка адресов) | **read**, **update** (transaction / `updateDoc`) |
| **`config/prices`** | `App.tsx` (onSnapshot, seed), `AdminScreen` через `savePrices` | **read**, **write** (`setDoc`) |

**Явно в rules, но не в основном UI замерщика (`App.tsx`):**

| Collection | Статус |
|------------|--------|
| **`configs/{docId}`** | read-only в rules; в коде приложения не найдено |
| **`dealers/{docId}`** | read-only; не используется в `App.tsx` |
| **`ready_orders/{docId}`** | read-only; только в **не подключённом** `InstallationScreen.tsx` |

**Catch-all** `match /{document=**}`:

```javascript
match /{document=**} {
  allow read: if true;
  allow write: if false;
}
```

Любой документ, для которого нет более строгого deny, **читается анонимно**. Это критично для `users/{uid}`.

---

## 2. Реальные операции приложения

### Auth (`lib/auth.ts`)

- Firebase Auth: sign-in / sign-out
- **`getDoc(users/{uid})`** — read профиля после входа

### `App.tsx`

- **`onSnapshot` + `getDocsFromServer`**: `measurements` с `where('measurerId', '==', uid)`
- **`setDoc` merge**: `measurements/{archiveId}` — полный архивный заказ (outbox)
- **`getDoc`**: проверка серверной версии при sync outbox
- **`deleteDoc`**: удаление из архива
- **`runTransaction`**: `upcoming_measurements` — completed
- **`onSnapshot` + `setDoc`**: `config/prices`

### `UpcomingScreen.tsx`

- **`onSnapshot` / `getDocs`**: вся коллекция `upcoming_measurements`
- **`runTransaction`**: бронь, снятие брони, отмена
- **`updateDoc`**: `scheduledAt`, `measurerNote`, метаданные

### `ArchiveScreen.tsx`

- **`setDoc` merge**: только статус работы + payment-поля (`workStatus`, `measurementPaidCash`, …)

### `CartScreen.tsx`

- **`getDocs`**: read `upcoming_measurements` (выбор адреса)

---

## 3. Что слишком открыто сейчас

| Проблема | Severity |
|----------|----------|
| **`measurements`: `allow read/create/update/delete: if true`** | Критично — любой клиент читает/пишет/удаляет весь архив |
| **`upcoming_measurements`: `allow read: if true`** без auth | Высокий — заявки видны без входа |
| **`upcoming_measurements`: update без auth и без проверки владельца** | Критично — при знании id можно бронировать/отменять/завершать чужие заявки (поля ограничены `hasOnly`, но **не кто**) |
| **`config/prices`: `allow write: if docId == 'prices'`** без auth | Высокий — любой может перезаписать прайс |
| **Catch-all `read: if true`** | Критично — **`users/{uid}`** читается любым клиентом |
| **`measurements` rules не проверяют `measurerId`** | Расхождение с UI: приложение фильтрует, rules — нет |

UI-фильтр `where('measurerId', '==', uid)` **не заменяет** rules: прямой `getDoc` / другой SDK обходит приложение.

---

## 4. Как безопасно ограничить `measurements`

Базовые функции для rules:

```javascript
function isSignedIn() {
  return request.auth != null;
}
function isOwner() {
  return isSignedIn() && resource.data.measurerId == request.auth.uid;
}
function createsAsOwner() {
  return isSignedIn()
    && request.resource.data.measurerId == request.auth.uid;
}
```

### Read

```javascript
allow read: if isSignedIn() && resource.data.measurerId == request.auth.uid;
```

- Согласовано с query `where('measurerId', '==', uid)`.
- Legacy без `measurerId` — **никто из замерщиков** (ожидаемо; полный архив — в CRM).

### Create

```javascript
allow create: if createsAsOwner();
```

- Outbox делает `setDoc` с полным заказом и `measurerId: userProfile.uid`.

### Update

```javascript
allow update: if isOwner()
  && request.resource.data.measurerId == resource.data.measurerId;
```

Опционально: разрешить менять только subset полей при «Отправить в работу» vs полный merge из outbox — сложнее; на первом шаге достаточно ownership.

### Delete — рекомендация

```javascript
allow delete: if isOwner();
```

- Сейчас приложение удаляет через `deleteFromArchive` — только свои заказы в UI.
- Запрет delete безопаснее для CRM-архитекторики; если нужен «мягкий» сценарий — только владелец + позже CRM-admin через Admin SDK.

---

## 5. Как безопасно ограничить `upcoming_measurements`

Текущий `hasOnly([...])` — хорошая основа, но **нет auth и ownership**.

### Read

```javascript
allow read: if isSignedIn();
```

«Общие замеры» требуют видеть pool — все авторизованные замерщики (фильтр «свободные» — в UI). CRM позже может сузить через `assignedMeasurerId`.

### Update — логика по типам операций

| Операция | Условие в rules |
|----------|-----------------|
| **Бронь** | `isSignedIn()` + (нет брони / `available`) + `request.resource.data.reservedByMeasurerId == request.auth.uid` + `hasOnly` поля брони |
| **Снять бронь** | `resource.data.reservedByMeasurerId == request.auth.uid` + сброс полей брони |
| **Отмена** | владелец + `reserved` + поля cancel |
| **Completed** | владелец + `reserved` + поля completed |
| **scheduledAt / measurerNote** | владелец (`reservedByMeasurerId == uid`) + соответствующие поля |

Firestore rules не разбирают transaction так же удобно, как код — обычно один `allow update` с OR-условиями по `affectedKeys()` и состоянию `resource.data`.

**Create / delete** — оставить `false` (CRM/GAS создаёт заявки).

**Риск:** `releaseReservation` пишет `reservationStatus: null` — rules должны допускать null для разрешённых ключей (сейчас `hasOnly` это не запрещает).

---

## 6. Как ограничить `users/{uid}`

```javascript
match /users/{uid} {
  allow read: if isSignedIn() && request.auth.uid == uid;
  allow create, update, delete: if false;
}
```

**Обязательно убрать или сузить catch-all read**, иначе профили останутся публичными:

```javascript
match /{document=**} {
  allow read, write: if false; // default deny
}
```

Explicit rules для `configs`, `dealers`, `ready_orders` оставить точечно.

**Временно для auth:** read только своего `users/{uid}` — достаточно для `getUserProfile`. Создание пользователей — позже CRM + Admin SDK / Cloud Function.

Проверять `active == true` в rules опционально (сейчас — в `App.tsx`).

---

## 7. Как ограничить `config/prices`

**Сейчас:** read/write открыты (write без auth).

**Рекомендация для приложения замерщика:**

```javascript
match /config/{docId} {
  allow read: if isSignedIn();
  allow write: if false; // прайс — только CRM позже
}
```

**Конфликт:** `AdminScreen` + пароль `3673108` в `App.tsx` пишет прайс — после `write: if false` **сломается**. Это сознательный trade-off: прайс → CRM, приложение только read.

Seed `setDoc` при отсутствии документа (`App.tsx`) тоже перестанет работать — нужен одноразовый seed через Console/CRM.

---

## 8. Что можно сделать уже сейчас (низкий риск)

1. **`measurements`** — auth + `measurerId == uid` на read/create/update; delete только владельцу (или запрет).
2. **`users/{uid}`** — read own + **исправить catch-all**.
3. **`upcoming_measurements`** — `read: if isSignedIn()` (минимальный шаг).
4. **`config/prices`** — `read: if isSignedIn()` (write пока оставить, если AdminScreen ещё нужен).

Приложение уже:

- требует auth (`LoginScreen`);
- пишет `measurerId` при save;
- читает архив с `where('measurerId', '==', uid)`.

---

## 9. Что отложить до CRM

| Задача | Почему |
|--------|--------|
| Полный архив всех замерщиков | CRM + Admin SDK / отдельные rules для manager |
| CRUD `users` | CRM admin создаёт/блокирует замерщиков |
| Запись `config/prices` | CRM admin |
| Сложные field-level rules для `upcoming` (бронь/отмена/completed) | Нужны тесты всех transaction-веток |
| `assignedMeasurerId`, фильтрация pool по CRM | Поля и индексы в CRM |
| Legacy backfill `measurerId` | Миграция + CRM visibility |
| `ready_orders`, `dealers`, `InstallationScreen` | Роль монтажника / отдельное приложение |
| Custom claims `role == admin/manager` | Единая auth-модель CRM + app |

---

## 10. Что может сломать текущее приложение

| Изменение | Эффект |
|-----------|--------|
| **`measurements` read без legacy** | Старые заказы без `measurerId` исчезнут (ожидаемо) |
| **`measurements` create без auth** | Save offline/online без login — уже невозможен в UI |
| **Запрет `config/prices` write** | AdminScreen «Сохранить прайс» |
| **Seed `setDoc(prices)` при первом запуске** | Нужен документ из Console |
| **Upcoming rules с ownership до доработки** | Бронь/отмена/completed/note — PERMISSION_DENIED |
| **Catch-all deny без explicit rules** | Неожиданные read для `configs`/`dealers` если что-то начнёт читать |
| **Delete deny** | Кнопка удаления в архиве перестанет работать |
| **Query `where measurerId`** + rules | Должны совпадать; single-field index на `measurerId` обычно auto, composite не нужен без `orderBy` в query |

**Не сломается:** client-side sort по `archiveId`; outbox sync (если create/update разрешены владельцу); login + `getUserProfile` (при read own `users`).

---

## 11. Тесты после изменения rules

**Два аккаунта:** measurer A, measurer B (+ при необходимости `admin@test.ru`).

### Auth

- [ ] Login → профиль загружается
- [ ] Logout → нет доступа к коллекциям

### measurements

- [ ] A видит только свои заказы в архиве
- [ ] B не видит заказы A (UI + прямой getDoc в Console)
- [ ] A сохраняет новый замер (ручной и из заявки)
- [ ] A редактирует свой архив / «Отправить в работу»
- [ ] A удаляет свой заказ (если delete разрешён)
- [ ] Offline save → sync после online

### upcoming_measurements

- [ ] Список заявок после login
- [ ] Бронь свободной заявки
- [ ] B не снимает бронь A
- [ ] Отмена / completed / дата+комментарий только владельцем

### config/prices

- [ ] Прайс загружается после login
- [ ] AdminScreen save (если write ещё разрешён)

### Регрессия

- [ ] «Мои замеры» → «Начать замер» → save → заявка `completed`
- [ ] Ручной замер без `upcomingId`

---

## Схема целевой модели

```
┌─────────────────┐     read/write all      ┌──────────────┐
│  CRM (будущее)  │ ───────────────────────►│ measurements │
│  manager/admin  │     Admin SDK / rules   │  all orders  │
└─────────────────┘                         └──────────────┘
        ▲
        │ create users, prices, assignments
        │
┌─────────────────┐     read/write own      ┌──────────────┐
│ App замерщика   │ ───────────────────────►│ measurements │
│ measurerId=uid  │                         │  own only    │
└─────────────────┘                         └──────────────┘
```

---

## Шаг 1 для Agent/Edit (первая маленькая задача)

**Только `measurements` + явный deny catch-all для `users`:**

1. В `firestore.rules` добавить helpers `isSignedIn()`, `isMeasurementOwner()`, `createsAsOwner()`.
2. Заменить блок `match /measurements/{docId}`:
   - read/create/update: только `measurerId == request.auth.uid`;
   - delete: только владелец (или `if false` — по решению).
3. Добавить `match /users/{uid}` — read только `request.auth.uid == uid`.
4. **Не трогать** `upcoming_measurements` и `config/prices` на этом шаге.
5. Заменить catch-all на `allow read, write: if false` **или** убрать `read: if true` из catch-all (иначе `users` останется открытым).
6. Deploy rules → прогнать тесты из §11 для двух замерщиков.

Это согласует rules с уже реализованным query в `App.tsx` и архитектурой «приложение = только свои заказы», без ожидания CRM для полного архива.

---

## Связанные документы

- `docs/upcoming-measurement-completion-plan.md` — завершение заявок, `measurerId` в архиве
- `docs/auth-mvp-plan.md` — auth и rules roadmap
- `docs/app-audit-auth.md` — аудит безопасности
