import { randomUUID } from 'node:crypto';

import express, { type Express, type Request, type Response } from 'express';

import type { Logger } from './logger.js';

export interface HealthResponse {
  status: 'ok';
  service: 'supermoskitka-jarvis';
}

export function createApp(logger: Logger): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const requestId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', requestId);

    const requestLogger = logger.child({ requestId });
    requestLogger.info('request.start', {
      method: req.method,
      path: req.path,
    });

    res.on('finish', () => {
      requestLogger.info('request.finish', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      });
    });

    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'supermoskitka-jarvis',
    };
    res.status(200).json(body);
  });

  return app;
}
