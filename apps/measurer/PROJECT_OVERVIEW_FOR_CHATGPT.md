# PROJECT_OVERVIEW_FOR_CHATGPT

Документ подготовлен для передачи в ChatGPT при проектировании дилерского кабинета на основе текущего приложения «Калькулятор Замерщика».

Важно по безопасности: реальные значения API-ключей, токенов, паролей, Firebase config, банковских реквизитов, `.env` и Google Apps Script webhook в этом обзоре не раскрываются. Интеграции описаны только по типу, файлам, коллекциям, функциям и именам env-переменных.

## 1. Краткое описание проекта

Проект `supermoskitka-app` - мобильное веб-приложение для замерщиков компании «Супермоскитка». Оно помогает мастеру на объекте:

- получать и просматривать заявки на замер;
- рассчитывать стоимость москитных сеток, штор плиссе и оконных услуг;
- собирать несколько позиций в один заказ;
- учитывать монтаж, доставку, замер, скидку и способ оплаты;
- сохранять замер в облачный архив;
- редактировать сохраненные замеры;
- отправлять заказ в работу через интеграцию с Google Apps Script / Google Sheets;
- работать частично офлайн за счет `localStorage`, Firestore persistence и локальной очереди синхронизации.

Основная аудитория приложения - замерщики и внутренняя команда компании. Это не дилерский кабинет: в текущем виде нет регистрации дилеров, личных кабинетов, ролей, изоляции данных по дилерам и защищенного API.

Основные сценарии работы:

- **Заявка на замер:** мастер открывает список заявок, звонит клиенту, строит маршрут, нажимает «Начать замер», после чего данные клиента подставляются в черновик заказа.
- **Новый расчет:** мастер выбирает тип изделия, вводит размеры и параметры, добавляет позицию в корзину.
- **Оформление замера:** в корзине заполняются данные клиента, доставка, монтаж, скидка, способ оплаты и комментарий.
- **Сохранение:** заказ сохраняется в локальную очередь и затем синхронизируется в Firestore `measurements`.
- **Архив:** сохраненные замеры отображаются в облачном архиве, могут редактироваться, удаляться, открываться на карте и отправляться в работу.
- **Администрирование прайса:** через скрытый вход в админку можно редактировать цены и коэффициенты, которые синхронизируются в Firestore `config/prices`.

## 2. Технический стек

### Frontend

- React 19
- TypeScript 5
- Vite 5
- Tailwind CSS 3
- PostCSS / Autoprefixer
- `lucide-react` для иконок
- `qrcode.react` для QR-кодов
- `@fontsource/inter`

### Mobile / PWA

- Capacitor 6
- Android-проект в папке `android/`
- PWA manifest: `public/manifest.webmanifest`
- `metadata.json` запрашивает доступ к микрофону

### Backend / база

- Firebase Web SDK 10
- Firestore modular SDK
- Firestore offline persistence через `enableIndexedDbPersistence`
- Firebase Cloud Functions на Node.js 18
- `nodemailer` в Functions для отправки email

### Внешние интеграции

- Google Apps Script / Google Sheets: отправка заказа в работу из архива.
- Yandex STT: голосовой ввод комментария в корзине через `/api/yandex-stt`.
- Tochka API: создание QR СБП в `lib/tochkaApi.ts`.
- VK API: отправка отчета через Firebase Callable Function `sendVkOrderReport`.
- Email: отправка отчета через Firebase Callable Function `sendOrderToManager`.

### Команды запуска и сборки

Из `package.json`:

```bash
npm install
npm run dev
npm run build
npm run preview
npm run cap:sync
npm run cap:android
npm run build:android
npm run icons
```

Назначение команд:

- `npm run dev` - запуск Vite dev server.
- `npm run build` - `tsc && vite build`, сборка в `dist/`.
- `npm run preview` - просмотр production-сборки.
- `npm run build:android` - сборка web-приложения и синхронизация с Android через Capacitor.
- `npm run cap:android` - открыть Android-проект.

Для Firebase Functions в `functions/package.json`:

```bash
cd functions
npm install
npm run build
npm run serve
```

## 3. Структура проекта

Дерево примерно до 3-4 уровней. Исключены `node_modules`, `dist`, `build`, `.git`, `android/build`, `.env`, ключи и токены.

```text
D:/calc_v2/
├── android/
│   ├── app/
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── java/com/supermoskitka/app/MainActivity.java
│   │   │   │   ├── res/
│   │   │   │   └── AndroidManifest.xml
│   │   │   ├── androidTest/
│   │   │   └── test/
│   │   ├── build.gradle
│   │   └── proguard-rules.pro
│   ├── gradle/wrapper/
│   ├── build.gradle
│   ├── settings.gradle
│   ├── variables.gradle
│   ├── gradlew
│   └── gradlew.bat
├── assets/
│   ├── payment-qr.png
│   └── README.md
├── components/
│   ├── IconMapColor.tsx
│   └── IconRouteColor.tsx
├── docs/
│   └── AUDIT_APK_PREBUILD.md
├── functions/
│   ├── src/
│   │   └── index.ts
│   ├── lib/
│   │   └── index.js
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
├── lib/
│   ├── emailExport.ts
│   ├── formatOrderForManager.ts
│   ├── phone.ts
│   ├── tochkaApi.ts
│   ├── txtExport.ts
│   └── vkManager.ts
├── logic/
│   ├── calculations.ts
│   └── orderTotals.ts
├── public/
│   ├── favicon.svg
│   └── manifest.webmanifest
├── screens/
│   ├── AdminScreen.tsx
│   ├── ArchiveScreen.tsx
│   ├── CalcScreen.tsx
│   ├── CartScreen.tsx
│   ├── HomeScreen.tsx
│   ├── InProgressScreen.tsx
│   ├── InstallationScreen.tsx
│   ├── MenuScreen.tsx
│   └── UpcomingScreen.tsx
├── scripts/
│   ├── analyze-plisse-dealer-prices.ts
│   ├── generate_dealer_plisse_docx.py
│   └── output/
│       ├── dealer-plisse-range-summary.json
│       ├── dealer-plisse-range-summary.md
│       ├── dealer-plisse-size-checks.json
│       ├── dealer-plisse-size-checks.md
│       ├── dealer-plisse-summary.json
│       └── dealer-plisse-summary.md
├── App.tsx
├── index.html
├── index.tsx
├── index.css
├── constants.ts
├── types.ts
├── firebase.ts
├── firestore.rules
├── firebase.json
├── capacitor.config.ts
├── vite.config.ts
├── tailwind.config.cjs
├── postcss.config.cjs
├── tsconfig.json
├── package.json
├── package-lock.json
├── README.md
├── BUILD_APK.md
├── metadata.json
└── PROJECT_OVERVIEW_FOR_CHATGPT.md
```

В рабочем дереве также есть `.tmp-analysis*` и сгенерированные аналитические файлы/документы по дилерским ценам плиссе. Они выглядят как временные или вспомогательные артефакты анализа, а не как основной runtime-код приложения.

## 4. Главные точки входа

### `package.json`

Описание проекта: `Professional Measurer Calculator for Android`.

Основные зависимости:

- `react`
- `react-dom`
- `firebase`
- `lucide-react`
- `qrcode.react`
- `@capacitor/core`
- `@capacitor/android`
- `@capacitor/cli`
- `tailwindcss`
- `typescript`
- `vite`

### `index.html`

HTML shell приложения:

- язык `ru`;
- viewport отключает масштабирование;
- title: `Калькулятор Замерщика`;
- подключает manifest;
- содержит `div#root`;
- загружает `/index.tsx`.

В `index.html` также есть import map с CDN-ссылками. В Vite-сборке основная точка входа все равно `index.tsx`.

### `index.tsx`

Монтирует React-приложение:

- импортирует `index.css`;
- создает root через `ReactDOM.createRoot`;
- рендерит `<App />` в `React.StrictMode`.

### `App.tsx`

Главный компонент приложения и фактический роутинг. React Router не используется.

Состояние экрана:

```ts
type ScreenState = 'splash' | 'menu' | 'products' | 'calc' | 'cart' | 'archive' | 'admin' | 'upcoming' | 'inProgress';
```

`App.tsx` отвечает за:

- splash screen;
- переходы между экранами;
- глобальный header;
- корзину и черновик заказа;
- выбранный тип изделия;
- редактирование позиции;
- редактирование архивного заказа;
- синхронизацию цен из Firestore `config/prices`;
- синхронизацию архива из Firestore `measurements`;
- локальный outbox для сохранения/удаления заказов;
- сохранение черновика в `localStorage`;
- вход в админку через парольный modal.

### `vite.config.ts`

Vite config:

- `base: './'` для корректной работы внутри Capacitor WebView;
- сборка в `dist`;
- `server.port: 3000`;
- dev proxy:
  - `/api/yandex-gpt` -> Yandex LLM API;
  - `/api/yandex-stt` -> Yandex SpeechKit STT;
  - `/api/tochka` -> Tochka API.

Значения ключей для этих интеграций не находятся в этом файле; для Yandex/Tochka используются env-переменные и/или backend proxy.

### `capacitor.config.ts`

Capacitor config:

- `appId: com.supermoskitka.app`;
- `appName: Супермоскитка`;
- `webDir: dist`;
- `androidScheme: https`.

### `firebase.ts`

Инициализирует Firebase app и Firestore:

- `initializeApp(firebaseConfig)`;
- `getFirestore(app)`;
- `enableIndexedDbPersistence(db)`.

Реальные значения Firebase web config в обзоре не раскрываются.

### `firebase.json`

Настраивает Firebase:

- Functions source: `functions`;
- Firestore rules: `firestore.rules`.

### `functions/src/index.ts`

Firebase Cloud Functions:

- `sendOrderToManager` - callable-функция для отправки текста заказа на email менеджера;
- `sendVkOrderReport` - callable-функция для отправки текста заказа в VK messages.

Секреты берутся из Firebase Functions config или переменных окружения. Значения не раскрываются.

## 5. Основные разделы приложения

### `screens/MenuScreen.tsx`

Главное меню приложения.

Данные:

- только callback-пропсы из `App.tsx`;
- своего Firestore/state для бизнес-данных нет.

Действия пользователя:

- открыть «Заявки на замер»;
- открыть «Калькулятор»;
- открыть «Архив»;
- нажать скрытую кнопку настроек для входа в админку.

### `screens/HomeScreen.tsx`

Экран выбора типа изделия.

Данные:

- enum `ProductType` из `types.ts`;
- `cartCount` из текущего черновика заказа.

Группы изделий:

- москитные сетки: рамочные, крыло, внутривставные, дверные, рулонные, плиссе-сетки;
- шторы плиссе: Портал, Лайт, Уют+;
- обслуживание окон: уплотнитель, гребенка, детский замок, регулировка.

Действия пользователя:

- выбрать тип изделия и перейти к расчету;
- открыть корзину, если в ней есть позиции.

### `screens/CalcScreen.tsx`

Экран расчета одной позиции.

Данные:

- `type: ProductType`;
- `initialItem` для редактирования;
- `prices` из `App.tsx`;
- справочники подписей из `constants.ts`;
- функция `calculatePrice()` из `logic/calculations.ts`.

Основные вводимые параметры:

- ширина и высота;
- количество;
- цвет профиля;
- тип полотна/ткани;
- профиль рамы или двери;
- крепление, уголки, ручки;
- параметры плиссе: открывание, порог, количество ручек;
- дверная фурнитура: петли, защелка, шпингалет;
- для услуг: количество, тип гребенки или тип регулировки.

Действия пользователя:

- ввести параметры изделия;
- увидеть итоговую стоимость позиции;
- добавить позицию в корзину;
- сохранить изменения при редактировании;
- отменить расчет.

### `screens/CartScreen.tsx`

Корзина и оформление замера.

Данные:

- `OrderState` из `App.tsx`;
- `prices`;
- `calculateOrderTotals()` из `logic/orderTotals.ts`;
- Firestore `upcoming_measurements` для выбора адреса/клиента из базы заявок;
- Yandex STT для голосового комментария.

Действия пользователя:

- заполнить имя, телефон и адрес клиента;
- выбрать клиента/адрес из заявок;
- изменить количество позиций;
- редактировать или удалить позицию;
- указать, нужен ли монтаж;
- вручную переопределить стоимость монтажа;
- выбрать доставку по городу, за город или самовывоз;
- указать километры для загородной доставки;
- добавить комментарий;
- надиктовать комментарий через микрофон;
- выбрать скидку 0 / 5 / 10%;
- указать способ оплаты: наличные или карта/QR;
- включить/выключить стоимость замера в итог;
- сохранить замер в архив;
- отменить текущий замер.

### `screens/ArchiveScreen.tsx`

Облачный архив замеров.

Данные:

- `archive` из `App.tsx`: объединение Firestore `measurements` и локального outbox;
- `prices`;
- `ArchivedOrder`;
- `OrderWorkStatus`.

Действия пользователя:

- открыть карточку архивного заказа;
- посмотреть состав заказа, услуги и итоги;
- позвонить клиенту;
- открыть адрес в Яндекс Картах, 2ГИС или Google Maps;
- построить маршрут;
- показать статичный QR для оплаты;
- отправить заказ в работу;
- редактировать замер;
- удалить замер.

При отправке в работу:

- формируется payload заказа;
- выполняется POST в Google Apps Script webhook;
- в Firestore `measurements/{archiveId}` обновляется статус `in_production`.

Полный URL webhook не раскрывается.

### `screens/UpcomingScreen.tsx`

Экран заявок на замер.

Данные:

- Firestore `upcoming_measurements`;
- `DATABASE_MAPPING` из `types.ts` для нормализации колонок/полей;
- `localStorage`:
  - `measurer_comp_v5` - локально отмеченные выполненными заявки;
  - `measurer_upcoming_ids` - адреса/ID загруженных заявок.

Действия пользователя:

- обновить список заявок;
- раскрыть заявку;
- позвонить клиенту;
- открыть карту;
- построить маршрут;
- отметить заявку выполненной локально;
- начать замер, подставив клиента в черновик заказа.

### `screens/AdminScreen.tsx`

Экран администрирования прайса.

Данные:

- `PRICES.price_settings`;
- текущие цены из Firestore `config/prices`;
- `measurer_master_name` в `localStorage`;
- `generateAiPrompt()` из `constants.ts`.

Действия пользователя:

- редактировать цены профилей, полотен, комплектующих, коэффициентов, логистики и услуг;
- сохранить прайс в Firestore `config/prices`;
- сохранить имя мастера в `localStorage`;
- сбросить прайс к дефолту из `constants.ts`.

Доступ ограничен только UI-паролем в `App.tsx`. Значение пароля в обзор не включено.

### `screens/InProgressScreen.tsx`

Заглушка «Замеры в работе».

Данные:

- бизнес-данные не загружаются.

Действия пользователя:

- фактических действий нет.

В `App.tsx` есть состояние `inProgress`, но экран не подключен кнопкой в меню.

### `screens/InstallationScreen.tsx`

Экран монтажника/готовых заказов. Файл есть, но в `App.tsx` не импортируется и в основной навигации приложения замерщика не используется.

Данные:

- Firestore `ready_orders`;
- Firestore `measurements`;
- `lib/tochkaApi.ts`;
- `qrcode.react`;
- fallback на ГОСТ QR.

Действия пользователя:

- просмотреть заказы на монтаж;
- позвонить клиенту;
- открыть маршрут;
- показать QR для оплаты.

## 6. Логика расчетов

### Основные файлы

- `logic/calculations.ts` - расчет цены позиции.
- `logic/orderTotals.ts` - расчет итогов заказа.
- `constants.ts` - цены, коэффициенты и подписи.
- `types.ts` - типы изделий, параметры, заказ, архив, статусы.
- `screens/CalcScreen.tsx` - UI-матрица доступных параметров по типу изделия.
- `screens/CartScreen.tsx` - отображение итогов, монтаж, доставка, скидка, оплата.

### Типы изделий

`ProductType` в `types.ts` содержит:

- `FRAME` - рамочные;
- `WING` - крыло;
- `DOOR` - дверные;
- `ROLL` - рулонные;
- `PLISSE_NET` - плиссе-сетки;
- `JALOUSIE_CLASSIC` - шторы плиссе Портал;
- `JALOUSIE_LIGHT` - шторы плиссе Лайт;
- `JALOUSIE_COZY` - шторы плиссе Уют+;
- `INSIDE_INSERT` - внутривставные;
- `SEAL` - уплотнительная резинка;
- `COMB` - гребенка;
- `CHILD_LOCK` - детский замок;
- `ADJUSTMENT` - регулировка.

### Расчетные движки

В `logic/calculations.ts` есть несколько изолированных расчетных блоков:

- `ClassicEngine` - рамочные, крыло, внутривставные, дверные.
- `PlisseNetEngine` - плиссе-сетки.
- `BlindsEngine` - шторы плиссе Портал, Лайт, Уют+.
- `RollEngine` - рулонные сетки.
- `MaintenanceEngine` - оконные услуги.

Главная функция:

```ts
calculatePrice(...)
```

Она принимает тип изделия, размеры, цвет, полотно/ткань, параметры плиссе, количество, услугу, крепеж, фурнитуру, прайс и возвращает:

```ts
{ total: number; install: number }
```

Цены округляются через:

```ts
roundToTens(value)
```

### Где хранятся цены

Источник по умолчанию:

- `constants.ts` -> `PRICES`.

Основные группы в `PRICES.price_settings`:

- `global_markups`;
- `classic_frames`;
- `plisse_nets`;
- `plisse_blinds`;
- `window_works`;
- `roll_nets`;
- `logistics`.

Облачный прайс:

- Firestore document `config/prices`;
- загружается через `onSnapshot` в `App.tsx`;
- кэшируется в `localStorage` ключом `measurer_prices`;
- редактируется через `AdminScreen`.

### Итог заказа

`logic/orderTotals.ts` -> `calculateOrderTotals(order, prices)`.

Итог учитывает:

- сумму позиций;
- стоимость замера;
- монтаж;
- доставку;
- скидку 0 / 5 / 10%;
- наценку оплаты QR/картой;
- финальный `grandTotal`.

Возвращаемые поля:

- `itemsBasePrice`;
- `productCount`;
- `measurementFee`;
- `includeMeasurementFee`;
- `measurementPaidCash`;
- `itemsTotalWithFee`;
- `installTotal`;
- `deliveryCost`;
- `subtotalBeforeDiscount`;
- `discountPercent`;
- `discountAmount`;
- `subtotalAfterDiscount`;
- `paymentMethod`;
- `paymentSurcharge`;
- `grandTotal`.

## 7. Сущности, типы и статусы

### `CartItem`

Позиция заказа. Основные поля:

- `id`;
- `type`;
- `width`;
- `height`;
- `quantity`;
- `color`;
- `mesh`;
- `mount`;
- `cornerType`;
- `handleType`;
- `frameProfile`;
- `opening`;
- `threshold`;
- `handles`;
- `price`;
- `installPrice`;
- `details`;
- `comment`;
- `subType`;
- `doorProfile`;
- `hingesCount`;
- `hasLatch`;
- `hasBolt`.

### `CustomerInfo`

Данные клиента:

- `name`;
- `phone`;
- `address`.

### `OrderState`

Черновик заказа:

- `items`;
- `deliveryType`: `city`, `out`, `pickup`;
- `deliveryKm`;
- `globalInstall`;
- `installOverride`;
- `orderDiscountPercent`;
- `includeMeasurementFee`;
- `paymentMethod`;
- `generalComment`;
- `customer`.

### `ArchivedOrder`

Сохраненный замер:

- все поля `OrderState`;
- `archiveId`;
- `date`;
- `workStatus`;
- `workStatusLabel`;
- `workStatusUpdatedAt`;
- `syncToken`;
- `firestoreId`;
- `hasPendingWrites`;
- `syncStatus`;
- `syncError`.

### `UpcomingMeasurement`

Заявка на замер:

- `id`;
- `address`;
- `apartment`;
- `customerName`;
- `phone`;
- `comment`;
- `price`;
- `payerType`;
- `time`;
- `coordinates`.

### Статусы заказа в работу

`OrderWorkStatus`:

- `waiting` - «В ожидании»;
- `in_production` - «В производстве»;
- `ready` - «Готов к монтажу».

В текущем коде:

- при сохранении замера статус по умолчанию `waiting`;
- после отправки в работу через `ArchiveScreen` статус становится `in_production`;
- статус `ready` типизирован и отображается, но место, где приложение само выставляет `ready`, не найдено.

### Статусы локальной очереди синхронизации

`OutboxStatus` в `App.tsx`:

- `pending`;
- `syncing`;
- `synced`;
- `error`.

Операции очереди:

- `upsert`;
- `delete`.

## 8. Работа с заказами и заявками

### Где создается заказ

Позиции создаются в `CalcScreen`:

- пользователь вводит параметры;
- вызывается `calculatePrice`;
- формируется `CartItem`;
- `onAddToCart(item)` передает позицию в `App.tsx`.

Текущий заказ хранится в `App.tsx` как `OrderState`.

### Где хранится черновик

`App.tsx` сохраняет черновик при каждом изменении:

- `localStorage` key: `measurer_current_order`.

Контекст редактирования архивного заказа:

- `measurer_current_order_editing_archive_id`;
- `measurer_current_order_editing_archive_date`.

### Где сохраняется архив

Сохранение запускается из `CartScreen` через `onSaveToArchive`, реализация в `App.tsx`:

- создается или переиспользуется `archiveId`;
- добавляются `date`, `syncToken`, `workStatus`;
- объект очищается от `undefined`;
- запись сначала попадает в localStorage outbox;
- затем отправляется в Firestore `measurements/{archiveId}`;
- черновик очищается;
- UI возвращается в меню или архив.

Локальная очередь:

- `localStorage` key: `measurer_pending_archive_orders`.

### Как обновляется статус

В `ArchiveScreen.handleSendToManager`:

- пользователь нажимает «Отправить в работу»;
- выбирает, оплачен ли замер наличными;
- формируется payload;
- выполняется POST в Google Apps Script;
- Firestore `measurements/{archiveId}` обновляется:
  - `workStatus: in_production`;
  - `workStatusLabel`;
  - `workStatusUpdatedAt`.

### Как удаляется заказ

В `App.tsx`:

- `deleteFromArchive(id)` находит архивный заказ;
- если заказ уже был в Firestore, в outbox добавляется операция `delete`;
- синхронизация вызывает `deleteDoc(doc(db, 'measurements', archiveId))`.

## 9. Работа с базой, backend и API

### Firestore

Используемые коллекции и документы:

| Коллекция / документ | Где используется | Назначение |
|---|---|---|
| `measurements` | `App.tsx`, `ArchiveScreen.tsx`, `InstallationScreen.tsx` | Архив замеров и статусы работы |
| `config/prices` | `App.tsx`, `AdminScreen.tsx` | Облачный прайс |
| `upcoming_measurements` | `UpcomingScreen.tsx`, `CartScreen.tsx` | Входящие заявки на замер |
| `ready_orders` | `InstallationScreen.tsx` | Заказы, готовые к монтажу |

### Поля `measurements`

Документы содержат `ArchivedOrder`:

- `archiveId`;
- `date`;
- `items`;
- `customer`;
- `deliveryType`;
- `deliveryKm`;
- `globalInstall`;
- `installOverride`;
- `includeMeasurementFee`;
- `paymentMethod`;
- `orderDiscountPercent`;
- `generalComment`;
- `workStatus`;
- `workStatusLabel`;
- `workStatusUpdatedAt`;
- `syncToken`.

### Поля `upcoming_measurements`

Полевая схема гибкая. Нормализация через `DATABASE_MAPPING`:

- адрес: `address`, `адрес`, `объект`, `A`;
- имя клиента: `name`, `клиент`, `customer`, `B`;
- телефон: `phone`, `телефон`, `tel`, `C`;
- комментарий: `comment`, `заметка`, `managerComment`, `D`;
- цена: `amount_rub`, `E`, `цена`, `сумма`;
- кто платит: `payer_text`, `F`, `платит`, `кто платит`;
- квартира: `apt`, `flat`, `кв`, `квартира`;
- время: `time`, `время`, `замер на`;
- координаты: `lat`, `lon` / `long`.

### Поля `ready_orders`

`InstallationScreen.tsx` читает документы гибко, поддерживая разные имена полей:

- имя клиента;
- телефон;
- адрес;
- состав заказа;
- итоговая сумма;
- сервисный доход;
- исходный `orderId` / `archiveId`;
- флаг включения замера;
- флаг оплаты замера наличными.

Точная внешняя схема источника `ready_orders` в репозитории не найдена.

### Firestore rules

`firestore.rules` сейчас разрешает чтение и запись всем:

```text
allow read, write: if true;
```

Это критичный security-риск для дилерского кабинета.

### Firebase Cloud Functions

`functions/src/index.ts`:

- `sendOrderToManager`
  - callable function;
  - принимает `{ text: string }`;
  - отправляет email менеджеру через Gmail/nodemailer;
  - секреты берутся из Functions config или env.

- `sendVkOrderReport`
  - callable function;
  - принимает `{ text: string }`;
  - делит длинный текст на части;
  - отправляет сообщения через VK API;
  - секреты берутся из Functions config или env.

Проверка Firebase Auth в callable-функциях не найдена.

### Google Apps Script / Google Sheets

`ArchiveScreen.tsx` отправляет заказ в работу через Google Apps Script Web App:

- метод `POST`;
- `mode: no-cors`;
- `Content-Type: text/plain;charset=utf-8`;
- body: JSON с заказом.

Payload:

- `orderID`;
- `customer`;
- `items`;
- `deliveryCost`;
- `totalInstallCost`;
- `total`;
- `generalComment`.

Полный webhook URL не раскрывается. Код Google Apps Script в репозитории не найден.

### Yandex STT

`CartScreen.tsx` использует голосовой ввод комментария:

- запись через browser media APIs;
- отправка PCM-аудио на `/api/yandex-stt/...`;
- env-переменные:
  - `VITE_YANDEX_API_KEY`;
  - `VITE_YANDEX_FOLDER_ID`;
  - `VITE_API_BASE` для APK/backend proxy.

Значения переменных не раскрываются.

### Tochka API

`lib/tochkaApi.ts` создает динамический QR СБП.

Env-переменные:

- `VITE_TOCHKA_API_URL`;
- `VITE_TOCHKA_JWT_TOKEN`;
- `VITE_TOCHKA_MERCHANT_ID`;
- `VITE_TOCHKA_ACCOUNT_ID`;
- `VITE_TOCHKA_QRC_TYPE`;
- `VITE_TOCHKA_GET_QR_URL_BASE`.

Используется в `InstallationScreen.tsx`. Значения переменных и банковские реквизиты не раскрываются.

### Экспорт и отправка отчетов

Файлы:

- `lib/formatOrderForManager.ts` - форматирует заказ в plain text;
- `lib/txtExport.ts` - сохраняет `.txt` через Web Share API или download;
- `lib/emailExport.ts` - вызывает Firebase Function `sendOrderToManager`;
- `lib/vkManager.ts` - вызывает Firebase Function `sendVkOrderReport`;
- `lib/phone.ts` - нормализация телефона РФ.

Часть этих экспортных функций выглядит как задел: не все они импортируются активными экранами.

## 10. Авторизация и роли

### Что есть сейчас

Полноценной авторизации пользователей не найдено:

- Firebase Authentication не используется;
- `signIn` / `onAuthStateChanged` не найдены;
- роли пользователя не проверяются;
- Cloud Functions не проверяют `context.auth`;
- Firestore rules открыты на чтение и запись.

### Админка

Доступ в `AdminScreen` закрыт только модальным вводом пароля в `App.tsx`. Это клиентская UI-защита, а не backend-авторизация.

Значение пароля в обзор не включается.

### Роли

Роли `замерщик`, `менеджер`, `админ`, `дилер` как отдельные сущности не реализованы.

Фактически есть только:

- обычный пользователь приложения;
- пользователь, который знает пароль от UI-админки.

Для дилерского кабинета текущая модель доступа непригодна без переработки.

## 11. Что можно переиспользовать для дилерского кабинета

### Расчеты и типы

Можно переиспользовать:

- `logic/calculations.ts` как ядро расчета изделий;
- `logic/orderTotals.ts` как основу расчета итогов заказа, если адаптировать правила дилера;
- `types.ts` как стартовый контракт типов изделий, цветов, полотен и заказа;
- `constants.ts` как структуру прайса и справочники подписей.

Что нужно изменить:

- отделить розничный прайс от дилерского;
- добавить дилерские уровни цен, скидки или закупочные цены;
- исключить или параметризовать розничные коэффициенты;
- вынести расчет в backend или shared package, чтобы дилер не мог подменить цены на клиенте.

### UI-компоненты и экраны

Можно взять как основу:

- каталог изделий из `HomeScreen.tsx`;
- форму расчета позиции из `CalcScreen.tsx`;
- корзину и итог из `CartScreen.tsx`;
- отображение состава заказа из `ArchiveScreen.tsx`;
- иконки карты/маршрута из `components/`;
- мобильную верстку и PWA/Capacitor-подход.

Что нужно переделать:

- заменить сценарий замерщика на сценарий дилера;
- убрать заявки на замер как основной вход;
- заменить архив замеров на историю расчетов/заказов дилера;
- добавить личный кабинет, профиль компании и реквизиты дилера;
- добавить статусы дилерского заказа;
- добавить КП/PDF;
- добавить серверную авторизацию и изоляцию данных.

### Данные и таблицы

Можно использовать как ориентир:

- `measurements` как прототип сохраненного расчета/заказа;
- `config/prices` как прототип централизованного прайса;
- `ready_orders` как прототип статусов производства/монтажа;
- `DATABASE_MAPPING` как пример адаптера к гибким внешним таблицам.

Для дилерского кабинета нужны новые коллекции:

- `dealers`;
- `dealer_users`;
- `dealer_quotes`;
- `dealer_orders`;
- `dealer_price_tiers`;
- `dealer_documents`;
- `dealer_order_events`;
- `dealer_notifications`.

## 12. Что нужно добавить для дилерского кабинета

### Регистрация дилера

Нужно:

- заявка на регистрацию;
- данные компании;
- ИНН/контакты/город;
- проверка менеджером;
- статус дилера: новый, на проверке, активен, заблокирован.

### Личный кабинет дилера

Нужно:

- профиль дилера;
- пользователи дилера;
- адреса доставки;
- реквизиты;
- условия работы;
- персональный прайс или скидка.

### Расчет изделий

Нужно:

- адаптировать `CalcScreen` под дилера;
- показать дилерскую цену, розничную цену и маржу при необходимости;
- сохранять расчет как КП или черновик;
- заблокировать изменение внутренних коэффициентов.

### Сохранение расчетов

Нужно:

- список расчетов дилера;
- черновики;
- версии расчета;
- комментарии дилера и менеджера;
- повторный заказ из старого расчета.

### Экспорт КП/PDF

Нужно:

- генерация коммерческого предложения;
- PDF;
- логотип и реквизиты дилера или производителя;
- настройка видимости закупочных/розничных цен.

### Запуск заказа в работу

Нужно:

- кнопка «Оформить заказ»;
- проверка обязательных данных;
- подтверждение условий;
- загрузка файлов/замеров/комментариев;
- создание производственного заказа.

### Статусы выполнения

Нужно:

- `draft`;
- `submitted`;
- `manager_review`;
- `invoice_issued`;
- `paid`;
- `in_production`;
- `ready`;
- `shipped`;
- `completed`;
- `cancelled`.

Также нужна история событий по заказу.

### Mobile / PWA

Можно использовать:

- текущую мобильную layout-логику;
- PWA manifest;
- Capacitor Android-сборку.

Нужно добавить:

- web-first дилерский кабинет;
- адаптив для desktop;
- push/email/telegram-уведомления;
- офлайн-режим только там, где он действительно нужен.

### Админка управления дилерами

Нужно:

- список дилеров;
- модерация заявок;
- назначение прайс-листа;
- блокировка доступа;
- просмотр заказов дилера;
- изменение статусов;
- аудит действий;
- управление пользователями и ролями.

## 13. Архитектурные и security-риски

### Открытые Firestore rules

Сейчас в `firestore.rules` разрешены любые чтение и запись. Для дилерского кабинета это критично:

- дилеры смогут видеть чужие данные;
- можно изменить прайс;
- можно удалить заказы;
- можно подменить статусы.

Нужно внедрить Firebase Auth и правила по `dealerId`, ролям и ownership.

### Нет настоящей авторизации

Клиентский пароль админки не защищает данные. Для дилерского кабинета нужны:

- Firebase Auth или другой auth provider;
- custom claims;
- роли;
- серверные проверки;
- защищенные Cloud Functions/API.

### Расчеты только на фронтенде

Формулы и цены доступны в frontend bundle. Для внутреннего калькулятора это допустимо, но для дилеров рискованно:

- можно увидеть внутренние коэффициенты;
- можно подменить расчет;
- нельзя доверять цене, пришедшей с клиента.

Нужно считать финальные цены на backend или перепроверять заказ сервером.

### Секреты и интеграции на клиенте

Некоторые интеграции используют `VITE_*` env-переменные, которые попадают в клиентскую сборку. Для дилерского кабинета:

- банковские JWT;
- API-ключи;
- webhook URL;
- любые приватные токены

должны быть только на backend.

### Google Apps Script `no-cors`

Отправка заказа в работу идет через `fetch(..., mode: 'no-cors')`. Клиент не видит реальный результат запроса. Риски:

- невозможно надежно понять, дошел ли заказ;
- сложнее повторять отправку;
- нет нормальной обработки ошибок;
- webhook URL зашит в клиент.

Для дилеров нужен нормальный backend endpoint с авторизацией, логированием и retry.

### Монолитный `App.tsx`

В `App.tsx` сосредоточены:

- навигация;
- глобальный state;
- localStorage;
- Firestore sync;
- outbox;
- сохранение заказов;
- админский доступ.

Для роста проекта лучше разделить:

- routing;
- state management;
- repositories/API;
- auth;
- pricing service;
- order service;
- sync/outbox service.

### Смешение сценариев

В проекте есть:

- замерщик;
- архив;
- заявки;
- админка прайса;
- экран монтажника;
- интеграции с менеджером;
- аналитические dealer scripts.

Для дилерского кабинета нужно отделить продуктовые контуры, иначе будет сложно поддерживать роли, статусы и права.

### Нет tenant isolation

В текущих сущностях нет обязательного `dealerId` / `organizationId`. Для дилеров нужно добавлять tenant boundary во все данные:

- пользователи;
- расчеты;
- заказы;
- документы;
- события;
- цены.

### Статусы неполные

Текущий `OrderWorkStatus` покрывает только:

- ожидание;
- производство;
- готов к монтажу.

Для дилерского заказа этого мало. Нужны отдельные статусы согласования, оплаты, производства, отгрузки и закрытия.

### Не найден полноценный API слой

Большая часть работы с Firestore выполняется прямо из компонентов. Для дилерского кабинета лучше иметь:

- backend API;
- Cloud Functions с проверками;
- отдельный слой repositories/services;
- DTO и валидацию.

## 14. Краткий вывод

Текущий проект - хороший прототип и рабочая база для внутреннего калькулятора замерщика. В нем уже есть:

- матрица изделий;
- расчетные формулы;
- прайс;
- корзина;
- сохранение заказов;
- облачный архив;
- офлайн-черновик и outbox;
- интеграции с Firestore, Google Apps Script, Yandex STT, VK, email и Tochka QR.

Для дилерского кабинета лучше переиспользовать расчетное ядро, типы, структуру прайса и часть мобильного UI, но не копировать текущую архитектуру безопасности. Главные обязательные доработки: авторизация, роли, изоляция данных по дилеру, серверная проверка расчетов, дилерские цены, нормальный backend/API и отдельная модель заказов дилера.
