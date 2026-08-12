# SuperMoskitka Jarvis

HTTP backend scaffold for the SuperMoskitka AI manager. This repository is separate from the surveyor React/Firebase app.

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
cp .env.example .env
npm install
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API with hot reload |
| `npm test` | Run unit tests once |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |

## Health check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "supermoskitka-jarvis"
}
```

## Docker

Build:

```bash
docker build -t supermoskitka-jarvis .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e LOG_LEVEL=info \
  supermoskitka-jarvis
```

## Project layout

Domain modules under `src/` (`channels`, `jarvis`, `llm`, `knowledge`, `calculation`, `crm`, `storage`, `domain`, `jobs`) are placeholders for later stages. Do not add business logic here until the corresponding task.

## Configuration

Environment variables (see `.env.example`):

- `NODE_ENV` — `development` | `test` | `production`
- `PORT` — HTTP listen port
- `LOG_LEVEL` — `debug` | `info` | `warn` | `error`
