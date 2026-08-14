import { describe, expect, it, vi } from 'vitest';

import {
  createJarvisDevApi,
  createLabMessageId,
  JarvisDevApiError,
  JARVIS_LAB_CHANNEL,
  JARVIS_LAB_CUSTOMER_ID,
  mapJarvisDevError,
} from './jarvis-dev-api';

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }) as Response;

describe('Jarvis dev API client', () => {
  it('creates a lab conversation through the dev proxy path', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        conversationId: 'conv_1',
        mode: 'AI',
        channel: JARVIS_LAB_CHANNEL,
        createdAt: '2026-08-14T10:00:00.000Z',
        updatedAt: '2026-08-14T10:00:00.000Z',
      }),
    );
    const api = createJarvisDevApi(fetchImpl as typeof fetch);

    const conversation = await api.createConversation();

    expect(conversation.conversationId).toBe('conv_1');
    expect(fetchImpl).toHaveBeenCalledWith('/jarvis-dev/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: JARVIS_LAB_CHANNEL,
        customerId: JARVIS_LAB_CUSTOMER_ID,
      }),
    });
  });

  it('loads messages, order-state and measurement-action', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/messages')) {
        return jsonResponse({ messages: [{ messageId: 'm1', sender: 'CUSTOMER', text: 'Привет', createdAt: 't' }] });
      }
      if (url.endsWith('/order-state')) {
        return jsonResponse({
          conversationId: 'conv_1',
          memoryRevision: 1,
          customer: {},
          items: [],
          readiness: { status: 'NOT_READY', missingCodes: [] },
          measurementAction: { kind: 'NOT_READY' },
        });
      }
      if (url.endsWith('/measurement-action')) {
        return jsonResponse({
          conversationId: 'conv_1',
          kind: 'NOT_READY',
          readiness: { status: 'NOT_READY', missingCodes: [] },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const api = createJarvisDevApi(fetchImpl as typeof fetch);

    await expect(api.getMessages('conv_1')).resolves.toMatchObject({
      messages: [{ messageId: 'm1' }],
    });
    await expect(api.getOrderState('conv_1')).resolves.toMatchObject({ conversationId: 'conv_1' });
    await expect(api.getMeasurementAction('conv_1')).resolves.toMatchObject({ kind: 'NOT_READY' });
  });

  it('sends customer messages and switches mode', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/messages') && init?.method === 'POST') {
        return jsonResponse({
          conversationId: 'conv_1',
          conversationMode: 'AI',
          customerMessageId: 'lab_1',
          duplicate: false,
          aiReply: { messageId: 'ai_1', text: 'Ответ' },
        });
      }
      if (url.endsWith('/mode') && init?.method === 'POST') {
        return jsonResponse({
          conversationId: 'conv_1',
          mode: 'HUMAN',
          channel: JARVIS_LAB_CHANNEL,
          createdAt: 't',
          updatedAt: 't',
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const api = createJarvisDevApi(fetchImpl as typeof fetch);

    await expect(api.sendCustomerMessage('conv_1', 'lab_1', 'Нужны сетки')).resolves.toMatchObject({
      aiReply: { text: 'Ответ' },
    });
    await expect(api.setConversationMode('conv_1', 'HUMAN')).resolves.toMatchObject({ mode: 'HUMAN' });
  });

  it('maps controlled HTTP errors', () => {
    expect(mapJarvisDevError(401, { error: { code: 'UNAUTHORIZED' } }).message).toContain('авторизации');
    expect(mapJarvisDevError(404, { error: { code: 'NOT_FOUND' } }).message).toContain('не найден');
    expect(mapJarvisDevError(409, { error: { code: 'MESSAGE_ID_CONFLICT' } }).message).toContain('messageId');
    expect(mapJarvisDevError(502, { error: { code: 'PROVIDER_UNAVAILABLE' } }).message).toContain('недоступен');
    expect(mapJarvisDevError(503, { error: { code: 'NOT_CONFIGURED' } }).message).toContain('не настроен');
  });

  it('retries with the same lab message id', async () => {
    const messageId = createLabMessageId();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(
        jsonResponse({
          conversationId: 'conv_1',
          conversationMode: 'AI',
          customerMessageId: messageId,
          duplicate: false,
          aiReply: { messageId: 'ai_1', text: 'Ответ' },
        }),
      );
    const api = createJarvisDevApi(fetchImpl as typeof fetch);

    await expect(api.sendCustomerMessage('conv_1', messageId, 'Повтор')).rejects.toBeInstanceOf(
      JarvisDevApiError,
    );
    await expect(api.sendCustomerMessage('conv_1', messageId, 'Повтор')).resolves.toMatchObject({
      customerMessageId: messageId,
    });
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(fetchImpl.mock.calls[1]?.[1]);
  });

  it('creates stable lab message ids', () => {
    expect(createLabMessageId()).toMatch(/^lab_/);
  });
});
