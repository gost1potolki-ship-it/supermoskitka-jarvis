import { config as loadEnv } from 'dotenv';

loadEnv();

export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  logLevel: LogLevel;
}

const NODE_ENVS: ReadonlySet<string> = new Set(['development', 'test', 'production']);
const LOG_LEVELS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }
  return port;
}

function parseNodeEnv(raw: string): NodeEnv {
  if (!NODE_ENVS.has(raw)) {
    throw new Error(`Invalid NODE_ENV value: ${raw}`);
  }
  return raw as NodeEnv;
}

function parseLogLevel(raw: string): LogLevel {
  if (!LOG_LEVELS.has(raw)) {
    throw new Error(`Invalid LOG_LEVEL value: ${raw}`);
  }
  return raw as LogLevel;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: parseNodeEnv(requireEnv(env, 'NODE_ENV')),
    port: parsePort(requireEnv(env, 'PORT')),
    logLevel: parseLogLevel(requireEnv(env, 'LOG_LEVEL')),
  };
}

/** Loaded once at process start. Prefer `loadConfig` in tests. */
export const config: AppConfig = loadConfig();
