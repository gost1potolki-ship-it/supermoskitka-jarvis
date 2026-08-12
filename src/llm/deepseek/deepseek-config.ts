export interface DeepSeekConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export class DeepSeekConfigError extends Error {
  readonly code = 'CONFIG_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'DeepSeekConfigError';
  }
}

/**
 * Loads DeepSeek API settings from environment.
 * Does not affect global AppConfig — optional until DeepSeek provider is constructed.
 */
export function loadDeepSeekConfig(env: NodeJS.ProcessEnv = process.env): DeepSeekConfig {
  const apiKey = env.DEEPSEEK_API_KEY?.trim() ?? '';
  const model = env.DEEPSEEK_MODEL?.trim() ?? '';
  const baseUrlRaw = env.DEEPSEEK_BASE_URL?.trim() ?? '';
  const baseUrl = baseUrlRaw === '' ? DEFAULT_DEEPSEEK_BASE_URL : baseUrlRaw;

  if (apiKey === '') {
    throw new DeepSeekConfigError('Missing required environment variable: DEEPSEEK_API_KEY');
  }
  if (model === '') {
    throw new DeepSeekConfigError('Missing required environment variable: DEEPSEEK_MODEL');
  }

  return { apiKey, model, baseUrl };
}
