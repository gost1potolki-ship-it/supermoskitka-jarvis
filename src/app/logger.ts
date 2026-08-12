import type { LogLevel } from './config.js';

export interface LogContext {
  conversationId?: string;
  requestId?: string;
  [key: string]: unknown;
}

type LogMethod = (message: string, context?: LogContext) => void;

export interface Logger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  child: (bindings: LogContext) => Logger;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
}

function write(level: LogLevel, minLevel: LogLevel, message: string, context: LogContext = {}): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) {
    return;
  }

  const { err, error, ...rest } = context;
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...rest,
  };

  if (err !== undefined) {
    payload.err = serializeError(err);
  }
  if (error !== undefined) {
    payload.error = serializeError(error);
  }

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createLogger(minLevel: LogLevel, bindings: LogContext = {}): Logger {
  const log =
    (level: LogLevel): LogMethod =>
    (message, context = {}) => {
      write(level, minLevel, message, { ...bindings, ...context });
    };

  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child(childBindings) {
      return createLogger(minLevel, { ...bindings, ...childBindings });
    },
  };
}
