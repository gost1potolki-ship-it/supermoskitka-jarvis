# План доработки приложения замерщика

**Корень проекта:** `D:/calc_v2`  
**Дата:** 2026-06-18

---

## Цель

Добавить многопользовательский режим для замерщиков:

- вход замерщика;
- роли `measurer` и `admin`;
- вкладки «Общие замеры» и «Мои замеры»;
- бронирование замера;
- автоматическое скрытие выполненного замера;
- связь с CRM, которая будет создавать замеры напрямую в Firebase.

---

## Важно

Google Таблица **не убирается** из системы.  
Она остаётся производственным контуром:

- заказы из приложения;
- вкладки «Рамочные», «Плиссе», «Шторы»;
- работа мастеров;
- статусы «В работе» / «Готов к монтажу»;
- обратная синхронизация статусов в приложение.

**Убирается только** вкладка «Замеры» как источник новых заявок на замер.

---

## Новый поток данных

```text
CRM создаёт заявку на замер
  → Firebase upcoming_measurements
  → приложение показывает заявку во вкладке «Общие замеры»
  → замерщик бронирует заявку
  → заявка переходит во вкладку «Мои замеры»
  → замерщик выполняет расчёт
  → сохраняет заказ в архив measurements
  → исходная заявка получает reservationStatus: completed
  → заявка исчезает из блока «Замеры»
  → заказ отправляется в Google Таблицу
  → мастера работают по производственным вкладкам
  → статус из таблицы возвращается в приложение
```

---

## Поля `upcoming_measurements`

```ts
reservationStatus: 'available' | 'reserved' | 'completed' | 'cancelled';
reservedByMeasurerId: string | null;
reservedByMeasurerName?: string;
reservedAt?: Timestamp;
completedAt?: Timestamp;
completedByMeasurerId?: string;
archiveId?: string;
source?: 'crm' | 'legacy_sheet';
```

---

## Поля `measurements`

```ts
measurerId: string;
measurerName?: string;
upcomingId?: string;
```

---

## Фазы

### Фаза 1. Auth foundation

- `firebase.ts`: добавить `getAuth()`.
- `types.ts`: добавить `UserRole`, `UserProfile`.
- `lib/auth.ts`: helper-функции входа/выхода.

### Фаза 2. Login

- `LoginScreen`.
- Auth gate в `App.tsx`.
- Logout.
- Проверка `users/{uid}.active`.

### Фаза 3. Замеры

- две вкладки: «Общие замеры» и «Мои замеры»;
- бронь через `runTransaction`;
- свободные заявки видны всем;
- забронированные видны только своему замерщику.

### Фаза 4. Завершение замера

- при сохранении архива писать `measurerId`, `measurerName`, `upcomingId`;
- исходный замер помечать `reservationStatus: completed`;
- completed-замеры не показывать в блоке «Замеры».

### Фаза 5. CRM

- CRM создаёт `upcoming_measurements` напрямую;
- вкладка «Замеры» в Google Таблице перестаёт быть источником новых заявок.

### Фаза 6. Firestore rules

- включать только после auth gate и фильтров;
- не затирать существующие правила бронирования;
- расширять текущие rules, а не переписывать с нуля.

---

## Нельзя трогать без отдельного разрешения

- `constants.ts`
- `logic/calculations.ts`
- `logic/orderTotals.ts`
- `screens/CalcScreen.tsx`
- структуру `PRICES`
- `firestore.rules` до готового auth gate
- Google Sheets / GAS
- CRM-проект

---

## Связанные документы

- [app-audit.md](app-audit.md)
- [app-audit-auth.md](app-audit-auth.md)
- [auth-mvp-plan.md](auth-mvp-plan.md)
