export type OdiRouterProviderErrorCode = 'CONFIG_ERROR' | 'API_ERROR' | 'EMPTY_RESPONSE';

export class OdiRouterProviderError extends Error {
  readonly code: OdiRouterProviderErrorCode;
  readonly provider = 'odirouter' as const;
  readonly model?: string;
  readonly status?: number;

  constructor(
    code: OdiRouterProviderErrorCode,
    message: string,
    options?: { model?: string; status?: number },
  ) {
    super(message);
    this.name = 'OdiRouterProviderError';
    this.code = code;
    if (options?.model !== undefined) {
      this.model = options.model;
    }
    if (options?.status !== undefined) {
      this.status = options.status;
    }
  }
}
