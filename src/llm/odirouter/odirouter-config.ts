export interface OdiRouterConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const DEFAULT_ODIROUTER_BASE_URL = 'https://api.odirouter.ai/v1';

export class OdiRouterConfigError extends Error {
  readonly code = 'CONFIG_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'OdiRouterConfigError';
  }
}

/**
 * Loads OdiRouter gateway settings from environment.
 * Does not affect global AppConfig — optional until OdiRouter provider is constructed.
 */
export function loadOdiRouterConfig(env: NodeJS.ProcessEnv = process.env): OdiRouterConfig {
  const apiKey = env.ODIROUTER_API_KEY?.trim() ?? '';
  const model = env.ODIROUTER_MODEL?.trim() ?? '';
  const baseUrlRaw = env.ODIROUTER_BASE_URL?.trim() ?? '';
  const baseUrl = baseUrlRaw === '' ? DEFAULT_ODIROUTER_BASE_URL : baseUrlRaw;

  if (apiKey === '') {
    throw new OdiRouterConfigError('Missing required environment variable: ODIROUTER_API_KEY');
  }
  if (model === '') {
    throw new OdiRouterConfigError('Missing required environment variable: ODIROUTER_MODEL');
  }

  return { apiKey, model, baseUrl };
}
