# Анализ статусов архива `measurements` — отчёт для ChatGPT

**Дата:** 2026-05-31  
**Репозиторий:** `calc_v2`  
**Симптом:** в архиве замеров статусы ведут себя непоследовательно — часть заказов после «Отправить в работу» показывает «В производстве», часть остаётся «В ожидании».

**Ограничения анализа:** код не менялся, синхронизации не запускались. Только чтение React + Apps Script.

---

## 1. Краткий вывод

| Вопрос | Ответ |
|--------|-------|
| Source of truth для статуса архива | **`workStatus`** (не `status`) |
| Поле `status` в `measurements` | **Не используется** ни в React, ни в Apps Script |
| Главная причина непоследовательности | **Race condition** между outbox-sync (`workStatus: waiting`) и кнопкой «Отправить в работу» (`workStatus: in_production`) + UI merge, где pending outbox перекрывает cloud |
| Влияет ли `syncToFirestore()` на архив | **Нет** — пишет только в `upcoming_measurements` |
| Риск от `syncReadyOrders()` | Обновляет `measurements/{orderId из таблицы}` — может **не совпадать** с `measurements/{archiveId}` |

---

## 2. Поля статуса — где читаются и пишутся

### 2.1 React (`screens/`, `App.tsx`, `types.ts`)

| Поле | Чтение | Запись |
|------|--------|--------|
| `status` | **Нет** (для архива) | **Нет** |
| `workStatus` | `ArchiveScreen.resolveWorkStatus`, `App.resolveArchiveWorkStatus` | `ArchiveScreen.handleSendToManager` → `in_production`; `App.saveToArchive` → `waiting` (новый) или сохраняет существующий |
| `workStatusLabel` | `ArchiveScreen`, `App` | Вместе с `workStatus` |
| `workStatusUpdatedAt` | Не отображается отдельно | `serverTimestamp()` при «отправить в работу» |
| `ready_order_id` | **Не читается** | **Не пишется** |
| `ready_synced_at` | **Не читается** | **Не пишется** |

Тип: `types.ts` → `OrderWorkStatus = 'waiting' | 'in_production' | 'ready'`

### 2.2 Apps Script (`scripts/google-apps-script/firebase-crm.js`)

| Поле | Функция | Действие |
|------|---------|----------|
| `workStatus` | `syncReadyOrders` → `buildMeasurementReadyWrite_` | Пишет `ready`, только если doc существует и `workStatus !== 'ready'` |
| `workStatusLabel` | то же | `'Готов'` |
| `workStatusUpdatedAt` | то же | ISO timestamp |
| `ready_order_id` | то же | `orderId` из таблицы |
| `ready_synced_at` | то же | ISO timestamp |
| `status` | — | **Не используется** |

`syncToFirestore()` **не трогает** коллекцию `measurements` и **не содержит** полей статуса.

---

## 3. Отображение статуса в архиве

**Файл:** `screens/ArchiveScreen.tsx`

```typescript
const code = order.workStatus ?? 'waiting';
label = order.workStatusLabel || WORK_STATUS_LABELS[code];
```

**Fallback-порядок:**
1. `workStatus` → если отсутствует → `'waiting'`
2. `workStatusLabel` → если отсутствует → лейбл из словаря

**Лейблы UI:**
| `workStatus` | Текст в приложении |
|--------------|-------------------|
| `waiting` | В ожидании |
| `in_production` | В производстве |
| `ready` | Готов к монтажу |

> «В работе» в Google Sheets (статус листа «Рамочные»/«Плиссе»/«Шторы») — **другой контекст**, не поле архива.

---

## 4. Кнопка «Отправить в работу»

**Файл:** `screens/ArchiveScreen.tsx` → `handleSendToManager`

| Параметр | Значение |
|----------|----------|
| Поле статуса | **`workStatus`** (не `status`) |
| Коллекция | `measurements` |
| Firestore docId | **`order.archiveId`** (например `1748623456789-abc123`) |
| Операция | `setDoc(..., { workStatus, workStatusLabel, workStatusUpdatedAt }, { merge: true })` |
| Webhook в таблицу | POST с `orderID: order.archiveId` |

**Несогласованность docId в UI vs запись:**
- Для ключей UI / loading state: `firestoreId || archiveId`
- Для записи статуса: **всегда** `order.archiveId`

Если `firestoreId !== archiveId` (legacy / ручные правки Firestore), статус обновится **не в том документе**, который показывается в списке.

---

## 5. Создание и синхронизация документов архива

### 5.1 Сохранение замера (`App.tsx` → `saveToArchive`)

1. Генерируется или переиспользуется `archiveId` (`generateArchiveId()` → `{timestamp}-{random}`)
2. `resolveArchiveWorkStatus(existing)` → новый заказ: `waiting`; редактирование: сохраняет существующий `workStatus`
3. Запись в **local outbox** (`pendingArchiveOutbox`)
4. Асинхронно: `syncPendingArchiveOutbox` → `setDoc(doc(db, 'measurements', entry.archiveId), entry.order, { merge: true })`

**docId при создании = `archiveId`.** Новый UUID не используется.

### 5.2 Подписка на архив (`App.tsx` → `onSnapshot`)

```typescript
query(collection(db, 'measurements'), orderBy('archiveId', 'desc'))
// firestoreId: d.id добавляется к каждому документу
```

При корректных данных: **`firestoreId === archiveId === d.id`**.

### 5.3 Merge cloud + outbox (`mergeCloudAndPendingArchive`)

Если outbox entry активен (`pending` / `syncing` / `error`):

```typescript
byArchiveId.set(cloudOrder.archiveId, {
  ...cloudOrder,
  ...outboxEntry.order,  // ← может содержать workStatus: 'waiting'
  firestoreId: cloudOrder.firestoreId,
  hasPendingWrites: true,
});
```

**Pending outbox перекрывает cloud в UI**, включая `workStatus`.

Outbox удаляется только когда `onSnapshot` подтверждает совпадение `syncToken`.

---

## 6. `syncToFirestore()` — влияние на архив

**Коллекция:** `upcoming_measurements` (не `measurements`)

**Поля записи:** `name`, `phone`, `address`, `comment`, `payer_text`, `amount_rub`, `source_hash`, `source_key`, `updated_at`

| Проверка | Результат |
|----------|-----------|
| Вызывает `listAllDocumentNames_(COLLECTION_MEASUREMENTS)` для wipe | **Нет** (incremental diff) |
| Вызывает `batchDeleteDocuments_` для wipe | **Нет** |
| Пишет в `measurements` | **Нет** |
| Содержит `workStatus` / `status` | **Нет** |
| Может сбросить статус архива | **Нет** |

---

## 7. `syncReadyOrders()` — влияние на архив

**Коллекция ready_orders:** docId = `orderId` из колонки W таблицы.

**Обновление архива:**

```javascript
getDocument('measurements', orderData.orderId)
if (doc exists && workStatus !== 'ready') {
  update measurements/{orderId}: workStatus=ready, workStatusLabel, workStatusUpdatedAt, ready_order_id, ready_synced_at
}
```

| Сценарий | Эффект |
|----------|--------|
| Колонка W = `archiveId` (из webhook `orderID`) | Обновляет **тот же** doc → `ready` |
| Колонка W = телефон / `ID_n` / пусто | Doc `measurements/{archiveId}` **не найден** → skip или запись в **чужой** doc |
| `workStatus === 'in_production'` | Sync **перезапишет** на `ready` (не reset в waiting, но скачок статуса) |
| `workStatus === 'ready'` | **Не пишет** (guard) |

**Webhook из React** (`ArchiveScreen`): `orderID: order.archiveId` — связка работает только если Apps Script приёма записывает это в колонку W.

**Legacy-проблема:** старые `ready_orders` с docId = телефон / `ID_n` не связаны с `archiveId` приложения.

---

## 8. Таблица рисков

| Файл / функция | Действие | Поле статуса | docId | Риск |
|----------------|----------|--------------|-------|------|
| `App.saveToArchive` | Создаёт outbox + sync | `workStatus: waiting` (новый) | `archiveId` | Средний |
| `App.syncPendingArchiveOutbox` | `setDoc` полного order merge | весь объект incl. `workStatus` из outbox | `entry.archiveId` | **Высокий** — race с «отправить в работу» |
| `App.mergeCloudAndPendingArchive` | Merge для UI | outbox перекрывает cloud | `archiveId` | **Высокий** — UI показывает waiting при cloud in_production |
| `ArchiveScreen.handleSendToManager` | Статус после отправки | `in_production` | `order.archiveId` | Средний — не обновляет outbox |
| `ArchiveScreen.resolveWorkStatus` | Отображение | `workStatus ?? waiting` | — | Низкий |
| `App.resolveArchiveWorkStatus` | При save | existing или waiting | — | Средний — stale local state |
| `syncToFirestore` | Sync листа «Замеры» | — | `upcoming_measurements/m_*` | **Нет** |
| `syncReadyOrders` | Статус «Готов» | `ready` | `measurements/{orderId таблицы}` | **Высокий** — orderId ≠ archiveId |
| `InstallationScreen` | Связка ready_orders ↔ archive | не пишет статус | match по archiveId / phone+name+address | Низкий для архива |

---

## 9. Гипотеза главной причины симптома

### Race: outbox vs «Отправить в работу»

```
1. saveToArchive
   → outbox содержит order с workStatus: 'waiting'

2. Пользователь жмёт «Отправить в работу»
   → setDoc(measurements/{archiveId}, { workStatus: 'in_production' }, merge)
   → Firestore: in_production ✓

3a. Outbox ещё активен
    → mergeCloudAndPendingArchive: { ...cloud, ...outbox.order }
    → UI показывает waiting (outbox перекрывает cloud)

3b. ИЛИ outbox sync ПОСЛЕ шага 2
    → setDoc(measurements/{archiveId}, fullOrder с waiting, merge)
    → Firestore затирается обратно на waiting
```

Итог зависит от **порядка и скорости** операций → объясняет **непоследовательность** между заказами.

### Дополнительные факторы

1. **`handleSendToManager` не обновляет outbox** после смены статуса
2. **`firestoreId` vs `archiveId`** — запись по archiveId, UI иногда по firestoreId
3. **`syncReadyOrders`** — при неверном orderId статус `ready` уходит не в тот doc
4. **fetch webhook с `mode: 'no-cors'`** — не проверяет успех POST; ошибка таблицы не блокирует setDoc, но setDoc может упасть отдельно по permissions

---

## 10. Где пишут «не туда» / читают «не оттуда»

### Пишут не туда

| Место | Проблема |
|-------|----------|
| `syncReadyOrders` | `measurements/{orderId из таблицы}` может ≠ `measurements/{archiveId}` |
| Legacy ready_orders | docId = телефон / ID_n |
| `handleSendToManager` | Всегда archiveId, даже если карточка привязана к другому firestoreId |

### Читают не оттуда

| Место | Проблема |
|-------|----------|
| `mergeCloudAndPendingArchive` | Pending outbox важнее cloud → stale waiting в UI |
| `resolveArchiveWorkStatus` при save | Берёт из local archive, может не видеть свежий in_production |

### Где возможен reset в «ожидание»

1. **`syncPendingArchiveOutbox`** — merge полного order с `waiting` после «отправить в работу»
2. **`mergeCloudAndPendingArchive`** — outbox с waiting перекрывает cloud in_production в UI
3. **`saveToArchive` / edit** — если local state ещё waiting, повторный save пишет waiting
4. **`syncToFirestore`** — **не сбрасывает** (другая коллекция)
5. **`syncReadyOrders`** — **не сбрасывает** в waiting; максимум ставит ready на другом docId

---

## 11. Чеклист ручной проверки в Firestore (без массовых sync)

Для одной «проблемной» карточки:

1. Открыть `measurements/{archiveId}` — значение `workStatus` в Firebase Console
2. Проверить, нет ли второго doc `measurements/{phone}` или `measurements/{ID_n}` с workStatus
3. Сравнить колонку W в Google Sheets с `archiveId` из приложения
4. В DevTools → localStorage → ключ pending archive outbox — есть ли запись с тем же archiveId и `workStatus: waiting`
5. Сравнить `firestoreId` (d.id) и поле `archiveId` внутри документа — совпадают ли

---

## 12. Ключевые фрагменты кода (ссылки)

| Что | Файл | Строки (approx) |
|-----|------|-----------------|
| Отображение статуса | `screens/ArchiveScreen.tsx` | 27–37, 385–401 |
| Отправить в работу | `screens/ArchiveScreen.tsx` | 241–321 |
| resolveArchiveWorkStatus | `App.tsx` | 45–50 |
| saveToArchive | `App.tsx` | 690–789 |
| syncPendingArchiveOutbox | `App.tsx` | 290–379 |
| mergeCloudAndPendingArchive | `App.tsx` | 227–288 |
| onSnapshot measurements | `App.tsx` | 454–488 |
| syncReadyOrders archive update | `scripts/google-apps-script/firebase-crm.js` | 418–428, 704–727 |
| syncToFirestore (upcoming only) | `scripts/google-apps-script/firebase-crm.js` | 65–192, 237–255 |
| Типы статуса | `types.ts` | 47, 121–123 |

---

## 13. Возможные направления fix (не реализованы)

> Только для обсуждения с ChatGPT. Код не менялся.

1. При «Отправить в работу» — обновлять outbox entry (`workStatus: in_production`) или очищать outbox
2. В `mergeCloudAndPendingArchive` — не перекрывать `workStatus` из cloud, если cloud «новее» (сравнение `workStatusUpdatedAt`)
3. Использовать единый doc ref: `firestoreId || archiveId` везде, включая setDoc
4. В `syncReadyOrders` — искать measurements по `archiveId` / phone+address, а не только по orderId колонки W
5. Записывать `archiveId` в колонку W webhook-скриптом явно и валидировать перед sync

---

## 14. Связанные файлы проекта

- `App.tsx` — архив, outbox, merge
- `screens/ArchiveScreen.tsx` — UI архива, отправка в работу
- `screens/InstallationScreen.tsx` — связка ready_orders ↔ measurements
- `types.ts` — `OrderWorkStatus`, `ArchivedOrder`
- `scripts/google-apps-script/firebase-crm.js` — syncReadyOrders, syncToFirestore
- `PROJECT_OVERVIEW_FOR_CHATGPT.md` — общий обзор проекта
