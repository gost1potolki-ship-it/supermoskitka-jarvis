export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export class GeminiConfigError extends Error {
  readonly code = 'CONFIG_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'GeminiConfigError';
  }
}

/**
 * Loads Gemini Developer API settings from environment.
 * Does not affect global AppConfig — optional until Gemini provider is constructed.
 */
export function loadGeminiConfig(env: NodeJS.ProcessEnv = process.env): GeminiConfig {
  const apiKey = env.GEMINI_API_KEY?.trim() ?? '';
  const model = env.GEMINI_MODEL?.trim() ?? '';

  if (apiKey === '') {
    throw new GeminiConfigError('Missing required environment variable: GEMINI_API_KEY');
  }
  if (model === '') {
    throw new GeminiConfigError('Missing required environment variable: GEMINI_MODEL');
  }

  return { apiKey, model };
}
