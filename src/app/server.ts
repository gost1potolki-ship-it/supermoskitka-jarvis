import { randomUUID } from 'node:crypto';

import express, { type Express, type Request, type Response } from 'express';

import type { JarvisApplication } from '../application/index.js';

import { createInternalApiRouter } from './internal-api/create-internal-api-router.js';
import type { Logger } from './logger.js';

export interface HealthResponse {
  status: 'ok';
  service: 'supermoskitka-jarvis';
}

export interface CreateAppOptions {
  application?: JarvisApplication;
  /** Shared bearer token for /internal/v1/**. Missing → 503 INTERNAL_API_NOT_CONFIGURED. */
  internalApiKey?: string;
}

export function createApp(logger: Logger, options: CreateAppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const headerId = req.header('x-request-id')?.trim();
    const requestId =
      headerId && headerId.length <= 128 && /^[\w\-.:]+$/.test(headerId)
        ? headerId
        : randomUUID();
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
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
        durationMs: Date.now() - startedAt,
        ...(typeof req.params.conversationId === 'string'
          ? { conversationId: req.params.conversationId }
          : {}),
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

  app.use(
    '/internal/v1',
    createInternalApiRouter({
      application: options.application,
      apiKey: options.internalApiKey,
      logger,
    }),
  );

  return app;
}
