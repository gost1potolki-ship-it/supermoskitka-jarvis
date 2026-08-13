import { timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { sendApplicationError } from './http-errors.js';

function readBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function createInternalApiAuthMiddleware(apiKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = String(res.getHeader('x-request-id') ?? '');

    if (!apiKey) {
      sendApplicationError(res, {
        code: 'INTERNAL_API_NOT_CONFIGURED',
        message: 'Internal API is not configured',
        httpStatus: 503,
        requestId,
      });
      return;
    }

    const token = readBearerToken(req.header('authorization'));
    if (!token || !tokensEqual(token, apiKey)) {
      sendApplicationError(res, {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        httpStatus: 401,
        requestId,
      });
      return;
    }

    next();
  };
}
