export type DeepSeekProviderErrorCode = 'CONFIG_ERROR' | 'API_ERROR' | 'EMPTY_RESPONSE';

export class DeepSeekProviderError extends Error {
  readonly code: DeepSeekProviderErrorCode;
  readonly provider = 'deepseek' as const;
  readonly model?: string;
  readonly status?: number;

  constructor(
    code: DeepSeekProviderErrorCode,
    message: string,
    options?: { model?: string; status?: number },
  ) {
    super(message);
    this.name = 'DeepSeekProviderError';
    this.code = code;
    if (options?.model !== undefined) {
      this.model = options.model;
    }
    if (options?.status !== undefined) {
      this.status = options.status;
    }
  }
}
