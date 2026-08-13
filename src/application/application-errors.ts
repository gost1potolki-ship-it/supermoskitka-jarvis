export type ApplicationErrorCode =
  | 'UNAUTHORIZED'
  | 'INTERNAL_API_NOT_CONFIGURED'
  | 'VALIDATION_ERROR'
  | 'CONVERSATION_NOT_FOUND'
  | 'MESSAGE_ID_CONFLICT'
  | 'DUPLICATE_MESSAGE'
  | 'MODE_INVALID'
  | 'PERSISTENCE_CONFLICT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApplicationErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  static validation(message: string, details?: Record<string, unknown>): ApplicationError {
    return new ApplicationError('VALIDATION_ERROR', message, 400, details);
  }

  static notFound(message = 'Conversation not found'): ApplicationError {
    return new ApplicationError('CONVERSATION_NOT_FOUND', message, 404);
  }

  static modeInvalid(message = 'Invalid conversation mode'): ApplicationError {
    return new ApplicationError('MODE_INVALID', message, 400);
  }

  static messageIdConflict(message = 'Message id conflict'): ApplicationError {
    return new ApplicationError('MESSAGE_ID_CONFLICT', message, 409);
  }

  static persistenceConflict(message = 'Persistence conflict'): ApplicationError {
    return new ApplicationError('PERSISTENCE_CONFLICT', message, 409);
  }

  static providerUnavailable(message = 'Provider unavailable'): ApplicationError {
    return new ApplicationError('PROVIDER_UNAVAILABLE', message, 502);
  }

  static internal(message = 'Internal error'): ApplicationError {
    return new ApplicationError('INTERNAL_ERROR', message, 500);
  }
}
