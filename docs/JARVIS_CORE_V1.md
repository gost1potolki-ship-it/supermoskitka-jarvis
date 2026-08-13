# SuperMoskitka Jarvis Core V1

**Статус:** рабочая спецификация для начала реализации  
**Дата:** 12.08.2026  
**Цель:** собрать первое рабочее ядро ИИ-менеджера SuperMoskitka, а не пытаться одновременно построить всю CRM, производство, склад и дилерский кабинет.

---

## 1. Что строим в V1

Jarvis Core V1 — единое серверное AI-ядро, которое:

1. принимает сообщения клиентов из подключенных каналов;
2. ведет обычный клиентский диалог как менеджер по продажам;
3. знает ассортимент, ограничения, сценарии и правила SuperMoskitka;
4. вызывает существующий Calculation Engine вместо самостоятельного вычисления цен моделью;
5. хранит структурированное текущее понимание клиента и его заказа;
6. замечает изменения параметров внутри длинной переписки;
7. читает CRM/Firestore и сверяет данные заказа с перепиской;
8. сигнализирует директору о найденных расхождениях и зависших процессах;
9. передает диалог человеку по прямой просьбе клиента или при сложной/неуверенной ситуации;
10. после ручного перехвата полностью прекращает отвечать клиенту до явного возврата диалога ИИ;
11. формирует закрытые периодические отчеты директору.

**Ключевой принцип V1:** Jarvis — правая рука директора и основной AI-менеджер, но **не получает права самостоятельно менять CRM**.

---

## 2. Что сознательно НЕ входит в V1

### 2.1 Preliminary qualification (Task 11)

- Jarvis может назвать **предварительную цену под ключ** через `PRELIMINARY_ALL_IN` и Calculation Engine.
- Для FRAME/WING без размеров расчёт использует средний типовой размер **800×1600** только внутри движка; в Order Memory размеры клиента **не подменяются**.
- Согласие на цену (`preliminaryPriceAccepted`) и согласие на замер (`measurementAgreed`) — **разные факты**.
- После расчёта сохраняется `PreliminaryQuoteSnapshot` (публичная сумма + fingerprint + `quoteTrustStatus: TRUSTED_LEGACY_CALCULATION`); себестоимость и маржа клиенту и LLM **не раскрываются**.
- Task 11.1 / 11.1.1: **два каталога** — Legacy Selling (единственный источник цены клиенту) и Actual Cost (внутренняя аналитика прибыли FRAME). 50% GREEN / 47% YELLOW-floor — только индикаторы; psychological pricing не активен. Incomplete actual cost **не блокирует** quote. См. `docs/PRICING_ARCHITECTURE.md`.

### 2.2 Exterior color trust

Канонические цвета профиля (см. §6): `WHITE`, `BROWN_8017`, `GRAY_7016`, `CUSTOM_RAL`.

```text
WHITE != GRAY_7016
```

Изменение `profileColor: WHITE → GRAY_7016` — смена цвета клиентом, не эквивалентность значений.

### 2.3 Measurement automation boundary

- Политика по умолчанию: `AUTO_WHEN_READY` → внутреннее решение `AUTO_ALLOWED` при `READY_FOR_MEASUREMENT`.
- **`AUTO_ALLOWED` ≠ запись в CRM.** Jarvis V1 не пишет в `measurements`, `ready_orders` и другие операционные коллекции.

На первом этапе не разрабатываем как основную задачу:

- новый производственный CRM;
- складской модуль;
- оптимизатор раскроя профиля и покраски;
- полноценный дилерский кабинет;
- автоматическое изменение CRM Джарвисом;
- сложное управление гарантийными кейсами;
- глубокую аналитику и BI;
- все каналы одновременно;
- голосовую телефонию;
- самостоятельное изменение базы знаний без подтверждения владельца;
- автоматические советы директору по каждому зависшему заказу;
- микростатусы и сложные workflow, которые не нужны для первой рабочей версии.

Все уже согласованные требования по этим направлениям сохраняются для следующих этапов.

---

## 3. Исходная система, которую не ломаем

Текущее приложение замерщиков уже содержит:

- React + TypeScript + Vite;
- Capacitor/PWA;
- Firestore;
- Firebase Cloud Functions;
- коллекции и данные по замерам/заказам;
- централизованный прайс в Firestore;
- существующие расчетные модули;
- отправку заказа в Google Sheets;
- существующий мобильный процесс замерщика.

### Решение для V1

- **Firestore остается текущим источником операционных данных, которые читает Jarvis.**
- Существующее приложение замерщиков не переписывается ради запуска ИИ-менеджера.
- Google Sheets пока остается частью производственного процесса.
- Jarvis запускается отдельным backend-приложением на Timeweb Cloud.
- Доступ Jarvis к CRM на первом этапе — только необходимое чтение.

В дальнейшем можно привести lifecycle заказа к одному каноническому документу Firestore, но это не должно блокировать запуск Jarvis V1.

---

## 4. Целевая архитектура V1

```text
External / Internal caller
        │
        ▼
┌──────────────────────┐
│ Internal HTTP API    │  /internal/v1 + public /health
│ (auth + DTO mapping) │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Application Layer    │  JarvisApplication use cases
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│     JARVIS CORE      │
│ Orchestrator/Memory  │
│ Knowledge/Tools/LLM  │
│ Readiness / Quote    │
└──────────────────────┘

CRM write permission = NOT IMPLEMENTED
Measurement submission executor = NOT IMPLEMENTED
```

Каналы и CRM:

```text
                           ┌─────────────────────┐
                           │  Telegram client    │
                           └─────────┬───────────┘
                                     │
                           ┌─────────▼───────────┐
                           │  Website chat       │
                           └─────────┬───────────┘
                                     │
                                     ▼
                     ┌────────────────────────────┐
                     │       CHANNEL GATEWAY      │
                     │ normalize inbound/outbound │
                     └──────────────┬─────────────┘
                                    │
                                    ▼
                     ┌────────────────────────────┐
                     │ Internal HTTP / Application│
                     │        → Jarvis Core       │
                     │ Dialogue Orchestrator      │
                     │ Order Memory               │
                     │ Knowledge / Rules          │
                     │ Change Detector            │
                     │ CRM Watcher (read-only)    │
                     │ Human Handoff              │
                     │ Director Alerts            │
                     └──────┬────────┬────────────┘
                            │        │
                 ┌──────────▼──┐  ┌──▼──────────────┐
                 │ LLM adapter │  │ Calculation     │
                 │ provider API│  │ Engine          │
                 └─────────────┘  └─────────────────┘
                            │
                  ┌─────────▼────────┐
                  │ Firestore / CRM  │
                  │ read-only for AI │
                  └──────────────────┘

                     ┌────────────────────────────┐
                     │ Director private channel   │
                     │ alerts + reports + Q&A     │
                     └────────────────────────────┘
```

См. также `docs/APPLICATION_API.md`.

### Где живет система

**Timeweb Cloud:**
- Jarvis backend;
- API endpoints/webhooks каналов;
- фоновые задачи и отчеты;
- LLM provider adapter;
- оркестрация диалогов.

**Firebase / Firestore:**
- существующие данные заявок, замеров, заказов и прайса;
- на V1 Jarvis читает необходимые данные и сверяет их со своей памятью.

**LLM:**
- подключается через отдельный `LlmProvider` interface;
- конкретную модель можно менять без переписывания бизнес-логики Jarvis.

---

## 5. Рекомендуемая структура отдельного проекта Jarvis

```text
supermoskitka-jarvis/
├── src/
│   ├── app/
│   │   ├── server.ts
│   │   └── config.ts
│   │
│   ├── channels/
│   │   ├── types.ts
│   │   ├── telegram/
│   │   │   ├── telegram.adapter.ts
│   │   │   └── telegram.webhook.ts
│   │   └── website/
│   │       ├── website.adapter.ts
│   │       └── website.webhook.ts
│   │
│   ├── jarvis/
│   │   ├── orchestrator.ts
│   │   ├── conversation.service.ts
│   │   ├── order-memory.service.ts
│   │   ├── change-detector.service.ts
│   │   ├── conflict-detector.service.ts
│   │   ├── handoff.service.ts
│   │   ├── director-alerts.service.ts
│   │   └── report.service.ts
│   │
│   ├── llm/
│   │   ├── llm.provider.ts
│   │   └── providers/
│   │
│   ├── knowledge/
│   │   ├── knowledge.service.ts
│   │   ├── rules/
│   │   └── prompts/
│   │
│   ├── calculation/
│   │   ├── calculation.adapter.ts
│   │   └── calculation.types.ts
│   │
│   ├── crm/
│   │   ├── crm.read.repository.ts
│   │   ├── firestore.repository.ts
│   │   └── crm.types.ts
│   │
│   ├── storage/
│   │   ├── conversation.repository.ts
│   │   ├── memory.repository.ts
│   │   └── audit.repository.ts
│   │
│   ├── domain/
│   │   ├── customer.ts
│   │   ├── conversation.ts
│   │   ├── order-memory.ts
│   │   ├── order-item.ts
│   │   ├── conflict.ts
│   │   └── event.ts
│   │
│   └── jobs/
│       ├── stalled-orders.job.ts
│       └── director-report.job.ts
│
├── tests/
│   ├── dialogue/
│   ├── conflicts/
│   └── regression/
│
├── docs/
│   ├── JARVIS_CORE_V1.md
│   ├── KNOWLEDGE_SCHEMA.md
│   ├── ORDER_MEMORY_SCHEMA.md
│   └── TEST_CASES.md
│
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

**Важно:** это отдельный backend-проект. Не надо встраивать Jarvis внутрь мобильного `supermoskitka-app`.

---

## 6. Главный объект V1 — Order Memory

История чата сама по себе недостаточна. Jarvis должен поддерживать отдельное структурированное представление того, что сейчас известно о клиенте и заказе.

### Базовая схема

```ts
export interface JarvisOrderMemory {
  conversationId: string;
  customer?: {
    name?: string;
    phone?: string;
    address?: string;
    district?: string;
    customerType?: 'retail' | 'dealer' | 'corporate' | 'unknown';
  };

  intent?: {
    goal?: 'estimate' | 'measurement' | 'order' | 'pickup' | 'question' | 'complaint';
    summary?: string;
  };

  items: JarvisOrderItem[];

  commercial?: {
    preliminaryTotal?: number;
    finalTotal?: number;
    measurementDeposit?: number;
    paymentMethod?: string;
    agreed?: boolean;
  };

  process?: {
    measurementRequested?: boolean;
    crmOrderId?: string;
    inProduction?: boolean;
    ready?: boolean;
    installed?: boolean;
    humanOwnedConversation?: boolean;
  };

  unresolved: JarvisUnresolvedField[];
  conflicts: JarvisConflict[];

  updatedAt: string;
}
```

### Позиция заказа

```ts
export interface JarvisOrderItem {
  localItemId: string;
  quantity?: number;
  productType?: string;
  widthMm?: number;
  heightMm?: number;
  dimensionsSource?: 'client' | 'dealer' | 'measurer' | 'estimated';
  mesh?: string;
  profile?: string;
  profileColor?: string;
  ral?: string;
  finish?: string; // муар / матовый / глянец и т.п.
  fastening?: string;
  opening?: string;
  threshold?: string;
  comment?: string;

  sources: FieldSource[];
}
```

### Канонические цвета профиля (постоянное правило)

```text
WHITE
= Белый

BROWN_8017
= Коричневый
= RAL 8017
= 8017

GRAY_7016
= Серый
= Антрацит
= RAL 7016
= 7016

CUSTOM_RAL
= любой другой явно указанный RAL
```

Критический invariant:

```text
WHITE != GRAY_7016
```

Пример изменения `profileColor: WHITE → GRAY_7016` и `ral: — → 7016` означает, что клиент сменил цвет с белого на серый RAL 7016 — **не** то, что WHITE и GRAY_7016 это одно и то же.

---

## 7. Источник каждого факта обязателен

Для критичных полей Jarvis должен знать не только значение, но и откуда оно взялось.

```ts
export interface FieldSource {
  field: string;
  value: unknown;
  sourceType: 'message' | 'crm' | 'calculation' | 'manager';
  sourceId: string;
  channel?: string;
  timestamp: string;
  author?: 'customer' | 'jarvis' | 'manager' | 'measurer' | 'system';
}
```

Это позволяет доказуемо определить:

- что клиент сначала заказал;
- что изменил позже;
- что записано в CRM;
- где появилось расхождение.

---

## 8. Change Detector — обязательная функция V1

Каждое новое клиентское сообщение анализируется на наличие производственно значимых фактов.

### Поля, изменения которых отслеживаются минимум

- количество;
- размеры;
- тип изделия;
- полотно;
- профиль;
- цвет;
- RAL;
- фактура/покрытие: муар, матовый, глянец;
- крепления;
- открывание;
- порог;
- монтаж/самовывоз;
- адрес;
- другие параметры, которые влияют на изготовление или цену.

### Логика

```text
новое сообщение
      ↓
извлечь факты
      ↓
сравнить с Order Memory
      ↓
нет изменений → обновить контекст
      ↓
есть изменение → создать ChangeEvent
      ↓
если параметр производственный → проверить CRM
      ↓
если расходится → создать Conflict + alert директору
```

### Пример 1

Было:

```text
позиция 2 → профиль коричневый
```

CRM:

```text
позиция 2 → профиль белый
```

Результат:

```text
⚠️ Расхождение заказа
Позиция 2: в сообщении дилера указан коричневый профиль,
в CRM — белый.
```

### Пример 2

Было:

```text
RAL 8028 / муар
```

Позже клиент пишет:

```text
RAL 8028 / глянец
```

Результат:

```text
⚠️ Изменение параметра
Покрытие изменено: муар → глянец.
Текущая CRM/ранее согласованные данные требуют проверки.
```

На V1 Jarvis **не исправляет CRM автоматически**.

---

## 9. CRM Watcher V1

### Права

Jarvis получает минимально необходимые серверные credentials и доступ только к чтению тех коллекций/полей, которые нужны для:

- поиска заявки/заказа;
- проверки статуса;
- сверки позиций;
- контроля зависания;
- подготовки директорского отчета.

### Запрещено V1

- менять параметры заказа;
- менять техническое задание;
- менять статус производства;
- удалять заказ;
- менять цену;
- подтверждать оплату;
- выполнять действия от имени директора.

### Интерфейс репозитория

```ts
export interface CrmReadRepository {
  findOrderById(orderId: string): Promise<CrmOrder | null>;
  findOrderByPhone(phone: string): Promise<CrmOrder[]>;
  findOrderByConversationLink(conversationId: string): Promise<CrmOrder | null>;
  listOpenMeasurements(): Promise<CrmMeasurement[]>;
  listActiveOrders(): Promise<CrmOrder[]>;
}
```

---

## 10. Calculation Engine

LLM не рассчитывает цену «из головы».

### V1 правило

Все детерминированные расчеты проходят через существующий расчетный код SuperMoskitka.

Текущий проект уже имеет:

- `logic/calculations.ts`;
- `logic/orderTotals.ts`;
- прайс в `config/prices`.

### Целевой интерфейс

```ts
export interface CalculationRequest {
  customerType: 'retail' | 'dealer' | 'corporate';
  items: CalculationItemInput[];
  delivery?: DeliveryInput;
  installation?: InstallationInput;
  measurement?: MeasurementInput;
  discount?: DiscountInput;
}

export interface CalculationResult {
  items: CalculationItemResult[];
  total: number;
  warnings: string[];
  missingFields: string[];
  calculationVersion: string;
}
```

### Важное ограничение

Если для изделия формула еще не утверждена, Jarvis не придумывает цену. Он сообщает, что нужен человек/точный расчет.

---

## 11. Knowledge Base V1

Не складывать всю систему в один гигантский prompt.

### Разделы базы знаний

```text
knowledge/
├── products/
│   ├── frame.md
│   ├── wing.md
│   ├── door.md
│   ├── plisse.md
│   ├── duo.md
│   ├── portal.md
│   └── uyut-plus.md
│
├── sales/
│   ├── dialogue-style.md
│   ├── measurement-flow.md
│   ├── one-two-frame-screens.md
│   ├── areas.md
│   └── lead-qualification.md
│
├── technical/
│   ├── meshes.md
│   ├── colors.md
│   ├── fasteners.md
│   └── limitations.md
│
├── operations/
│   ├── lead-times.md
│   ├── pickup.md
│   ├── payment.md
│   └── warranty.md
│
└── media/
    └── media-index.json
```

### Правило изменения знаний

- владелец может править правила без изменения программного кода;
- Jarvis может предлагать новые правила по реальным диалогам;
- сам применять новую рабочую политику без подтверждения владельца не должен.

---

## 12. Базовый клиентский сценарий продаж V1

Jarvis должен стремиться к короткому естественному диалогу, а не к анкете.

### Общая последовательность

1. понять, что хочет клиент;
2. получить адрес, если он нужен для выезда/оценки;
3. определить допустимость района;
4. понять тип изделия и количество;
5. уточнить только необходимые параметры;
6. использовать Calculation Engine;
7. назвать предварительную стоимость «под ключ» там, где это применимо;
8. объяснить, что окончательная цена уточняется после замера;
9. если стоимость устраивает — довести до заявки на замер;
10. при нестандартной ситуации — передать человеку.

### Микроправила общения

- обращение на «Вы»;
- короткие человеческие сообщения;
- не задавать длинный список вопросов;
- обычно не более 1–2 уточнений за этап;
- не повторять уже известное;
- не комментировать внутренние действия вроде «сейчас считаю»;
- не раскрывать внутренние коэффициенты и маржу;
- не обещать то, чего система не знает;
- если ошибся — коротко признать и исправить;
- если пользователь просит человека — немедленно передать диалог.

---

## 13. Human Handoff

### Обязательные триггеры V1

1. клиент прямо просит человека/менеджера/директора;
2. Jarvis не уверен в ответе;
3. вопрос выходит за известные правила/полномочия;
4. расчет требует неподдерживаемой формулы;
5. возникает значимый конфликт, который требует решения человека.

Список расширяется после реального тестирования.

### После перехвата человеком

```ts
conversation.owner = 'human';
```

Пока `owner === 'human'`:

- Jarvis не отправляет клиенту никаких сообщений;
- не дополняет человека;
- не пытается отвечать параллельно;
- сохраняет входящие сообщения в историю;
- может продолжать технический мониторинг для внутреннего контура, но не вмешивается в клиентский чат.

Возврат AI — отдельное явное действие в будущем интерфейсе.

---

## 14. Закрытый канал директора

Jarvis должен иметь отдельный внутренний канал, недоступный клиенту.

### Событийные сообщения

Примеры того, что туда попадает:

- найдено расхождение переписка ↔ CRM;
- клиент изменил критичный параметр заказа;
- заявка создана/передана на замер;
- заказ поставлен в работу, если это событие доступно системе;
- заказ готов;
- требуется решение директора;
- зависший замер;
- зависший заказ.

### Не превращать канал в лог системы

Не отправлять директору каждое техническое событие.

Ценность канала — **ключевые точки и исключения**.

### Периодические сводки

Настройка частоты:

- один раз вечером;
- утром и вечером;
- несколько раз в течение дня.

Срочные конфликты приходят сразу и не ждут сводки.

### Базовый состав отчета

- новые заявки;
- новые/назначенные замеры;
- заказы, отправленные в работу;
- готовые заказы;
- найденные расхождения;
- изменения значимых параметров;
- ситуации, требующие решения директора;
- зависшие процессы.

---

## 15. Контроль зависаний

### Стартовые пороги V1

- замер без нормального движения более **3–4 дней** → вывести в контроль;
- заказ с момента запуска в производство более **7 дней** и еще не завершен → вывести в контроль.

Порог позже можно сделать настройкой.

Jarvis может показать вероятную причину, если она однозначно следует из данных:

- заявку никто не взял;
- заказ еще не отмечен готовым;
- готовый заказ долго не устанавливается;
- клиент не отвечает.

Если причина не доказана, формулировать как предположение.

**Jarvis не обязан автоматически советовать директору, что делать.**

---

## 16. Каналы запуска

### V1

Подключить только два клиентских канала:

1. Telegram;
2. чат на сайте SuperMoskitka.

Все каналы используют один `Jarvis Core`, одну память и одну базу знаний.

### Не делать

```text
telegram-bot-brain
website-bot-brain
whatsapp-bot-brain
```

### Делать

```text
Telegram adapter ─┐
Website adapter  ─┼─> Jarvis Core
Future adapters  ─┘
```

---

## 17. Identity Resolution — чтобы один клиент не стал пятью клиентами

V1 должен закладывать связку идентификаторов:

```ts
export interface CustomerIdentity {
  customerId: string;
  phone?: string;
  telegramUserId?: string;
  websiteVisitorId?: string;
  crmCustomerId?: string;
}
```

Главный надежный идентификатор для объединения — нормализованный телефон, когда он известен.

До подтвержденного объединения каналов система не должна самоуверенно склеивать разных людей.

---

## 18. Conversation State

Минимальные состояния:

```ts
type ConversationOwner = 'jarvis' | 'human';

type ConversationStage =
  | 'new'
  | 'qualifying'
  | 'calculating'
  | 'estimate_given'
  | 'measurement_offered'
  | 'measurement_requested'
  | 'active_order'
  | 'handoff';
```

Не надо превращать это в десятки CRM-микростатусов. Stage нужен Jarvis только для понимания следующего шага разговора.

---

## 19. LLM Orchestration

Модель получает не всю бесконечную переписку, а подготовленный контекст.

### Input Context

```text
SYSTEM POLICY
+ актуальные правила бизнеса
+ релевантные знания по изделию
+ Order Memory
+ последние N сообщений
+ результаты CRM read
+ результаты Calculation Engine
+ доступные действия
```

### Выход модели — строго структурированный

Рекомендуемый формат:

```ts
interface JarvisTurnDecision {
  replyText?: string;
  extractedFacts: ExtractedFact[];
  detectedChanges: DetectedChange[];
  requestedTools: ToolCall[];
  handoffRequired: boolean;
  handoffReason?: string;
  confidence: number;
}
```

Модель не должна напрямую писать в Firestore, Telegram API или Calculation Engine. Она возвращает решение оркестратору, а оркестратор решает, какие действия разрешены.

---

## 20. Tool boundary V1

Разрешенные инструменты Jarvis:

```text
read_crm_order
search_crm_by_phone
read_prices
calculate_order
lookup_knowledge
send_client_message
send_director_alert
handoff_to_human
```

Запрещенные инструменты V1:

```text
update_crm_order
change_production_status
delete_order
mark_payment
issue_discount_without_rule
```

Это фундаментальная граница безопасности V1.

---

## 21. Audit Log

Все значимые решения Jarvis нужно писать в технический аудит.

Минимум:

```ts
export interface JarvisAuditEvent {
  id: string;
  conversationId: string;
  type:
    | 'message_received'
    | 'message_sent'
    | 'fact_extracted'
    | 'order_change_detected'
    | 'crm_conflict_detected'
    | 'calculation_requested'
    | 'handoff'
    | 'director_alert';
  payload: unknown;
  createdAt: string;
  model?: string;
  promptVersion?: string;
  knowledgeVersion?: string;
}
```

Это необходимо для разбора ошибок и улучшения системы.

---

## 22. Shadow Mode — первый реальный запуск

До автономных ответов Jarvis проходит этап Shadow.

### Как работает

- получает реальные входящие сообщения;
- видит контекст и CRM;
- формирует тот ответ, который отправил бы клиенту;
- **не отправляет его клиенту**;
- сохраняет предложенный ответ и свои извлеченные факты;
- человек продолжает работать как сейчас.

### Что сравниваем

- ответ Jarvis;
- фактический ответ человека;
- корректность расчета;
- лишние вопросы;
- пропущенные изменения;
- ошибочные изменения;
- необходимость handoff.

---

## 23. Assisted Mode

После Shadow:

- стандартные уверенные вопросы Jarvis отвечает сам;
- нестандартные передает человеку;
- CRM только читает;
- любые конфликты выносит директору;
- человек может в любой момент забрать диалог.

---

## 24. Autonomous Sales V1

Критерий перехода:

Jarvis стабильно ведет стандартный розничный сценарий:

```text
входящее сообщение
→ квалификация
→ необходимые уточнения
→ расчет
→ предварительная стоимость
→ ответы на FAQ
→ предложение замера
→ получение данных для заявки
```

И при этом надежно передает исключения человеку.

---

## 25. Набор обязательных тестов

До публичного запуска подготовить минимум 100 реальных диалогов.

### Категории

1. обычная рамочная сетка;
2. одна рамочная сетка — предложение «Крыло»;
3. несколько рамочных сеток;
4. ПЛИССЕ;
5. дверная сетка;
6. разные полотна;
7. недоступный район;
8. самовывоз;
9. дилер с готовыми размерами;
10. изменение параметра в середине разговора;
11. клиент возвращается через несколько дней;
12. вопрос вне базы знаний;
13. просьба соединить с человеком;
14. конфликт переписка ↔ CRM;
15. неоднозначный размер/цвет/количество;
16. большой или сложный объект.

### Метрики

```text
Correct intent
Correct product
Correct extracted parameters
Correct price/tool use
No invented facts
No missed critical change
Correct handoff
Conversation brevity
Customer-safe wording
```

---

## 26. Acceptance Criteria для Jarvis Core V1

V1 считается технически состоявшимся, когда:

- [ ] один backend принимает сообщения минимум из Telegram;
- [ ] один и тот же Jarvis Core может обслуживать второй тестовый канал;
- [ ] сообщения и Order Memory сохраняются серверно;
- [ ] бизнес-знания загружаются отдельно от кода;
- [ ] расчет вызывается через Calculation Adapter;
- [ ] CRM доступна Jarvis только для чтения;
- [ ] Jarvis обнаруживает тестовый конфликт `коричневый ↔ белый`;
- [ ] Jarvis обнаруживает изменение `муар → глянец`;
- [ ] директор получает alert о конфликте;
- [ ] при human handoff Jarvis перестает отвечать;
- [ ] есть Shadow Mode;
- [ ] есть audit log;
- [ ] тестовый набор диалогов можно прогонять повторно;
- [ ] модель можно заменить через provider adapter;
- [ ] секреты не находятся в frontend-коде.

---

## 27. Порядок реализации — без расползания

### Sprint 0 — подготовка репозитория

1. создать отдельный `supermoskitka-jarvis`;
2. Node.js + TypeScript;
3. базовый HTTP server;
4. `.env.example`;
5. logger;
6. health endpoint;
7. Dockerfile либо поддерживаемый Timeweb deployment format.

**Результат:** Jarvis backend физически живет и запускается на Timeweb.

### Sprint 1 — Telegram + Conversation Storage

1. Telegram adapter;
2. входящие/исходящие сообщения;
3. Conversation entity;
4. message persistence;
5. human/jarvis owner flag;
6. простейший LLM provider adapter.

**Результат:** тестовый бот умеет вести диалог, но пока без бизнеса.

### Sprint 2 — Knowledge + SuperMoskitka persona

1. вынести подтвержденные правила в knowledge files;
2. собрать системную политику;
3. контекстный retrieval;
4. стиль общения;
5. handoff на прямую просьбу клиента.

**Результат:** бот отвечает как SuperMoskitka, а не как общий ChatGPT.

### Sprint 3 — Calculation Adapter

1. вынести/переиспользовать существующие расчетные функции;
2. дать Jarvis строго типизированный calculation tool;
3. запретить модели самостоятельный расчет;
4. добавить тесты на известные примеры.

**Результат:** стандартные расчеты выполняются реальным движком.

### Sprint 4 — Order Memory

1. extracted facts;
2. item matching;
3. источники фактов;
4. unresolved fields;
5. сохранение структурированного состояния.

**Результат:** Jarvis понимает заказ между сообщениями и днями.

### Sprint 5 — Change Detector

1. сравнение новых фактов со старой версией;
2. version/change events;
3. тест `муар → глянец`;
4. тест изменения цвета отдельной позиции;
5. отличать уточнение от реального изменения.

**Результат:** система видит «тихие» изменения.

### Sprint 6 — CRM Read-only Watcher

1. Firebase Admin SDK;
2. read repository;
3. linking conversation ↔ CRM order;
4. comparison engine;
5. conflict alerts.

**Результат:** Jarvis ловит переписка ↔ CRM.

### Sprint 7 — Director Channel

1. закрытый Telegram channel/bot для директора;
2. срочные alerts;
3. periodic report job;
4. режимы частоты отчетов;
5. зависшие замеры/заказы.

**Результат:** появляется реальная «правая рука» директора.

### Sprint 8 — Website chat

1. web widget adapter/API;
2. единый Conversation format;
3. тот же Jarvis Core;
4. единый customer identity.

**Результат:** один мозг работает минимум в двух каналах.

### Sprint 9 — Shadow rollout

1. загрузить реальные тестовые диалоги;
2. regression runner;
3. shadow для части живого трафика;
4. разбирать ошибки;
5. менять knowledge/rules только после подтверждения.

**Результат:** данные для решения, можно ли включать Assisted Mode.

---

## 28. Первый пакет задач для Cursor

Не давать Cursor команду «сделай всего Джарвиса».

### Задача 1 — только scaffold

```text
Создай новый отдельный проект supermoskitka-jarvis.

Стек:
- Node.js
- TypeScript
- минимальный HTTP backend

Пока НЕ подключай реальные внешние сервисы и НЕ меняй существующий supermoskitka-app.

Создай структуру:
src/app
src/channels
src/jarvis
src/llm
src/knowledge
src/calculation
src/crm
src/storage
src/domain
src/jobs
tests
docs

Добавь:
- package.json
- tsconfig.json
- .env.example
- src/app/server.ts
- GET /health
- базовый logger
- README с командами запуска

Никакой бизнес-логики пока не реализуй.
После выполнения покажи список созданных файлов и команды проверки.
```

### Задача 2 — после проверки scaffold

```text
Реализуй domain types:
- Conversation
- Message
- JarvisOrderMemory
- JarvisOrderItem
- FieldSource
- JarvisConflict
- JarvisAuditEvent

Не реализуй LLM и Telegram.
Добавь unit tests только для сериализации/валидации моделей.
```

### Задача 3 — Conversation Store + LLM interface

Только после проверки задачи 2.

---

## 29. Решения, которые пока намеренно отложены

Не блокируют разработку V1:

- точная модель LLM для production;
- точная СУБД для хранения внутренней памяти Jarvis (можно начать с Firestore/отдельных collections и заменить позже);
- точный UI внутреннего канала директора;
- полный список handoff-триггеров;
- точная логика работы со старыми полезными остатками профиля;
- формулы Duo/Portal/Uyut Plus;
- новый производственный интерфейс;
- право Jarvis менять CRM;
- дилерский self-service кабинет;
- телефония.

---

## 30. Главный принцип разработки

Каждая новая функция должна отвечать на вопрос:

> Она помогает Jarvis лучше продавать, лучше помнить заказ или лучше защищать бизнес от ошибки прямо сейчас?

Если нет — она не входит в Jarvis Core V1.

Это правило должно защищать проект от повторного расползания в бесконечные настройки и второстепенные модули.
