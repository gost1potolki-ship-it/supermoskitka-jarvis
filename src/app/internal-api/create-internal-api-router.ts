import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  ApplicationError,
  type JarvisApplication,
} from '../../application/index.js';
import type { Logger } from '../logger.js';

import { createInternalApiAuthMiddleware } from './auth-middleware.js';
import { sendApplicationError, sendFromApplicationError } from './http-errors.js';

export interface CreateInternalApiRouterOptions {
  application: JarvisApplication | undefined;
  apiKey: string | undefined;
  logger: Logger;
}

function requestIdOf(res: Response): string {
  return String(res.getHeader('x-request-id') ?? '');
}

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

export function createInternalApiRouter(options: CreateInternalApiRouterOptions): Router {
  const router = Router({ mergeParams: true });
  const { application, apiKey, logger } = options;

  router.use(createInternalApiAuthMiddleware(apiKey));

  router.use((req, res, next) => {
    if (!application) {
      sendApplicationError(res, {
        code: 'INTERNAL_API_NOT_CONFIGURED',
        message: 'Internal API application is not configured',
        httpStatus: 503,
        requestId: requestIdOf(res),
      });
      return;
    }
    next();
  });

  router.post(
    '/conversations',
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as { channel?: unknown; customerId?: unknown };
      const created = await application!.createConversation({
        ...(typeof body.channel === 'string' ? { channel: body.channel } : {}),
        ...(typeof body.customerId === 'string' ? { customerId: body.customerId } : {}),
      });
      res.status(201).json(created);
    }),
  );

  router.get(
    '/conversations/:conversationId',
    asyncRoute(async (req, res) => {
      const dto = await application!.getConversation(req.params.conversationId!);
      res.status(200).json(dto);
    }),
  );

  router.get(
    '/conversations/:conversationId/messages',
    asyncRoute(async (req, res) => {
      const messages = await application!.listConversationMessages(req.params.conversationId!);
      res.status(200).json({ messages });
    }),
  );

  router.post(
    '/conversations/:conversationId/messages',
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as {
        messageId?: unknown;
        text?: unknown;
        createdAt?: unknown;
      };
      if (typeof body.messageId !== 'string' || typeof body.text !== 'string') {
        throw ApplicationError.validation('messageId and text are required strings');
      }
      const result = await application!.handleCustomerMessage({
        conversationId: req.params.conversationId!,
        messageId: body.messageId,
        text: body.text,
        ...(typeof body.createdAt === 'string' ? { createdAt: body.createdAt } : {}),
      });
      res.status(200).json(result);
    }),
  );

  router.post(
    '/conversations/:conversationId/mode',
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as { mode?: unknown };
      if (typeof body.mode !== 'string') {
        throw ApplicationError.modeInvalid();
      }
      const dto = await application!.setConversationMode(
        req.params.conversationId!,
        body.mode,
      );
      res.status(200).json(dto);
    }),
  );

  router.get(
    '/conversations/:conversationId/order-state',
    asyncRoute(async (req, res) => {
      const dto = await application!.getConversationOrderState(req.params.conversationId!);
      res.status(200).json(dto);
    }),
  );

  router.get(
    '/conversations/:conversationId/measurement-action',
    asyncRoute(async (req, res) => {
      const dto = await application!.getMeasurementAction(req.params.conversationId!);
      res.status(200).json(dto);
    }),
  );

  router.post(
    '/conversations/:conversationId/measurement-submit',
    asyncRoute(async (req, res) => {
      // Intentionally no body mapping: all operational values are rebuilt from
      // the current trusted server-side MeasurementAction/draft/quote.
      const dto = await application!.submitReadyMeasurement(req.params.conversationId!);
      res.status(200).json(dto);
    }),
  );

  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = requestIdOf(res);
    if (error instanceof ApplicationError) {
      logger.warn('internal_api.application_error', {
        requestId,
        code: error.code,
        method: req.method,
        path: req.path,
        conversationId: req.params.conversationId,
      });
      sendFromApplicationError(res, error, requestId);
      return;
    }

    logger.error('internal_api.unexpected_error', {
      requestId,
      method: req.method,
      path: req.path,
      conversationId: req.params.conversationId,
      err: error instanceof Error ? { name: error.name, message: error.message } : error,
    });
    sendApplicationError(res, {
      code: 'INTERNAL_ERROR',
      message: 'Internal error',
      httpStatus: 500,
      requestId,
    });
  });

  return router;
}
