export type GeminiProviderErrorCode = 'CONFIG_ERROR' | 'API_ERROR' | 'EMPTY_RESPONSE';

export class GeminiProviderError extends Error {
  readonly code: GeminiProviderErrorCode;
  readonly provider = 'gemini' as const;
  readonly model?: string;

  constructor(code: GeminiProviderErrorCode, message: string, options?: { model?: string }) {
    super(message);
    this.name = 'GeminiProviderError';
    this.code = code;
    if (options?.model !== undefined) {
      this.model = options.model;
    }
  }
}
