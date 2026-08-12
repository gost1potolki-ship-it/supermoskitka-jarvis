# Cursor Task 01 — SuperMoskitka Jarvis Scaffold

## Контекст

Мы начинаем отдельный backend-проект `supermoskitka-jarvis` для AI-менеджера SuperMoskitka.

Это **не** модификация существующего приложения замерщиков. Текущее приложение React/TypeScript/Firebase продолжает работать отдельно.

На первом шаге нужно создать только безопасный каркас backend-проекта. Никакой бизнес-логики, расчётов, Firebase, Telegram и LLM пока не подключать.

## Задача

Создай новый проект `supermoskitka-jarvis` со стеком:

- Node.js;
- TypeScript;
- HTTP backend;
- ESLint;
- Prettier;
- Vitest для unit tests;
- простой структурированный logger;
- конфигурация через env;
- готовность к Docker/Timeweb deployment.

## Структура

```text
supermoskitka-jarvis/
├── src/
│   ├── app/
│   │   ├── server.ts
│   │   └── config.ts
│   ├── channels/
│   ├── jarvis/
│   ├── llm/
│   ├── knowledge/
│   ├── calculation/
│   ├── crm/
│   ├── storage/
│   ├── domain/
│   └── jobs/
├── tests/
├── docs/
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── tsconfig.json
├── eslint.config.js
├── prettier.config.js
└── README.md
```

## Реализовать сейчас

1. `GET /health` → HTTP 200 JSON:

```json
{
  "status": "ok",
  "service": "supermoskitka-jarvis"
}
```

2. `src/app/config.ts`:
- читает `PORT`, `NODE_ENV`, `LOG_LEVEL`;
- валидирует обязательные env;
- не содержит секретов и значений production.

3. Logger:
- `info`, `warn`, `error`;
- timestamps;
- пригоден для последующего логирования `conversationId` и `requestId`.

4. Graceful shutdown по `SIGTERM`/`SIGINT`.

5. Unit test для `/health`.

6. README:
- установка;
- `npm run dev`;
- `npm test`;
- `npm run build`;
- `npm start`;
- Docker build/run.

7. `.env.example`:

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
```

## Ограничения

**НЕ делать на этом этапе:**

- не подключать OpenAI/Timeweb/Gemini/другую LLM;
- не подключать Telegram;
- не подключать Firebase/Firestore;
- не копировать расчётные формулы;
- не менять существующий `supermoskitka-app`;
- не создавать CRM;
- не реализовывать базу знаний;
- не реализовывать Jarvis Orchestrator;
- не добавлять авторизацию;
- не добавлять Redis/Postgres без отдельного решения.

## Критерии готовности

Перед завершением выполнить:

```bash
npm install
npm run build
npm test
```

Все команды должны завершиться успешно.

После выполнения не переходи к следующему этапу самостоятельно. Покажи:

1. дерево созданных файлов;
2. список зависимостей;
3. результаты `npm run build` и `npm test`;
4. кратко — какие решения приняты;
5. какие файлы нужно передать ChatGPT для проверки.
