# Завершение заявки после сохранения заказа

План и анализ: как безопасно помечать заявку `upcoming_measurements/{id}` выполненной после успешного сохранения архива.

**Контекст:** замерщик бронирует заявку → «Мои замеры» → «Начать замер» → расчёт → корзина → «Сохранить замер». После save нужно обновить исходную заявку:

- `reservationStatus: 'completed'`
- `completedAt: serverTimestamp()`
- `completedByMeasurerId: userProfile.uid`
- `archiveId: archiveId`

`firestore.rules` для этих полей уже подготовлены (см. `match /upcoming_measurements/{docId}`).

---

## 1. Где вызывается `onStartWork`

Только в `screens/UpcomingScreen.tsx`, на вкладке **«Мои замеры»**, по кнопке **«Начать замер»**:

```tsx
onClick={() => onStartWork?.({ name: m.customerName, phone: m.phone, address: m.address }, m.comment)}
```

На вкладке «Общие замеры» вместо этого — `reserveMeasurement`.

---

## 2. Какие аргументы передаются

Сигнатура пропа:

```ts
onStartWork?: (customer: { name: string; phone: string; address: string }, comment?: string) => void;
```

Фактический вызов:

1. **`customer`**: `{ name: m.customerName, phone: m.phone, address: m.address }`
2. **`comment`**: `m.comment` (опционально)

**`m.id` (ID заявки в Firestore) сейчас не передаётся.**

---

## 3. Где в `App.tsx` начинается замер

Обработчик `onStartWork` в рендере `UpcomingScreen`:

```tsx
onStartWork={(customer, comment) => {
  updateOrder({
    customer,
    generalComment: '' // Очищаем комментарий, чтобы не тянуть данные из таблицы
  });
  navigateToProducts();
}}
```

Что происходит:

- В state `order` подставляются данные клиента.
- `generalComment` **принудительно очищается** (комментарий из заявки игнорируется).
- Переход на экран выбора изделий (`products`).

Новый заказ **не создаётся явно** — используется текущий черновик `order`. Если в корзине уже был другой черновик, customer перезаписывается (items остаются).

Альтернативные входы в замер **без заявки**:

- Меню → «Новый замер» → `navigateToProducts()` (пустой/старый черновик).
- Корзина → модалка «Выбор из базы» → `handleSelectMeasurement` — только customer, без связи с заявкой.

---

## 4. Где находится `saveToArchive`

В `App.tsx` (~строки 942–1042). В `CartScreen` вызывается через проп:

```tsx
const performArchiveSave = () => {
  const saved = onSaveToArchive();
  if (!saved) return;
  // ...
};
```

Проброс из `App.tsx`: `onSaveToArchive={saveToArchive}`.

---

## 5. Какой `archiveId` используется при сохранении

```ts
const archiveId = editingArchiveOrderId || generateArchiveId();
// generateArchiveId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
```

- **Новый замер**: `generateArchiveId()` → `"<timestamp>-<random>"`.
- **Редактирование архива**: существующий `editingArchiveOrderId`.

`archiveId` попадает в `newArchivedOrder`, затем в localStorage-outbox и в Firestore `measurements/{archiveId}` через `syncPendingArchiveOutbox`.

---

## 6. Как лучше передать `upcomingId` из `UpcomingScreen` в `App.tsx`

**Рекомендация:** расширить колбэк `onStartWork` третьим аргументом:

```ts
onStartWork?: (
  customer: { name: string; phone: string; address: string },
  comment?: string,
  upcomingId?: string
) => void;
```

И вызывать:

```ts
onStartWork?.({ name, phone, address }, m.comment, m.id)
```

Почему так:

- Минимальный diff, явная связь «эта заявка → этот замер».
- Не нужно менять `OrderState` / `types.ts` на первом шаге.
- Не зависит от match по адресу (legacy `measurer_comp_v5` / `measurer_upcoming_ids`).

**Не рекомендуется** только match по адресу — уже есть проблема ложных совпадений (см. `AUDIT_FOR_CHATGPT.md`).

---

## 7. Где хранить активный `upcomingId`: state или ref

**State + localStorage** (по аналогии с `editingArchiveOrderId`):

| Механизм | Зачем |
|----------|-------|
| `useState<string \| null>` | доступ в `saveToArchive`, очистка при `resetOrderState` |
| `localStorage` (`measurer_active_upcoming_id`) | восстановление после перезагрузки/Capacitor вместе с `measurer_current_order` |

**Ref alone** — недостаточно: черновик заказа переживает reload, а ref — нет.

**Не класть в `order` JSON** без изменения `types.ts` — на первом шаге достаточно отдельного ключа.

Очищать `upcomingId` при:

- `resetOrderState` / `clearOrder`
- `startArchiveEdit` (редактирование архива — не завершение заявки)
- «Новый замер» из меню (если не из Upcoming)
- успешном `saveToArchive` (после постановки completion в очередь)

---

## 8. Как после успешного сохранения архива обновить `upcoming_measurements/{upcomingId}`

**Точка вызова:** внутри `saveToArchive`, **после** успешной записи в archive-outbox, **параллельно** с `syncPendingArchiveOutbox`.

**Условия:**

- есть `activeUpcomingId`
- **нет** `editingArchiveOrderId` (только новый замер, не правка архива)
- есть `userProfile?.uid`

**Payload:**

```ts
{
  reservationStatus: 'completed',
  completedAt: serverTimestamp(),
  completedByMeasurerId: userProfile.uid,
  archiveId: archiveId,  // тот же, что у outbox
}
```

**Паттерн обновления** — как `executeCancelMeasurement` в `UpcomingScreen`: `runTransaction` + проверки:

- документ существует
- `reservationStatus === 'reserved'`
- `reservedByMeasurerId === userProfile.uid`

Это защищает от гонок (сняли бронь / отменили / другой замерщик).

**UI:** `UpcomingScreen` уже скрывает `completed` / `cancelled`:

```ts
const isHiddenUpcoming = (m: UpcomingMeasurement): boolean =>
  m.reservationStatus === 'completed' || m.reservationStatus === 'cancelled';
```

После `onSnapshot` заявка уйдёт из «Мои замеры» автоматически.

**Legacy:** блок `measurer_comp_v5` в `saveToArchive` (строки ~976–996) можно **убрать** на том же этапе — он дублирует логику и больше не читается в UI.

---

## 9. Как не сломать outbox/offline logic

Archive-outbox (`measurer_pending_archive_outbox`) — **отдельный контур**:

1. Сначала localStorage-outbox
2. Потом async `setDoc(measurements/...)`
3. UI не блокируется

**Правила для completion:**

| Делать | Не делать |
|--------|-----------|
| Completion — **отдельный** Firestore-write, не в archive-outbox | Не вкладывать upcoming-update в `PendingArchiveOutboxEntry` |
| Ошибка completion **не должна** откатывать save/archive | Не блокировать `saveToArchive` await-ом на сеть |
| `void completeUpcoming(...)` fire-and-forget | Не менять `syncPendingArchiveOutbox` |
| try/catch + console.warn | Не показывать alert при offline-completion |

**Offline / retry:** если сеть недоступна, заявка останется `reserved`. Варианты (по нарастанию сложности):

1. **MVP:** один `updateDoc`, при ошибке — log (риск «висящей» брони).
2. **Безопаснее:** localStorage-очередь `measurer_pending_upcoming_completions: [{ upcomingId, archiveId, measurerUid, createdAt }]`, retry при старте приложения и после `online`.

Completion **не зависит** от успеха sync archive: `archiveId` уже известен локально, связь в заявке полезна даже если `measurements` ещё в outbox.

**Порядок в `saveToArchive`:**

1. outbox записан ✓
2. черновик очищен ✓
3. UI переключён ✓
4. `void syncPendingArchiveOutbox(archiveId)` ✓
5. `void completeUpcomingMeasurement(...)` ✓ (параллельно, не в finally outbox-sync)

---

## 10. Какие файлы нужно менять

| Файл | Изменения |
|------|-----------|
| **`App.tsx`** | хранение `activeUpcomingId`; расширение `onStartWork`; completion в `saveToArchive`; очистка в `resetOrderState`/`clearOrder`; опционально retry-очередь; удаление `measurer_comp_v5` |
| **`screens/UpcomingScreen.tsx`** | передать `m.id` в `onStartWork`; расширить тип пропа |

**Опционально (не обязательно на первом шаге):**

- `lib/completeUpcomingMeasurement.ts` — чистая функция transaction + retry
- `types.ts` — `upcomingId?` в `ArchivedOrder` (связь archive ↔ заявка на стороне measurements)

**Не нужно менять:**

- `CartScreen.tsx` — save через `onSaveToArchive()` без изменений
- `firestore.rules` — уже готовы для полей completion

---

## 11. Какие файлы нельзя трогать (на этом этапе)

- **`firestore.rules`** для `measurements` — не менять
- **`constants.ts`** — не менять
- **`logic/calculations.ts`**, движки расчёта — не менять
- **`CartScreen.tsx`** — не обязателен
- **`types.ts`** — можно не трогать на первом шаге
- **`syncPendingArchiveOutbox`** и структура archive-outbox — не рефакторить

---

## Риски и краевые случаи

```
Upcoming: Начать замер
  → App: order.customer + activeUpcomingId
  → products → calc → cart
  → saveToArchive
      → outbox + archiveId
      → complete upcoming_measurements
      → sync measurements
  → onSnapshot скрывает заявку
```

| Сценарий | Поведение |
|----------|-----------|
| Замер из меню («Новый замер») | `activeUpcomingId = null` → completion не вызывается |
| Выбор адреса в корзине из базы | без `upcomingId` → completion не вызывается |
| Редактирование архива | `editingArchiveOrderId` set → completion не вызывается |
| Reload посреди замера | нужен localStorage для `upcomingId` |
| Offline save | archive в outbox OK; completion — retry-очередь |
| Двойной Save (<800ms) | уже заблокирован `lastArchiveSaveAtRef` |

---

## План реализации

### Шаг 1 — только проводка ID, без Firestore completion

1. В `UpcomingScreen.tsx`:
   - расширить тип `onStartWork` третьим аргументом `upcomingId?: string`;
   - в кнопке «Начать замер» передавать `m.id`.

2. В `App.tsx`:
   - добавить `activeUpcomingId` (state) + ключ localStorage `measurer_active_upcoming_id`;
   - в обработчике `onStartWork` сохранять `upcomingId`;
   - в `resetOrderState` / `clearOrder` / `startArchiveEdit` / `onCreate` из меню — сбрасывать ID;
   - при инициализации — восстанавливать из localStorage.

**Без:** `updateDoc`/`runTransaction`, без правок `saveToArchive`, `CartScreen`, `types.ts`, rules.

**Проверка:** «Начать замер» → reload приложения → черновик и `upcomingId` на месте; «Отмена» / новый замер из меню → ID сброшен.

### Шаг 2 — completion после save

- В `saveToArchive`: fire-and-forget completion + удаление legacy `measurer_comp_v5` + простая offline-очередь.

---

## Связанные документы

- `docs/auth-mvp-plan.md` — поля `upcomingId` в архиве, auth
- `AUDIT_FOR_CHATGPT.md` — проблема `measurer_comp_v5` / match по адресу
- `docs/app-audit-auth.md` — связь заявка ↔ архив
