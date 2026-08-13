import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { OrderMemory } from '../src/domain/index.js';
import {
  applyCommercialFact,
  applyCustomerFact,
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import { createApp } from '../src/app/server.js';
import { createLogger } from '../src/app/logger.js';
import {
  createTestJarvisHarness,
  TEST_INTERNAL_API_KEY,
} from './helpers/create-test-jarvis-harness.js';
import { persistTestQuote } from './helpers/persist-test-quote.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const SOURCE = {
  sourceMessageId: 'msg-1',
  sourceChannel: 'telegram' as const,
  sourceTimestamp: '2026-08-13T10:00:00.000Z',
};

async function seedReadyMemory(): Promise<OrderMemory> {
  let memory = createOrderMemory({
    orderId: 'order-ready',
    conversationId: 'will-replace',
    itemIds: ['item-1'],
    now: SOURCE.sourceTimestamp,
  });
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'productType',
    value: 'FRAME',
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'profileColor',
    value: 'WHITE',
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'meshType',
    value: 'STANDARD',
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'widthMm',
    value: 1000,
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'heightMm',
    value: 1500,
    source: SOURCE,
  }).memory;
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'measurementBasis',
    value: 'PRODUCT_SIZE',
    source: SOURCE,
  }).memory;
  memory = applyCustomerFact(memory, {
    field: 'phone',
    value: '+79990000000',
    source: SOURCE,
  }).memory;
  memory = applyCustomerFact(memory, {
    field: 'address',
    value: 'Москва',
    source: SOURCE,
  }).memory;
  memory = (await persistTestQuote(memory, 15200)).memory;
  memory = applyCommercialFact(memory, {
    field: 'preliminaryPriceAccepted',
    value: true,
    source: SOURCE,
  }).memory;
  memory = applyCommercialFact(memory, {
    field: 'measurementAgreed',
    value: true,
    source: { ...SOURCE, sourceMessageId: 'msg-2' },
  }).memory;
  return memory;
}

describe('Task 12 application API boundary', () => {
  describe('API-AUTH', () => {
    it('API-AUTH-1 GET /health without token → 200', async () => {
      const { app } = createTestJarvisHarness();
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('API-AUTH-2 internal route without token → 401', async () => {
      const { app } = createTestJarvisHarness();
      const response = await request(app).get('/internal/v1/conversations/x');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('API-AUTH-3 wrong token → 401', async () => {
      const { app } = createTestJarvisHarness();
      const response = await request(app)
        .get('/internal/v1/conversations/x')
        .set('Authorization', 'Bearer wrong-token');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('API-AUTH-4 correct token → allowed', async () => {
      const { app, apiKey } = createTestJarvisHarness();
      const created = await request(app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({});
      expect(created.status).toBe(201);
    });

    it('API-AUTH-5 error/log output never contains token', async () => {
      const { app, apiKey } = createTestJarvisHarness();
      const response = await request(app)
        .get('/internal/v1/conversations/missing')
        .set('Authorization', `Bearer ${apiKey}`);
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain(apiKey);
      expect(JSON.stringify(response.body)).not.toContain(TEST_INTERNAL_API_KEY);

      const unconfigured = createApp(createLogger('error'), {});
      const missingKey = await request(unconfigured).get('/internal/v1/conversations/x');
      expect(missingKey.status).toBe(503);
      expect(missingKey.body.error.code).toBe('INTERNAL_API_NOT_CONFIGURED');
      expect(JSON.stringify(missingKey.body)).not.toMatch(/Bearer|api[_-]?key/i);
    });
  });

  describe('API-CONV', () => {
    it('API-CONV-1 POST conversation → 201 + id', async () => {
      const { app, apiKey } = createTestJarvisHarness();
      const response = await request(app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ channel: 'telegram' });
      expect(response.status).toBe(201);
      expect(response.body.conversationId).toBeTruthy();
      expect(response.body.mode).toBe('AI');
      expect(response.body.channel).toBe('telegram');
    });

    it('API-CONV-2 GET existing → 200', async () => {
      const { app, apiKey } = createTestJarvisHarness();
      const created = await request(app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({});
      const response = await request(app)
        .get(`/internal/v1/conversations/${created.body.conversationId}`)
        .set('Authorization', `Bearer ${apiKey}`);
      expect(response.status).toBe(200);
      expect(response.body.conversationId).toBe(created.body.conversationId);
    });

    it('API-CONV-3 GET unknown → 404', async () => {
      const { app, apiKey } = createTestJarvisHarness();
      const response = await request(app)
        .get('/internal/v1/conversations/does-not-exist')
        .set('Authorization', `Bearer ${apiKey}`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('API-CONV-4 mode AI→HUMAN persisted', async () => {
      const { app, apiKey } = createTestJarvisHarness();
      const created = await request(app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({});
      const response = await request(app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/mode`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ mode: 'HUMAN' });
      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('HUMAN');
    });

    it('API-CONV-5 mode HUMAN→AI persisted', async () => {
      const { app, apiKey } = createTestJarvisHarness();
      const created = await request(app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({});
      await request(app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/mode`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ mode: 'HUMAN' });
      const response = await request(app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/mode`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ mode: 'AI' });
      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('AI');
    });

    it('API-CONV-6 invalid mode → 400', async () => {
      const { app, apiKey } = createTestJarvisHarness();
      const created = await request(app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({});
      const response = await request(app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/mode`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ mode: 'ROBOT' });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MODE_INVALID');
    });
  });

  describe('API-MSG', () => {
    it('API-MSG-1 AI mode customer message → aiReply', async () => {
      const harness = createTestJarvisHarness();
      const created = await request(harness.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({});
      const response = await request(harness.app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'm1', text: 'Здравствуйте' });
      expect(response.status).toBe(200);
      expect(response.body.conversationMode).toBe('AI');
      expect(response.body.duplicate).toBe(false);
      expect(response.body.aiReply?.text).toBe('Тестовый ответ Jarvis');
      expect(harness.llm.requests).toHaveLength(1);
      const messages = await request(harness.app)
        .get(`/internal/v1/conversations/${created.body.conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`);
      expect(messages.body.messages.map((m: { sender: string }) => m.sender)).toEqual([
        'CUSTOMER',
        'AI',
      ]);
    });

    it('API-MSG-2 HUMAN mode → aiReply=null, no LLM/extractor', async () => {
      const harness = createTestJarvisHarness({ includeFactExtractor: true });
      const created = await request(harness.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({});
      await request(harness.app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/mode`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ mode: 'HUMAN' });
      const response = await request(harness.app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'm-human', text: 'нужен менеджер' });
      expect(response.status).toBe(200);
      expect(response.body.conversationMode).toBe('HUMAN');
      expect(response.body.aiReply).toBeNull();
      expect(harness.llm.requests).toHaveLength(0);
      expect(harness.factExtractor.requests).toHaveLength(0);
    });

    it('API-MSG-3 duplicate same messageId/same text → duplicate=true', async () => {
      const harness = createTestJarvisHarness();
      const created = await request(harness.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({});
      const first = await request(harness.app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'dup-1', text: 'повтор' });
      expect(first.body.duplicate).toBe(false);
      const llmCount = harness.llm.requests.length;
      const second = await request(harness.app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'dup-1', text: 'повтор' });
      expect(second.status).toBe(200);
      expect(second.body.duplicate).toBe(true);
      expect(second.body.aiReply?.text).toBe(first.body.aiReply.text);
      expect(harness.llm.requests).toHaveLength(llmCount);
      const messages = await request(harness.app)
        .get(`/internal/v1/conversations/${created.body.conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`);
      expect(messages.body.messages.filter((m: { sender: string }) => m.sender === 'AI')).toHaveLength(
        1,
      );
    });

    it('API-MSG-4 same messageId/different text → 409', async () => {
      const harness = createTestJarvisHarness();
      const created = await request(harness.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({});
      await request(harness.app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'conflict-1', text: 'один' });
      const response = await request(harness.app)
        .post(`/internal/v1/conversations/${created.body.conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'conflict-1', text: 'другой' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('MESSAGE_ID_CONFLICT');
    });

    it('API-MSG-5 unknown conversation → 404', async () => {
      const harness = createTestJarvisHarness();
      const response = await request(harness.app)
        .post('/internal/v1/conversations/missing/messages')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'm1', text: 'привет' });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });
  });

  describe('transcript order', () => {
    it('returns CUSTOMER/AI/HUMAN/CUSTOMER chronological senders without SYSTEM', async () => {
      const harness = createTestJarvisHarness();
      const created = await request(harness.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ channel: 'telegram' });
      const conversationId = created.body.conversationId as string;

      await request(harness.app)
        .post(`/internal/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'c1', text: 'первый' });

      const afterAi = new Date(Date.now() + 1000).toISOString();
      await harness.conversationStore.appendMessage({
        messageId: 'h1',
        conversationId,
        channel: 'telegram',
        sender: 'HUMAN',
        text: 'менеджер здесь',
        createdAt: afterAi,
      });

      await request(harness.app)
        .post(`/internal/v1/conversations/${conversationId}/mode`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ mode: 'HUMAN' });

      await request(harness.app)
        .post(`/internal/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({
          messageId: 'c2',
          text: 'второй',
          createdAt: new Date(Date.now() + 2000).toISOString(),
        });

      const messages = await request(harness.app)
        .get(`/internal/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`);
      expect(messages.body.messages.map((m: { sender: string }) => m.sender)).toEqual([
        'CUSTOMER',
        'AI',
        'HUMAN',
        'CUSTOMER',
      ]);
      expect(
        messages.body.messages.every((m: { sender: string }) => m.sender !== 'SYSTEM'),
      ).toBe(true);
    });
  });

  describe('order-state and measurement-action', () => {
    it('READY_FOR_MEASUREMENT + AUTO_ALLOWED with public quote and no BOM leak', async () => {
      const harness = createTestJarvisHarness();
      const created = await request(harness.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({});
      const conversationId = created.body.conversationId as string;
      let memory = await seedReadyMemory();
      memory = { ...memory, conversationId, orderId: conversationId };
      await harness.orderMemoryStore.save(memory);

      const state = await request(harness.app)
        .get(`/internal/v1/conversations/${conversationId}/order-state`)
        .set('Authorization', `Bearer ${harness.apiKey}`);
      expect(state.status).toBe(200);
      expect(state.body.readiness.status).toBe('READY_FOR_MEASUREMENT');
      expect(state.body.measurementAction.kind).toBe('AUTO_ALLOWED');
      expect(state.body.preliminaryQuote.publicTotalRub).toBe(15200);
      expect(state.body.preliminaryQuote.accepted).toBe(true);
      expect(state.body.preliminaryQuote.current).toBe(true);
      const serialized = JSON.stringify(state.body);
      expect(serialized).not.toMatch(/system prompt|PROOF_CREATE|supplier|BOM|waste|trustedDirect/i);
      expect(serialized).not.toContain('inputFingerprint');

      const action = await request(harness.app)
        .get(`/internal/v1/conversations/${conversationId}/measurement-action`)
        .set('Authorization', `Bearer ${harness.apiKey}`);
      expect(action.body.kind).toBe('AUTO_ALLOWED');
      expect(action.body.draft).toBeTruthy();
      expect(JSON.stringify(action.body)).not.toMatch(/grossProfit|markupPercent|supplier|BOM/i);
    });

    it('profitability EXACT exposes band; PARTIAL omits fake percents', async () => {
      const harness = createTestJarvisHarness();
      const created = await request(harness.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({});
      const conversationId = created.body.conversationId as string;
      let memory = await seedReadyMemory();
      memory = {
        ...memory,
        conversationId,
        orderId: conversationId,
        orderProfitability: {
          costBasisStatus: 'EXACT',
          sellingTotalRub: 10000,
          actualDirectCostRub: 5000,
          grossProfitRub: 5000,
          grossMarginPercent: 50,
          markupPercent: 100,
          profitabilityBand: 'GREEN',
          actualCostCatalogVersion: 'v1',
          computedAt: SOURCE.sourceTimestamp,
        },
      };
      await harness.orderMemoryStore.save(memory);
      const exact = await request(harness.app)
        .get(`/internal/v1/conversations/${conversationId}/order-state`)
        .set('Authorization', `Bearer ${harness.apiKey}`);
      expect(exact.body.profitability).toEqual({
        costBasisStatus: 'EXACT',
        grossProfitRub: 5000,
        grossMarginPercent: 50,
        markupPercent: 100,
        profitabilityBand: 'GREEN',
      });

      memory = {
        ...memory,
        revision: exact.body.memoryRevision,
        orderProfitability: {
          costBasisStatus: 'PARTIAL',
          sellingTotalRub: 10000,
          knownDirectCostSubtotalRub: 2000,
          profitabilityBand: 'UNAVAILABLE',
          missingCostReasons: ['HARDWARE_UNKNOWN'],
          actualCostCatalogVersion: 'v1',
          computedAt: SOURCE.sourceTimestamp,
        },
      };
      await harness.orderMemoryStore.save(memory);
      const partial = await request(harness.app)
        .get(`/internal/v1/conversations/${conversationId}/order-state`)
        .set('Authorization', `Bearer ${harness.apiKey}`);
      expect(partial.body.profitability).toEqual({
        costBasisStatus: 'PARTIAL',
        profitabilityBand: 'UNAVAILABLE',
      });
      expect(partial.body.profitability.grossMarginPercent).toBeUndefined();
      expect(partial.body.profitability.markupPercent).toBeUndefined();
      expect(partial.body.profitability.grossProfitRub).toBeUndefined();
    });

    it('measurement action NOT_READY / AWAITING_OWNER_APPROVAL', async () => {
      const notReady = createTestJarvisHarness();
      const created = await request(notReady.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${notReady.apiKey}`)
        .send({});
      const action = await request(notReady.app)
        .get(`/internal/v1/conversations/${created.body.conversationId}/measurement-action`)
        .set('Authorization', `Bearer ${notReady.apiKey}`);
      expect(action.body.kind).toBe('NOT_READY');
      expect(action.body.draft).toBeUndefined();

      const manual = createTestJarvisHarness({
        measurementActionPolicy: 'ALWAYS_MANUAL',
      });
      const readyConv = await request(manual.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${manual.apiKey}`)
        .send({});
      let memory = await seedReadyMemory();
      memory = {
        ...memory,
        conversationId: readyConv.body.conversationId,
        orderId: readyConv.body.conversationId,
      };
      await manual.orderMemoryStore.save(memory);
      const awaiting = await request(manual.app)
        .get(`/internal/v1/conversations/${readyConv.body.conversationId}/measurement-action`)
        .set('Authorization', `Bearer ${manual.apiKey}`);
      expect(awaiting.body.kind).toBe('AWAITING_OWNER_APPROVAL');
      expect(awaiting.body.draft).toBeTruthy();
    });
  });

  describe('HTTP → Application → Jarvis Core integration', () => {
    it('does not mock application facade and preserves HUMAN silence', async () => {
      const harness = createTestJarvisHarness({ replyText: 'Интеграционный ответ' });
      const created = await request(harness.app)
        .post('/internal/v1/conversations')
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({});
      const conversationId = created.body.conversationId as string;

      const aiTurn = await request(harness.app)
        .post(`/internal/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'int-1', text: 'сколько стоит?' });
      expect(aiTurn.body.aiReply.text).toBe('Интеграционный ответ');

      await request(harness.app)
        .post(`/internal/v1/conversations/${conversationId}/mode`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ mode: 'HUMAN' });

      const humanTurn = await request(harness.app)
        .post(`/internal/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${harness.apiKey}`)
        .send({ messageId: 'int-2', text: 'алло' });
      expect(humanTurn.body.aiReply).toBeNull();
      expect(harness.llm.requests).toHaveLength(1);
    });
  });

  describe('OpenAPI', () => {
    it('parses and contains real route paths', () => {
      const openApiPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../docs/openapi.internal.v1.yaml',
      );
      const doc = parseYaml(readFileSync(openApiPath, 'utf8')) as {
        paths: Record<string, unknown>;
      };
      expect(doc.paths['/internal/v1/conversations']).toBeTruthy();
      expect(doc.paths['/internal/v1/conversations/{conversationId}']).toBeTruthy();
      expect(doc.paths['/internal/v1/conversations/{conversationId}/messages']).toBeTruthy();
      expect(doc.paths['/internal/v1/conversations/{conversationId}/mode']).toBeTruthy();
      expect(doc.paths['/internal/v1/conversations/{conversationId}/order-state']).toBeTruthy();
      expect(
        doc.paths['/internal/v1/conversations/{conversationId}/measurement-action'],
      ).toBeTruthy();
    });
  });
});
