import type { Response } from 'express';

import type {
  ApplicationError,
  ApplicationErrorCode,
} from '../../application/application-errors.js';

export interface ErrorBody {
  error: {
    code: ApplicationErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

export function sendApplicationError(
  res: Response,
  input: {
    code: ApplicationErrorCode;
    message: string;
    httpStatus: number;
    requestId: string;
    details?: Record<string, unknown>;
  },
): void {
  const body: ErrorBody = {
    error: {
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      ...(input.details ? { details: input.details } : {}),
    },
  };
  res.status(input.httpStatus).json(body);
}

export function sendFromApplicationError(
  res: Response,
  error: ApplicationError,
  requestId: string,
): void {
  sendApplicationError(res, {
    code: error.code,
    message: error.message,
    httpStatus: error.httpStatus,
    requestId,
    ...(error.details ? { details: error.details } : {}),
  });
}
