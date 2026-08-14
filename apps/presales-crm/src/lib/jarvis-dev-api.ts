const JARVIS_DEV_BASE = '/jarvis-dev';

export type ConversationMode = 'AI' | 'HUMAN';

export interface ConversationDto {
  conversationId: string;
  mode: ConversationMode;
  channel: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageSender = 'CUSTOMER' | 'AI' | 'HUMAN';

export interface MessageDto {
  messageId: string;
  sender: MessageSender;
  text: string;
  createdAt: string;
}

export interface HandleCustomerMessageResultDto {
  conversationId: string;
  conversationMode: ConversationMode;
  customerMessageId: string;
  duplicate: boolean;
  resumed?: boolean;
  aiReply: { messageId: string; text: string } | null;
}

export interface ConversationOrderStateDto {
  conversationId: string;
  memoryRevision: number;
  customer: {
    name?: string;
    phone?: string;
    address?: string;
    customerType?: string;
  };
  items: Array<{
    localItemId: string;
    productType?: string;
    quantity?: number;
    widthMm?: number;
    heightMm?: number;
    measurementBasis?: string;
    mesh?: string;
    profile?: string;
    profileColor?: string;
    ral?: string;
    finish?: string;
    fastening?: string;
    opening?: string;
    comment?: string;
  }>;
  preliminaryQuote?: {
    quoteId: string;
    publicTotalRub: number;
    current: boolean;
    accepted: boolean;
  };
  measurementAgreed?: boolean;
  readiness: {
    status: 'NOT_READY' | 'READY_FOR_MEASUREMENT';
    missingCodes: string[];
  };
  measurementAction: {
    kind: 'AUTO_ALLOWED' | 'NOT_READY' | 'AWAITING_OWNER_APPROVAL';
  };
  profitability?: {
    costBasisStatus: string;
    grossProfitRub?: number;
    grossMarginPercent?: number;
    markupPercent?: number;
    profitabilityBand: string;
  };
}

export interface MeasurementActionDto {
  conversationId: string;
  kind: 'AUTO_ALLOWED' | 'NOT_READY' | 'AWAITING_OWNER_APPROVAL';
  readiness: {
    status: 'NOT_READY' | 'READY_FOR_MEASUREMENT';
    missingCodes: string[];
  };
  draft?: {
    conversationId: string;
    memoryRevision: number;
    customer: {
      name?: string;
      phone?: string;
      address?: string;
    };
    items: ConversationOrderStateDto['items'];
    fulfillment: {
      installationRequested?: boolean;
      pickupRequested?: boolean;
      deliveryRequested?: boolean;
      deliveryType?: string;
      deliveryKm?: number;
    };
    preliminaryQuote?: {
      quoteId: string;
      publicTotalRub: number;
    };
  };
}

export class JarvisDevApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'JarvisDevApiError';
  }
}

export const JARVIS_LAB_CHANNEL = 'website';
export const JARVIS_LAB_CUSTOMER_ID = 'jarvis-lab';

type FetchLike = typeof fetch;

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export function createLabMessageId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `lab_${uuid}`;
  return `lab_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function mapJarvisDevError(status: number, body: ErrorBody): JarvisDevApiError {
  const code = body.error?.code ?? 'UNKNOWN';
  switch (status) {
    case 401:
      return new JarvisDevApiError(code, 'Ошибка авторизации dev proxy Jarvis.', status);
    case 404:
      return new JarvisDevApiError(code, 'Диалог не найден.', status);
    case 409:
      return new JarvisDevApiError(code, 'Конфликт messageId.', status);
    case 502:
      return new JarvisDevApiError(code, 'Провайдер Jarvis недоступен.', status);
    case 503:
      return new JarvisDevApiError(
        code,
        'Jarvis runtime/API не настроен. Проверьте локальный backend и dev proxy.',
        status,
      );
    default:
      return new JarvisDevApiError(
        code,
        body.error?.message ?? 'Не удалось выполнить запрос к Jarvis Lab.',
        status,
      );
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function request<T>(
  fetchImpl: FetchLike,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${JARVIS_DEV_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new JarvisDevApiError('NETWORK_ERROR', 'Backend Jarvis недоступен.', 0);
  }

  const body = await readJson<ErrorBody & T>(response);
  if (!response.ok) {
    throw mapJarvisDevError(response.status, body);
  }
  return body;
}

export interface JarvisDevApi {
  createConversation(): Promise<ConversationDto>;
  getConversation(conversationId: string): Promise<ConversationDto>;
  getMessages(conversationId: string): Promise<{ messages: MessageDto[] }>;
  sendCustomerMessage(
    conversationId: string,
    messageId: string,
    text: string,
  ): Promise<HandleCustomerMessageResultDto>;
  setConversationMode(conversationId: string, mode: ConversationMode): Promise<ConversationDto>;
  getOrderState(conversationId: string): Promise<ConversationOrderStateDto>;
  getMeasurementAction(conversationId: string): Promise<MeasurementActionDto>;
}

export const createJarvisDevApi = (fetchImpl: FetchLike = fetch): JarvisDevApi => ({
  async createConversation() {
    return request(fetchImpl, '/conversations', {
      method: 'POST',
      body: JSON.stringify({
        channel: JARVIS_LAB_CHANNEL,
        customerId: JARVIS_LAB_CUSTOMER_ID,
      }),
    });
  },

  async getConversation(conversationId) {
    return request(fetchImpl, `/conversations/${encodeURIComponent(conversationId)}`);
  },

  async getMessages(conversationId) {
    return request(fetchImpl, `/conversations/${encodeURIComponent(conversationId)}/messages`);
  },

  async sendCustomerMessage(conversationId, messageId, text) {
    return request(fetchImpl, `/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messageId, text }),
    });
  },

  async setConversationMode(conversationId, mode) {
    return request(fetchImpl, `/conversations/${encodeURIComponent(conversationId)}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  },

  async getOrderState(conversationId) {
    return request(fetchImpl, `/conversations/${encodeURIComponent(conversationId)}/order-state`);
  },

  async getMeasurementAction(conversationId) {
    return request(
      fetchImpl,
      `/conversations/${encodeURIComponent(conversationId)}/measurement-action`,
    );
  },
});
