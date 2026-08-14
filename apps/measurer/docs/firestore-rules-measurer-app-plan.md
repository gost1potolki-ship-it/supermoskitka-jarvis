# Firestore rules: план под архитектуру «CRM — центр, приложение — инструмент замерщика»

Анализ и план изменений `firestore.rules` для проекта приложения замерщика (`D:/calc_v2`).

**Архитектурное решение:**

- CRM — центральный пункт управления (менеджер, админ).
- Приложение — рабочий инструмент замерщика, не админ-панель.
- В приложении замерщик видит только свои архивные заказы (`measurerId === uid`).
- Полный общий архив — в CRM, не в приложении.

**Текущее состояние приложения (на момент анализа):**

- Архив запрашивается: `where('measurerId', '==', userProfile.uid)` + локальная сортировка по `archiveId`.
- В заказах есть: `measurerId`, `measurerName`, `upcomingId`.
- Legacy-заказы без `measurerId` в приложении не показываются.
- Роль `admin` в приложении **не даёт** доступ ко всему архиву (фильтр только по `measurerId`).

---

## 1. Collections, используемые приложением

| Collection | Где используется | Операции в prod-потоке |
|------------|------------------|------------------------|
| **`users/{uid}`** | `lib/auth.ts` → `getUserProfile` | **read** (свой профиль) |
| **`measurements/{archiveId}`** | `App.tsx` (outbox, onSnapshot, refresh), `ArchiveScreen.tsx` | **read**, **create/update** (`setDoc` merge), **delete** |
| **`upcoming_measurements/{id}`** | `UpcomingScreen.tsx`, `CartScreen.tsx` | **read**, **update** (transaction / `updateDoc`) |
| **`config/prices`** | `App.tsx`, `AdminScreen` через `savePrices` | **read**, **write** (`setDoc`) |

**В rules, но не в основном UI замерщика (`App.tsx`):**

| Collection | Статус |
|------------|--------|
| **`configs/{docId}`** | read-only в rules; в коде приложения не найдено |
| **`dealers/{docId}`** | read-only; не используется в `App.tsx` |
| **`ready_orders/{docId}`** | read-only; только в не подключённом `InstallationScreen.tsx` |

**Catch-all** `match /{document=**}`:

```javascript
match /{document=**} {
  allow read: if true;
  allow write: if false;
}
```

Любой документ без более строгего deny **читается анонимно**. Критично для `users/{uid}`.

---

## 2. Реальные операции приложения

### Auth (`lib/auth.ts`)

- Firebase Auth: sign-in / sign-out
- `getDoc(users/{uid})` — read профиля после входа

### `App.tsx`

- `onSnapshot` + `getDocsFromServer`: `measurements` с `where('measurerId', '==', uid)`
- `setDoc` merge: `measurements/{archiveId}` — полный архивный заказ (outbox)
- `getDoc`: проверка серверной версии при sync outbox
- `deleteDoc`: удаление из архива
- `runTransaction`: `upcoming_measurements` — completed
- `onSnapshot` + `setDoc`: `config/prices`

### `UpcomingScreen.tsx`

- `onSnapshot` / `getDocs`: вся коллекция `upcoming_measurements`
- `runTransaction`: бронь, снятие брони, отмена
- `updateDoc`: `scheduledAt`, `measurerNote`, метаданные

### `ArchiveScreen.tsx`

- `setDoc` merge: только статус работы + payment-поля

### `CartScreen.tsx`

- `getDocs`: read `upcoming_measurements` (модалка выбора адреса)

---

## 3. Что слишком открыто сейчас

| Проблема | Severity |
|----------|----------|
| **`measurements`: `allow read/create/update/delete: if true`** | Критично |
| **`upcoming_measurements`: `allow read: if true`** без auth | Высокий |
| **`upcoming_measurements`: update без auth и ownership** | Критично |
| **`config/prices`: write без auth** | Высокий |
| **Catch-all `read: if true`** | Критично — `users/{uid}` публичен |
| **Rules не проверяют `measurerId`** | Расхождение с UI-фильтром |

UI-фильтр `where('measurerId', '==', uid)` **не заменяет** rules.

---

## 4. Как безопасно ограничить `measurements`

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

| Операция | Правило |
|----------|---------|
| **read** | `isSignedIn() && resource.data.measurerId == request.auth.uid` |
| **create** | `createsAsOwner()` |
| **update** | `isOwner() && request.resource.data.measurerId == resource.data.measurerId` |
| **delete** | `isOwner()` (или `if false` — по решению) |

Legacy без `measurerId` — не видны замерщикам (полный архив в CRM).

---

## 5. Как безопасно ограничить `upcoming_measurements`

Текущий `hasOnly([...])` — хорошая основа, но **нет auth и ownership**.

| Операция | Условие |
|----------|---------|
| **read** | `isSignedIn()` |
| **Бронь** | signed in + свободная заявка + `reservedByMeasurerId == auth.uid` + hasOnly поля брони |
| **Снять бронь** | `resource.data.reservedByMeasurerId == auth.uid` |
| **Отмена** | владелец + `reserved` |
| **Completed** | владелец + `reserved` |
| **scheduledAt / measurerNote** | владелец |

create / delete — `false` (CRM/GAS).

---

## 6. Как ограничить `users/{uid}`

```javascript
match /users/{uid} {
  allow read: if isSignedIn() && request.auth.uid == uid;
  allow create, update, delete: if false;
}
```

**Обязательно** убрать или сузить catch-all read, иначе профили останутся публичными.

Создание пользователей — позже через CRM.

---

## 7. Как ограничить `config/prices`

```javascript
match /config/{docId} {
  allow read: if isSignedIn();
  allow write: if false; // прайс — CRM позже
}
```

**Конфликт:** `AdminScreen` + пароль в `App.tsx` пишет прайс — после `write: if false` сломается.

---

## 8. Что можно сделать уже сейчас (низкий риск)

1. **`measurements`** — auth + ownership по `measurerId`.
2. **`users/{uid}`** — read own + исправить catch-all.
3. **`upcoming_measurements`** — `read: if isSignedIn()` (минимальный шаг).
4. **`config/prices`** — `read: if isSignedIn()` (write пока оставить, если AdminScreen нужен).

---

## 9. Что отложить до CRM

- Полный архив всех замерщиков
- CRUD `users`
- Запись `config/prices`
- Сложные field-level rules для `upcoming`
- `assignedMeasurerId`, фильтрация pool
- Legacy backfill `measurerId`
- `ready_orders`, `dealers`, `InstallationScreen`
- Custom claims `role == admin/manager`

---

## 10. Что может сломать текущее приложение

| Изменение | Эффект |
|-----------|--------|
| measurements read без legacy | Старые заказы без `measurerId` исчезнут |
| config/prices write deny | AdminScreen «Сохранить прайс» |
| Seed prices при первом запуске | Нужен документ из Console |
| Upcoming ownership rules | PERMISSION_DENIED на бронь/отмену/completed |
| Catch-all deny | Неожиданные read для других коллекций |
| Delete deny | Удаление из архива перестанет работать |

---

## 11. Тесты после изменения rules

**Два аккаунта:** measurer A, measurer B.

**Auth:** login, logout, профиль.

**measurements:** A видит только свои; B не видит A; save; edit; send to work; delete; offline sync.

**upcoming_measurements:** список; бронь; B не снимает бронь A; отмена/completed/note только владельцем.

**config/prices:** read после login.

**Регрессия:** «Мои замеры» → save → completed; ручной замер без `upcomingId`.

---

## Схема целевой модели

```
CRM (будущее)  ──read/write all──►  measurements (all orders)
App замерщика  ──read/write own──►  measurements (measurerId=uid)
```

---

## Шаг 1 для Agent/Edit (рекомендуемый)

1. Helpers: `isSignedIn()`, `isMeasurementOwner()`, `createsAsOwner()`.
2. Блок `match /measurements/{docId}` — ownership по `measurerId`.
3. Блок `match /users/{uid}` — read only own.
4. **Не трогать** `upcoming_measurements` и `config/prices` на первом шаге.
5. Исправить catch-all (`allow read, write: if false` или убрать public read).
6. Deploy → тесты с двумя замерщиками.

---

## Связанные документы

- `docs/upcoming-measurement-completion-plan.md` — завершение заявок, `measurerId` в архиве
- `docs/auth-mvp-plan.md` — auth и rules roadmap
- `docs/app-audit-auth.md` — аудит безопасности
