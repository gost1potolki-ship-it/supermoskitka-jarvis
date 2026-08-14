# Аудит «Калькулятор замерщика» — для ChatGPT

**Дата:** 2026-06-08  
**Репозиторий:** `D:\calc_v2` (актуальная версия)  
**Тип:** read-only аудит, код не менялся  

---

## Краткое резюме

Приложение заметно доработано по сравнению со старой копией: есть **фильтры архива**, **Refresh**, **sheetAck** + retry Firestore без повторного webhook, **проверка ответа GAS** (не `no-cors`), **защита outbox от отката workStatus**, **Firestore-бронирование** заявок, **GAS в репо** (`scripts/google-apps-script/firebase-crm.js`).

**Главные оставшиеся риски:**
1. Firestore rules полностью открыты.
2. `measurer_comp_v5` пишется, но в Upcoming больше не читается (рассинхрон с бронированием).
3. «Отправить в работу» разрешено при pending outbox / до полной синхронизации заказа.
4. Outbox может зависнуть, если на сервере нет `syncToken`.
5. `InstallationScreen` / `ready_orders` не подключены к меню в `App.tsx`.

**Терминология:** «Страховой депозит» = `includeMeasurementFee` + модалка оплаты замера при send; поля `measurementRequired`, `measurementPaidCash`, `managerTotal`, `amountDue`.

---

## Карта механизмов

```
Черновик:  CalcScreen → CartScreen → measurer_current_order (loadInitialOrder)
Архив:     saveToArchive → outbox → syncPendingArchiveOutbox (guards) → measurements
           mergeCloudAndPendingArchive + normalizeArchiveOrder → ArchiveScreen (фильтры)
В работу:  postOrderToGoogleSheet → sheetAck → setDoc in_production → onWorkStatusUpdated
Заявки:    upcoming_measurements onSnapshot + transaction reserve
Синхр GAS: firebase-crm.js → measurements workStatus, ready_orders (не из клиента)
```

### Ключевые файлы

| Модуль | Файлы |
|--------|-------|
| Оркестрация | `App.tsx` |
| Архив / send | `screens/ArchiveScreen.tsx` |
| Заявки | `screens/UpcomingScreen.tsx` |
| Корзина | `screens/CartScreen.tsx`, `logic/orderTotals.ts` |
| GAS | `scripts/google-apps-script/firebase-crm.js` |
| Rules | `firestore.rules` |

---

## Таблица проблем

| № | Модуль | Проблема / странность | Severity | Что может случиться | Как воспроизвести | Файлы и функции | Минимальное исправление | Чинить сейчас |
|---|--------|----------------------|----------|---------------------|-------------------|-----------------|-------------------------|---------------|
| 1 | Firestore | Rules: `allow read, write: if true` | Critical | Любой читает/пишет/удаляет все данные | Запись без auth | `firestore.rules` | Auth + rules по коллекциям | **Да** |
| 2 | localStorage | `measurer_comp_v5` пишется в `saveToArchive`, в Upcoming **не читается** | High | Дублирующая логика «выполнено»; бронь и comp_v5 расходятся | Save archive с адресом заявки → Upcoming не меняется | `App.tsx` saveToArchive; `UpcomingScreen` | Убрать comp_v5 или синхронизировать с reservation | **Да** |
| 3 | Отправить в work | Send разрешён при `syncStatus: pending/error`, guard только `workStatus === waiting` | High | Sparse doc в Firestore; send до полного sync | Save офлайн → сразу «Отправить в работу» | `ArchiveScreen` `canSendToManager`; `handleSendToManager` | Блокировать send пока `syncStatus !== undefined` и нет error | **Да** |
| 4 | Outbox | Зависание: outbox не удаляется, если server doc без `syncToken` | High | Вечный «⏳ Ожидает синхронизации» | Старые docs без syncToken + новый save | `App.tsx` onSnapshot ack filter | Migration syncToken или ack по archiveId+createdAt | **Да** |
| 5 | Безопасность | Пароль админки в клиенте (`3673108`) | High | Смена прайса всей сети | DevTools / APK | `App.tsx` `handleAdminLogin` | Auth + rules на `config/prices` | **Да** |
| 6 | Меню / UX | `InstallationScreen` есть, но **не в меню** и не в `App.tsx` | High | Монтажник не видит `ready_orders` из приложения | Искать «Список монтажей» в меню | `MenuScreen.tsx`, `App.tsx` | Подключить экран или удалить мёртвый код | Да |
| 7 | Архив UI | Default filter = **`ready`**, не `waiting` | Medium | Пустой список при первом входе | Открыть «Заказы в работе» | `ArchiveScreen` `useState('ready')` | Default `waiting` или запоминать фильтр | Нет |
| 8 | Архив UI | Фильтр «Самовывоз» исключает `waiting` pickup | Medium | Самовывоз в ожидании не виден во вкладке | Pickup + waiting | `filteredArchive` pickup branch | Включить waiting pickup | Нет |
| 9 | Редактирование | Edit архива без guard по `workStatus` | Medium | Изменение заказа уже в производстве/готов | Edit `in_production` order | `startArchiveEdit` | Блок или re-send workflow | Нет |
| 10 | Outbox UX | Нет кнопки retry при `syncStatus: error` | Medium | Красный бейдж до online/перезапуска | Offline save fail | `ArchiveScreen`, `App.tsx` | Кнопка → `syncPendingArchiveOutbox(id)` | Нет |
| 11 | Outbox | После setDoc статус outbox снова `pending` до snapshot | Medium | Долго «⏳» на медленной сети | Throttle network | `syncPendingArchiveOutbox` | Локальный «synced» после setDoc OK | Нет |
| 12 | sheetAck | При успехе webhook + fail Firestore ack остаётся в LS | Medium | Retry без дубля в таблице (OK), но зависит от LS | Kill app после webhook OK, до setDoc | `setSheetAck`, `clearSheetAck` | TTL или server-side ack flag | Нет |
| 13 | sheetAck | `clearSheetAck` только при полном success | Medium | Повторный send использует ack — OK; очистка LS вручную → дубль в таблице | Очистить LS между webhook и retry | `handleSendToManager` | Документировать / TTL | Нет |
| 14 | Webhook | GAS может вернуть `ok:true`, `rowsCreated:0` если все типы изделий пропущены (`!spec`) | Medium | Клиент отклонит (OK), но заказ «не отправлен» без ясной причины | Payload с неизвестными type | `firebase-crm.js` `handleIncomingOrderWebhook_`; `isWebhookSheetSuccess` | Ошибка если createdRows пуст и не duplicate | Нет |
| 15 | Webhook | Частичное создание строк при mix валидных/невалидных типов | Medium | Не все позиции в таблице | Заказ с экзотическим type | GAS `resolveOrderSheetForItemType_` | Валидация items до записи | Нет |
| 16 | GAS / клиент | Синхронизация таблица→Firestore только через GAS cron, не в реальном времени | Medium | Задержка статуса `ready` в приложении | Сменить статус в таблице | `firebase-crm.js` sync | Ожидаемо; документировать lag | Нет |
| 17 | Калькулятор | Default payment = QR (+8%) | Medium | Завышенный итог | Новый заказ без смены оплаты | `App.tsx` `DEFAULT_PAYMENT_METHOD` | Default cash | Нет |
| 18 | Калькулятор | Default `includeMeasurementFee: true` | Low | Замер в итоге по умолчанию | Новый заказ | `createEmptyOrder` | UX / default off для «по размерам» | Нет |
| 19 | Черновик | После save draft LS перезаписывается пустым order | Low | Пустой JSON в LS | Save → inspect LS | `App.tsx` useEffect | removeItem после reset | Нет |
| 20 | Upcoming | Бронь без привязки к замерщику (нет userId) | Medium | Любой может снять чужую бронь | Два устройства, снять бронь | `toggleReservation` | `reservedBy` + rules | Нет |
| 21 | Upcoming | `saveToArchive` всё ещё матчит адрес → `measurer_comp_v5` | Medium | Ложное «выполнено» в LS при неточном адресе | Адрес с опечаткой | `saveToArchive` | Убрать или normalize | Нет |
| 22 | measurements | `orderBy('archiveId')` — docs без поля не в списке | Medium | Пропавшие старые заказы | Legacy docs | `App.tsx` query | Migration | Нет |
| 23 | UX | `alert` на успех send | Low | Грубый UX на мобильном | Любой send | `handleSendToManager` | In-app toast | Нет |
| 24 | UX | Двойной tap Save (<800ms) молча игнорируется | Low | Непонятно, сохранилось ли | Double tap Save | `saveToArchive`, `CartScreen` | Disable + feedback | Нет |
| 25 | InProgress | `InProgressScreen` — заглушка, не в меню | Low | Мёртвый код | — | `InProgressScreen.tsx` | Удалить или подключить | Нет |
| 26 | Cloud Functions | Callable без auth | High | Спам email/VK | Invoke endpoint | `functions/src/index.ts` | `context.auth` | Да |
| 27 | Admin | `measurer_master_name` не используется в заказах | Low | Мёртвый LS ключ | Admin save | `AdminScreen.tsx` | Удалить или использовать | Нет |
| 28 | Archive QR | Статичный QR, не по `amountDue` | Medium | Неверная сумма оплаты | QR в карточке | `ArchiveScreen` paymentQrImage | Динамический QR | Нет |
| 29 | Firestore | Клиент пишет в `upcoming_measurements` (бронь) при open rules | High | Любой может бронировать/снимать все заявки | Скрипт в консоли | `UpcomingScreen`, rules | Rules + auth | **Да** |
| 30 | GAS | `rowsCreated:0` + `duplicate:true` — клиент OK | Low | Корректно | Повторный send | `isWebhookSheetSuccess` | — | Нет |
| 31 | GAS | Колонка W (`ORDER_ID_COL=22`) пишется в `buildSheetOrderRow_` | Low | OK при корректном GAS deploy | Inspect sheet | `firebase-crm.js` | Ручная проверка deploy | Нет |
| 32 | Скидка | Скидка на весь subtotal (изделия+монтаж+доставка+замер) | Low | Расхождение с бизнес-правилом | 10% + доставка | `orderTotals.ts` | Уточнить правило | Нет |
| 33 | Удаление | Delete без UI retry при failed sync | Medium | Заказ возвращается | Delete offline | `deleteFromArchive` | Retry + ошибка | Нет |
| 34 | Мёртвый код | `emailExport`, `vkManager`, `txtExport` не в UI | Low | Путаница | — | `lib/*` | Удалить или подключить | Нет |
| 35 | dealers / configs | Коллекции `dealers`, `configs` не используются | Low | — | — | — | N/A | Нет |

---

## Что уже исправлено / стабильно (vs старая копия)

| Механизм | Статус |
|----------|--------|
| Webhook `no-cors` без проверки | **Исправлено** — CORS + JSON + `isWebhookSheetSuccess` |
| Пустой `ok:true` без строк | **Защита** — `rowsCreated` / `duplicate` / `existingRows` |
| sheetAck + retry Firestore без дубля в таблице | **Реализовано** |
| Outbox откат `in_production` → `waiting` | **Смягчено** — stale guard + strip waiting fields |
| Фильтры архива + Refresh | **Реализовано** |
| Бронирование заявок Firestore | **Реализовано** |
| Retry Upcoming onSnapshot | **Реализовано** |
| Payment fields на send (`amountDue`, `managerTotal`, …) | **Реализовано** |
| GAS doPost + dedup + колонка W | **В репо** |
| `loadInitialOrder` при cold start | **Реализовано** |
| `mergeWorkStatusFields` по rank | **Реализовано** |
| Debounce save 800ms | **Есть** |

---

## localStorage

| Ключ | Назначение | Создаётся | Читается | Очищается | Риск |
|------|------------|-----------|----------|-----------|------|
| `measurer_current_order` | Черновик | `App` on change | `loadInitialOrder` | remove при save | Низкий |
| `measurer_pending_archive_orders` | Outbox | `persistPendingArchiveOutbox` | init, sync | ack / delete | Средний |
| `measurer_current_order_editing_archive_id` | Edit context | `persistEditingArchiveContext` | init | save/clear | Средний |
| `measurer_current_order_editing_archive_date` | Дата архива |同上 | save |同上 | Низкий |
| `measurer_prices` | Кэш прайса | onSnapshot | offline | не авто | Средний |
| `measurer_upcoming_ids` | id+address | `UpcomingScreen` | `saveToArchive` | не очищается | Средний |
| `measurer_comp_v5` | «Выполнено» (legacy) | `saveToArchive` | **нигде в UI** | не очищается | **Высокий** |
| `measurer_sheet_ack_v1` | Webhook OK до Firestore | `setSheetAck` | `getSheetAck` | `clearSheetAck` on success | Средний |
| `calc_mic_permission_hint_shown` | Mic hint | `CartScreen` | `CartScreen` | — | Нет |
| `measurer_master_name` | Имя мастера | `AdminScreen` | Admin init | — | Мёртвый |

---

## Firestore

| Коллекция | Клиент пишет | GAS пишет | Конфликты |
|-----------|--------------|-----------|-----------|
| `measurements` | outbox upsert, send status/payment, delete | workStatus, ready sync, import | workStatus, totals, payment |
| `config/prices` | admin, bootstrap | — | любой клиент |
| `upcoming_measurements` | reservationStatus, reservedAt | import (?) | бронь |
| `ready_orders` | **не пишет** | sync из таблицы | — |

---

## Outbox — сценарии

| Сценарий | Поведение |
|----------|-----------|
| waiting outbox vs server in_production | Skip upsert; patch или remove outbox |
| upsert strip waiting fields | Не затирает advanced status |
| syncToken match | Outbox удаляется после server confirm |
| syncToken missing on server | Outbox **может зависнуть** |
| Refresh | `syncPendingArchiveOutbox` + `getDocsFromServer` |

---

## Send to work — сценарии

| Сценарий | Поведение |
|----------|-----------|
| Webhook OK, Firestore fail | sheetAck остаётся; alert retry message |
| Webhook fail | Нет sheetAck; error alert |
| Повторный send (duplicate) | GAS `duplicate:true`; client OK |
| Повторный send (sheetAck) | Webhook skip; только Firestore |
| workStatus !== waiting | Кнопка скрыта |
| sync pending | Кнопка **всё ещё видна** |

---

## Webhook payload (актуальный)

`orderID`, `customer`, `items`, `deliveryCost`, `totalInstallCost`, `measurementRequired`, `measurementFee`, `measurementPaidCash`, `paymentMethod`, `paymentSurcharge`, `subtotalAfterDiscount`, `grandTotal`, `total` (managerTotal), `generalComment`.

---

## Топ-5 критичных проблем

1. **Открытые Firestore rules**
2. **`measurer_comp_v5` orphaned + рассинхрон с бронированием**
3. **Send to work до завершения sync outbox**
4. **Outbox зависает без server `syncToken`**
5. **`InstallationScreen` / `ready_orders` недоступны в UI**

---

## Что лучше не трогать

- `mergeWorkStatusFields` / stale outbox guards
- `isWebhookSheetSuccess` + sheetAck flow
- `DATABASE_MAPPING`
- `calculatePrice` engines
- `firebase-crm.js` dedup по orderId в колонке W

---

## Следующие шаги для Cursor

1. Firestore rules (auth + field-level)
2. Убрать или связать `measurer_comp_v5` с reservation
3. Block send при `syncStatus` pending/error
4. Outbox ack fallback без syncToken
5. Подключить Installation или удалить
6. Default archive filter → `waiting`
7. Guard edit для `in_production`/`ready`

---

## Чеклисты

### Телефон
- [ ] Save офлайн → reopen → outbox badge
- [ ] Save офлайн → online → send → refresh — статус не откатился
- [ ] Webhook OK / Firestore fail → retry с sheetAck
- [ ] Двойной send / duplicate в таблице
- [ ] Бронь на двух устройствах
- [ ] Фильтры архива + default `ready`
- [ ] QR+8% + скидка vs таблица
- [ ] includeMeasurementFee off → send без модалки депозита

### Firebase Console
- [ ] rules
- [ ] measurements: syncToken, payment fields после send
- [ ] upcoming: reservationStatus
- [ ] ready_orders sync от GAS

### Google Таблица
- [ ] doPost, колонка W = archiveId
- [ ] duplicate / rowsCreated
- [ ] Статусы В работе / Готов / СДАН → Firestore
- [ ] Частичные rows при mix типов

---

## Ограничения

- GAS в репо может отличаться от deployed версии — сверить deploy.
- Автотесты не запускались.
