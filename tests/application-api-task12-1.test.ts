import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import request from 'supertest';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import { getFactValue } from '../src/domain/index.js';
import {
  composeJarvisApplication,
  tryCreateProductionJarvisApplication,
} from '../src/application/index.js';
import { createApp } from '../src/app/server.js';
import { createLogger } from '../src/app/logger.js';
import { FakeSystemPromptProvider } from '../src/jarvis/fake-system-prompt-provider.js';
import {
  FakeFactExtractor,
  emptyExtraction,
  type FactExtractionResult,
} from '../src/jarvis/extraction/index.js';
import {
  OdiRouterProviderError,
  ScriptedLlmProvider,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from '../src/llm/index.js';
import {
  InMemoryConversationStore,
  InMemoryOrderMemoryStore,
} from '../src/storage/index.js';
import {
  createTestJarvisHarness,
  TEST_INTERNAL_API_KEY,
} from './helpers/create-test-jarvis-harness.js';

const KNOWLEDGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../knowledge',
);

class GatedLlmProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  private readonly gate: Promise<void>;
  private readonly onEntered: (() => void) | undefined;

  constructor(
    private readonly responseText: string,
    gate: Promise<void>,
    onEntered?: () => void,
  ) {
    this.gate = gate;
    this.onEntered = onEntered;
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push({
      conversationId: request.conversationId,
      messages: request.messages.map((message) => ({ ...message })),
    });
    this.onEntered?.();
    await this.gate;
    return { text: this.responseText };
  }
}

describe('Task 12.1 runtime + retriable idempotency', () => {
  it('production composition wires JarvisApplication into createApp when deps are present', async () => {
    const application = tryCreateProductionJarvisApplication({
      conversationStore: new InMemoryConversationStore(),
      orderMemoryStore: new InMemoryOrderMemoryStore(),
      llm: new ScriptedLlmProvider(['ok']),
      knowledgeRoot: KNOWLEDGE_ROOT,
    });
    expect(application).toBeTruthy();
    const app = createApp(createLogger('error'), {
      application: application!,
      internalApiKey: TEST_INTERNAL_API_KEY,
    });
    const response = await request(app)
      .post('/internal/v1/conversations')
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({});
    expect(response.status).toBe(201);
    expect(response.body.conversationId).toBeTruthy();
  });

  it('missing runtime leaves health up and internal 503', async () => {
    const application = tryCreateProductionJarvisApplication({
      env: {},
      logger: createLogger('error'),
    });
    expect(application).toBeUndefined();
    const app = createApp(createLogger('error'), {
      internalApiKey: TEST_INTERNAL_API_KEY,
    });
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    const internal = await request(app)
      .post('/internal/v1/conversations')
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({});
    expect(internal.status).toBe(503);
    expect(internal.body.error.code).toBe('INTERNAL_API_NOT_CONFIGURED');
  });

  it('incomplete AI turn resumes on retry without second CUSTOMER append', async () => {
    const llm = new ScriptedLlmProvider([
      new OdiRouterProviderError('API_ERROR', 'temporary provider failure', { status: 502 }),
      'Восстановленный ответ Jarvis',
    ]);
    const conversationStore = new InMemoryConversationStore();
    const orderMemoryStore = new InMemoryOrderMemoryStore();
    const composed = composeJarvisApplication({
      conversationStore,
      orderMemoryStore,
      llm,
      systemPromptProvider: new FakeSystemPromptProvider('SYSTEM'),
      includeCalculationTools: false,
      includeFactExtractor: false,
    });
    const app = createApp(createLogger('error'), {
      application: composed.application,
      internalApiKey: TEST_INTERNAL_API_KEY,
    });

    const created = await request(app)
      .post('/internal/v1/conversations')
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({});
    const conversationId = created.body.conversationId as string;

    const first = await request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({ messageId: 'retry-1', text: 'нужна цена' });
    expect(first.status).toBe(502);
    expect(first.body.error.code).toBe('PROVIDER_UNAVAILABLE');

    const afterFail = await conversationStore.getMessages(conversationId);
    expect(afterFail.filter((m) => m.sender === 'CUSTOMER')).toHaveLength(1);
    expect(afterFail.filter((m) => m.sender === 'AI')).toHaveLength(0);

    const second = await request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({ messageId: 'retry-1', text: 'нужна цена' });
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.resumed).toBe(true);
    expect(second.body.aiReply?.text).toBe('Восстановленный ответ Jarvis');

    const afterResume = await conversationStore.getMessages(conversationId);
    expect(afterResume.filter((m) => m.sender === 'CUSTOMER')).toHaveLength(1);
    expect(afterResume.filter((m) => m.sender === 'AI')).toHaveLength(1);
    expect(llm.requests).toHaveLength(2);
  });

  it('resume does not create duplicate OrderChange for same extracted fact', async () => {
    const phoneFact: FactExtractionResult = {
      ...emptyExtraction(),
      customerFacts: [
        {
          field: 'phone',
          value: '+79991112233',
          explicitness: 'EXPLICIT',
          evidenceText: 'мой телефон +79991112233',
          confidence: 1,
        },
      ],
    };
    const factExtractor = new FakeFactExtractor([phoneFact, phoneFact]);
    const llm = new ScriptedLlmProvider([
      new OdiRouterProviderError('API_ERROR', 'temporary provider failure'),
      'Ответ после resume',
    ]);
    const conversationStore = new InMemoryConversationStore();
    const orderMemoryStore = new InMemoryOrderMemoryStore();
    const composed = composeJarvisApplication({
      conversationStore,
      orderMemoryStore,
      llm,
      systemPromptProvider: new FakeSystemPromptProvider('SYSTEM'),
      factExtractor,
      includeCalculationTools: false,
      includeFactExtractor: true,
    });
    const app = createApp(createLogger('error'), {
      application: composed.application,
      internalApiKey: TEST_INTERNAL_API_KEY,
    });
    const created = await request(app)
      .post('/internal/v1/conversations')
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({});
    const conversationId = created.body.conversationId as string;

    const first = await request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({ messageId: 'fact-1', text: 'мой телефон +79991112233' });
    expect(first.status).toBe(502);
    expect(factExtractor.requests).toHaveLength(1);

    const memoryAfterFail = await orderMemoryStore.get(conversationId);
    expect(memoryAfterFail).not.toBeNull();
    expect(getFactValue(memoryAfterFail!.customer?.phone)).toBe('+79991112233');
    const phoneHistoryLen = memoryAfterFail!.customer?.phone?.history.length ?? 0;

    const resumed = await request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({ messageId: 'fact-1', text: 'мой телефон +79991112233' });
    expect(resumed.status).toBe(200);
    expect(resumed.body.aiReply?.text).toBe('Ответ после resume');

    const memoryAfterResume = await orderMemoryStore.get(conversationId);
    expect(getFactValue(memoryAfterResume?.customer?.phone)).toBe('+79991112233');
    expect(memoryAfterResume?.customer?.phone?.history.length ?? 0).toBe(phoneHistoryLen);
    expect(factExtractor.requests).toHaveLength(2);
  });

  it('concurrent same message processes once', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const llm = new GatedLlmProvider('Один ответ', gate);
    const conversationStore = new InMemoryConversationStore();
    const orderMemoryStore = new InMemoryOrderMemoryStore();
    const composed = composeJarvisApplication({
      conversationStore,
      orderMemoryStore,
      llm,
      systemPromptProvider: new FakeSystemPromptProvider('SYSTEM'),
      includeCalculationTools: false,
      includeFactExtractor: false,
    });
    const app = createApp(createLogger('error'), {
      application: composed.application,
      internalApiKey: TEST_INTERNAL_API_KEY,
    });
    const created = await request(app)
      .post('/internal/v1/conversations')
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({});
    const conversationId = created.body.conversationId as string;

    const payload = { messageId: 'concurrent-1', text: 'параллельный повтор' };
    const p1 = request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send(payload);
    const p2 = request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send(payload);

    await new Promise((resolve) => setTimeout(resolve, 30));
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(llm.requests).toHaveLength(1);

    const messages = await conversationStore.getMessages(conversationId);
    expect(messages.filter((m) => m.sender === 'CUSTOMER')).toHaveLength(1);
    expect(messages.filter((m) => m.sender === 'AI')).toHaveLength(1);
  });

  it('concurrent same messageId different text → immediate 409', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const enteredGate = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const llm = new GatedLlmProvider('Ответ первого текста', gate, entered);
    const conversationStore = new InMemoryConversationStore();
    const orderMemoryStore = new InMemoryOrderMemoryStore();
    const composed = composeJarvisApplication({
      conversationStore,
      orderMemoryStore,
      llm,
      systemPromptProvider: new FakeSystemPromptProvider('SYSTEM'),
      includeCalculationTools: false,
      includeFactExtractor: false,
    });
    const app = createApp(createLogger('error'), {
      application: composed.application,
      internalApiKey: TEST_INTERNAL_API_KEY,
    });
    const created = await request(app)
      .post('/internal/v1/conversations')
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({});
    const conversationId = created.body.conversationId as string;

    // Force supertest to start the request immediately (thenable).
    const first = Promise.resolve(
      request(app)
        .post(`/internal/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
        .send({ messageId: 'conflict-concurrent', text: 'первый текст' }),
    );
    await enteredGate;
    expect(llm.requests).toHaveLength(1);

    const conflict = await request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({ messageId: 'conflict-concurrent', text: 'другой текст' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('MESSAGE_ID_CONFLICT');
    expect(llm.requests).toHaveLength(1);

    release();
    const firstResult = await first;
    expect(firstResult.status).toBe(200);
    expect(firstResult.body.aiReply?.text).toBe('Ответ первого текста');
    expect(llm.requests).toHaveLength(1);

    const messages = await conversationStore.getMessages(conversationId);
    expect(messages.filter((m) => m.sender === 'CUSTOMER')).toHaveLength(1);
    expect(messages.filter((m) => m.sender === 'CUSTOMER')[0]?.text).toBe('первый текст');
    expect(messages.filter((m) => m.sender === 'AI')).toHaveLength(1);
  });

  it('same id different text remains 409 even if first turn incomplete', async () => {
    const llm = new ScriptedLlmProvider([
      new OdiRouterProviderError('API_ERROR', 'temporary provider failure'),
      'should-not-matter',
    ]);
    const composed = composeJarvisApplication({
      conversationStore: new InMemoryConversationStore(),
      orderMemoryStore: new InMemoryOrderMemoryStore(),
      llm,
      systemPromptProvider: new FakeSystemPromptProvider('SYSTEM'),
      includeCalculationTools: false,
      includeFactExtractor: false,
    });
    const app = createApp(createLogger('error'), {
      application: composed.application,
      internalApiKey: TEST_INTERNAL_API_KEY,
    });
    const created = await request(app)
      .post('/internal/v1/conversations')
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({});
    const conversationId = created.body.conversationId as string;
    await request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({ messageId: 'conflict-incomplete', text: 'первый текст' });
    const conflict = await request(app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${TEST_INTERNAL_API_KEY}`)
      .send({ messageId: 'conflict-incomplete', text: 'другой текст' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('MESSAGE_ID_CONFLICT');
  });

  it('HUMAN duplicate stays silent and does not resume AI', async () => {
    const harness = createTestJarvisHarness();
    const created = await request(harness.app)
      .post('/internal/v1/conversations')
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({});
    const conversationId = created.body.conversationId as string;
    await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/mode`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({ mode: 'HUMAN' });
    await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({ messageId: 'human-dup', text: 'нужен менеджер' });
    const llmCount = harness.llm.requests.length;
    const dup = await request(harness.app)
      .post(`/internal/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${harness.apiKey}`)
      .send({ messageId: 'human-dup', text: 'нужен менеджер' });
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);
    expect(dup.body.aiReply).toBeNull();
    expect(harness.llm.requests).toHaveLength(llmCount);
  });

  it('OpenAPI typed schemas and statuses are present', () => {
    const openApiPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../docs/openapi.internal.v1.yaml',
    );
    const doc = parseYaml(readFileSync(openApiPath, 'utf8')) as {
      paths: Record<string, Record<string, { responses?: Record<string, unknown>; security?: unknown[] }>>;
      components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
    };

    expect(doc.paths['/health']?.get?.security).toEqual([]);
    expect(doc.components.securitySchemes.bearerAuth).toBeTruthy();

    const orderState = doc.paths['/internal/v1/conversations/{conversationId}/order-state']?.get;
    expect(JSON.stringify(orderState?.responses?.['200'])).toContain('ConversationOrderStateDto');
    expect(orderState?.responses?.['503']).toBeTruthy();

    const measurement =
      doc.paths['/internal/v1/conversations/{conversationId}/measurement-action']?.get;
    expect(JSON.stringify(measurement?.responses?.['200'])).toContain('MeasurementActionDto');

    const messagesPost =
      doc.paths['/internal/v1/conversations/{conversationId}/messages']?.post;
    expect(messagesPost?.responses?.['409']).toBeTruthy();
    expect(messagesPost?.responses?.['502']).toBeTruthy();
    expect(messagesPost?.responses?.['503']).toBeTruthy();

    for (const name of [
      'ConversationOrderStateDto',
      'CustomerStateDto',
      'OrderItemStateDto',
      'PreliminaryQuoteStateDto',
      'ReadinessDto',
      'MeasurementActionSummaryDto',
      'ProfitabilitySummaryDto',
      'MeasurementActionDto',
      'MeasurementDraftDto',
      'FulfillmentDraftDto',
    ]) {
      expect(doc.components.schemas[name]).toBeTruthy();
    }

    const orderSchema = doc.components.schemas.ConversationOrderStateDto as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(orderSchema.required).toEqual(
      expect.arrayContaining([
        'conversationId',
        'memoryRevision',
        'customer',
        'items',
        'readiness',
        'measurementAction',
      ]),
    );
  });
});
