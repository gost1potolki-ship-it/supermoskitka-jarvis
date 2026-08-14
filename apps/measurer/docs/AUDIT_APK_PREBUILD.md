# Аудит перед сборкой APK (Capacitor)

Дата: 2025-02-21. Фокус: критические ошибки, API, маршрутизация, утечки памяти, производительность.

---

## 1. Критические проблемы

### 1.1 Яндекс STT в APK не работает (относительный URL `/api/...`)

**Файл:** `screens/CartScreen.tsx` (строка ~411)

- Используется относительный URL: `fetch('/api/yandex-stt/speech/v1/stt:recognize?...')`.
- Прокси Vite (`vite.config.ts` → `server.proxy['/api/yandex-stt']`) работает **только в dev**. В собранном APK приложение открывается с `capacitor://localhost` или `https://localhost`, прокси нет — запрос уходит на тот же origin и даёт 404 или сетевая ошибка.
- **Рекомендация:** ввести переменную окружения для базового URL API (например `VITE_API_BASE`). В dev оставлять пустую (относительные запросы к прокси), в production задавать полный URL вашего бэкенда, который проксирует запросы к Yandex STT. В коде: `const base = import.meta.env.VITE_API_BASE || ''; const url = \`${base}/api/yandex-stt/...\`;`

### 1.2 Утечка ресурсов при размонтировании CartScreen (микрофон / аудио)

**Файл:** `screens/CartScreen.tsx`

- При уходе со экрана корзины во время записи (или после `startRecording`, но до `stopRecording`) не вызывается очистка:
  - `streamRef.current.getTracks().forEach(t => t.stop())`
  - `processorRef.current?.disconnect()`, `audioCtxRef.current?.close()`
- Остаются висеть `MediaStream`, `AudioContext`, `ScriptProcessorNode` → утечка и возможные предупреждения в консоли.
- **Рекомендация:** в `useEffect` с пустым массивом зависимостей вернуть функцию очистки, которая останавливает запись и освобождает все ref’ы (stream, audioContext, processor), если они заданы.

### 1.3 setState после размонтирования (асинхронные операции)

**Файлы:** `screens/CartScreen.tsx`, `screens/ArchiveScreen.tsx`, `screens/UpcomingScreen.tsx`

- После `await` (fetch, Firestore, `sendOrderToManager`) вызывается `setState`. Если пользователь уже ушёл с экрана, возможны предупреждения React и лишние обновления.
- В CartScreen: `transcribeAudio`, `fetchUpcomingMeasurements`, обработчик «Менеджеру» с `setTimeout(..., 3000)`.
- В ArchiveScreen: `handleSendToManager` и `setTimeout` для сброса статуса.
- В UpcomingScreen: `load()` с `setMeasurements` / `setLoading` / `setRefreshing`.
- **Рекомендация:** использовать флаг «смонтирован» (ref), проверять его перед каждым `setState` после асинхронной операции, либо отменять подписки/таймеры в cleanup `useEffect`.

---

## 2. API и сеть

### 2.1 Telegram Bot API без таймаута

**Файл:** `lib/telegram.ts`

- `fetch(url, { method: 'POST', ... })` без `signal` и таймаута. При плохой сети запрос может висеть очень долго.
- **Рекомендация:** использовать `AbortController` и `setTimeout(..., 15000)` (или 20–30 с), передавать `signal` в `fetch`, в `finally` вызывать `clearTimeout`.

### 2.2 Таймаут STT: clearTimeout только при успешном ответе

**Файл:** `screens/CartScreen.tsx` (строки 416, 424)

- `clearTimeout(timeout)` вызывается только после успешного `await fetch(...)`. Если выбросит исключение (сеть, parse и т.д.), таймер не очищается.
- **Рекомендация:** очищать таймер в `finally` блока try/finally вокруг запроса (или в общем finally функции).

### 2.3 Ошибки Firestore только в консоль

**Файлы:** `screens/CartScreen.tsx` (`fetchUpcomingMeasurements`), `screens/UpcomingScreen.tsx` (`load`)

- В `catch` только `console.error`. Пользователь не видит, что список замеров/адресов не загрузился (офлайн или ошибка сети).
- **Рекомендация:** сохранять в state флаг/текст ошибки и показывать короткое сообщение в UI (например, «Не удалось загрузить список» + повторить).

---

## 3. Маршрутизация

- Роутера (React Router и т.п.) нет: навигация через локальный state в `App.tsx` (`currentScreen` + функции `navigateTo*`).
- Для Capacitor этого достаточно, если не нужны глубокие ссылки (deep links) и восстановление экрана по URL. При необходимости можно позже добавить HashRouter и синхронизацию с `location.hash` без ломки текущей логики.

---

## 4. Память и подписки

### 4.1 Firestore onSnapshot — отписка есть

**Файл:** `App.tsx` (строки 83–108, 112–118, 124–128, 131–135)

- Подписки `onSnapshot` (prices, archive) корректно отменяются в cleanup `useEffect` (при размонтировании вызываются `unsubPrices()`, `unsubArchive()`). Утечки подписок нет.

### 4.2 Таймеры в CartScreen и ArchiveScreen

- В CartScreen несколько `setTimeout(..., 3000)` и один 1500 ms для показа модалок/статусов. При уходе с экрана до срабатывания таймера будет вызов setState на размонтированном компоненте.
- **Рекомендация:** хранить id таймеров в ref и очищать их в cleanup `useEffect` при размонтировании CartScreen/ArchiveScreen, либо проверять «смонтирован» перед setState в колбэках таймеров.

---

## 5. Производительность

- Тяжёлые расчёты вынесены в `useMemo` (например, `deliveryCost`, `total`, `filteredMeasurements`). Критичных тяжёлых вычислений в рендере не найдено.
- Списки (архив, корзина, замеры) без виртуализации; при большом количестве элементов можно добавить виртуализацию позже.
- Дублирования подписок Firestore нет: один раз в App при монтировании.

---

## 6. Исключения и обработка ошибок

| Место | Обработка |
|-------|-----------|
| `sendOrderToManager` (CartScreen, ArchiveScreen) | try/catch + setState ошибки / статус — ок. |
| `transcribeAudio` (CartScreen) | try/catch/finally, AbortError обработан — ок. |
| `saveToArchive` (App) | try/catch + alert — ок. |
| `deleteFromArchive` (App) | try/catch + alert — ок. |
| `savePrices` (App) | try/catch + alert — ок. |
| `getConfig()` (telegram.ts) | throw при отсутствии env — вызывающий код ловит. |
| `fetchUpcomingMeasurements` / `load` (Upcoming) | только console.error — см. п. 2.3. |

---

## 7. Приоритет исправлений

1. **Критично:** очистка микрофона/аудио при размонтировании CartScreen.
2. **Критично:** настройка API для APK (VITE_API_BASE или отдельный backend для Yandex STT).
3. **Важно:** таймаут для Telegram fetch; clearTimeout таймаута STT в finally.
4. **Желательно:** отмена таймеров при размонтировании CartScreen/ArchiveScreen или проверка «смонтирован» перед setState; показ ошибки загрузки списков Firestore в UI.

---

## Выполненные доработки (после аудита)

- **Безопасный setState:** Во всех компонентах с асинхронными операциями добавлен паттерн `useRef` (`isMountedRef`). Перед каждым `setState` после `await` или в колбэках `setTimeout` выполняется проверка `isMountedRef.current`. Таймеры в CartScreen и ArchiveScreen сохраняются в `timeoutIdsRef` и очищаются в `useEffect` cleanup при размонтировании.
- **Ошибки Firestore в UI:** В CartScreen (модалка «Выбор из базы») и в UpcomingScreen при ошибке загрузки спиннер скрывается, отображается сообщение «Не удалось загрузить данные. Проверьте подключение к сети» и кнопка «Повторить».

После внесения правок имеет смысл прогнать сценарии: запись голоса на корзине, отправка менеджеру, сохранение в архив, офлайн и повторное открытие приложения.
