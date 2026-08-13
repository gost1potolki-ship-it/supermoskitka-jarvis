import { getFactValue, type OrderMemory } from '../src/domain/index.js';
import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
} from '../src/calculation/index.js';
import {
  FakeFactExtractor,
  applyValidatedExtraction,
  buildOrderMemoryContext,
  emptyExtraction,
  type FactExtractionRequest,
} from '../src/jarvis/extraction/index.js';
import {
  applyCommercialFact,
  applyCustomerFact,
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import {
  ESTIMATED_AVERAGE_HEIGHT_MM,
  ESTIMATED_AVERAGE_WIDTH_MM,
  PreliminaryQuoteService,
  TrustedPreliminaryQuoteProof,
  applyMarginGuard,
  buildMeasurementDraft,
  computeQuoteInputFingerprintFromMemory,
  decideMeasurementAction,
  evaluateLeadReadiness,
  resolveItemCalculationSize,
} from '../src/jarvis/preliminary/index.js';
import { CalculationTool, ToolRuntime, projectSafeCalculationOutcome } from '../src/jarvis/tools/index.js';
import { ConversationOrchestrator } from '../src/jarvis/conversation/index.js';
import { FakeSystemPromptProvider } from '../src/jarvis/fake-system-prompt-provider.js';
import {
  FakeToolCallingLlmProvider,
  fakeCalculateOrderCall,
} from '../src/llm/index.js';
import {
  buildOrderMemoryDocument,
  decodeOrderMemoryDocument,
  InMemoryFirestoreGateway,
  createPersistentJarvisRuntime,
} from '../src/infrastructure/firestore/index.js';
import { InMemoryConversationStore, InMemoryOrderMemoryStore } from '../src/storage/index.js';
import { CURRENT_PRICE_CATALOG } from './fixtures/calculation-prices-current.js';
import { describe, expect, it } from 'vitest';

const SOURCE = {
  sourceMessageId: 'msg-1',
  sourceChannel: 'telegram' as const,
  sourceTimestamp: '2026-08-13T10:00:00.000Z',
};

function createEngine() {
  return new SuperMoskitkaCalculationEngine(
    new StaticPriceCatalogProvider({
      version: 'current-prices-base@66465b1',
      prices: CURRENT_PRICE_CATALOG,
      businessRulesVersion: CURRENT_BUSINESS_RULES_VERSION,
      businessRules: CURRENT_BUSINESS_RULES,
    }),
  );
}

function memoryWithItem(productType: string, fields: Record<string, unknown> = {}): OrderMemory {
  let memory = createOrderMemory({
    orderId: 'o1',
    conversationId: 'c1',
    itemIds: ['item-1'],
    now: SOURCE.sourceTimestamp,
  });
  memory = applyOrderItemFact(memory, {
    orderItemId: 'item-1',
    field: 'productType',
    value: productType,
    source: SOURCE,
  }).memory;
  for (const [field, value] of Object.entries(fields)) {
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: field as never,
      value: value as never,
      source: SOURCE,
    }).memory;
  }
  return memory;
}

function persistQuote(memory: OrderMemory, publicTotalRub: number) {
  const service = new PreliminaryQuoteService();
  return service.persistAfterPreliminaryCalculation({
    memory,
    proof: TrustedPreliminaryQuoteProof.fromTrustedLegacyCalculation({
      publicTotalRub,
      inputFingerprint: computeQuoteInputFingerprintFromMemory(memory),
    }),
  });
}

function extractionRequest(memory: OrderMemory, text: string): FactExtractionRequest {
  return {
    conversationId: memory.conversationId,
    currentMessage: {
      id: 'msg-1',
      text,
      channel: 'telegram',
      timestamp: SOURCE.sourceTimestamp,
    },
    memorySnapshot: memory,
    recentContext: [],
  };
}

describe('Task 11 preliminary core', () => {
  describe('SIZE rules', () => {
    it('SIZE-1 FRAME without sizes → ESTIMATED_AVERAGE 800×1600', () => {
      const memory = memoryWithItem('FRAME');
      const size = resolveItemCalculationSize(memory.items[0]!);
      expect(size.source).toBe('ESTIMATED_AVERAGE');
      expect(size.widthMm).toBe(ESTIMATED_AVERAGE_WIDTH_MM);
      expect(size.heightMm).toBe(ESTIMATED_AVERAGE_HEIGHT_MM);
      expect(getFactValue(memory.items[0]?.widthMm)).toBeUndefined();
    });

    it('SIZE-2 WING without sizes → ESTIMATED_AVERAGE', () => {
      const size = resolveItemCalculationSize(memoryWithItem('WING').items[0]!).source;
      expect(size).toBe('ESTIMATED_AVERAGE');
    });

    it('SIZE-3 DOOR without sizes → NEEDS_INPUT', () => {
      expect(resolveItemCalculationSize(memoryWithItem('DOOR').items[0]!).source).toBe(
        'NEEDS_INPUT',
      );
    });

    it('SIZE-4 PLISSE_NET without sizes → NEEDS_INPUT', () => {
      expect(resolveItemCalculationSize(memoryWithItem('PLISSE_NET').items[0]!).source).toBe(
        'NEEDS_INPUT',
      );
    });

    it('SIZE-5 sizes without basis → NEEDS_SIZE_BASIS', () => {
      const size = resolveItemCalculationSize(
        memoryWithItem('FRAME', { widthMm: 1000, heightMm: 1500 }).items[0]!,
      );
      expect(size.source).toBe('NEEDS_SIZE_BASIS');
    });

    it('SIZE-6 PRODUCT_SIZE uses customer dimensions as-is', () => {
      const size = resolveItemCalculationSize(
        memoryWithItem('FRAME', {
          widthMm: 1000,
          heightMm: 1500,
          measurementBasis: 'PRODUCT_SIZE',
        }).items[0]!,
      );
      expect(size.source).toBe('PRODUCT_SIZE');
      expect(size.widthMm).toBe(1000);
      expect(size.heightMm).toBe(1500);
    });

    it('SIZE-7 LIGHT_OPENING adds +40 without changing memory facts', () => {
      const memory = memoryWithItem('FRAME', {
        widthMm: 1000,
        heightMm: 1500,
        measurementBasis: 'LIGHT_OPENING',
      });
      const size = resolveItemCalculationSize(memory.items[0]!);
      expect(size.source).toBe('LIGHT_OPENING');
      expect(size.widthMm).toBe(1040);
      expect(size.heightMm).toBe(1540);
      expect(getFactValue(memory.items[0]?.widthMm)).toBe(1000);
    });

    it('SIZE-8 partial dimensions → NEEDS_INPUT', () => {
      expect(
        resolveItemCalculationSize(memoryWithItem('FRAME', { widthMm: 1000 }).items[0]!).source,
      ).toBe('NEEDS_INPUT');
    });
  });

  describe('MARGIN guard', () => {
    it('MARGIN-1 passes when margin >= 47%', () => {
      const result = applyMarginGuard({ publicTotalRub: 10000, trustedDirectCostRub: 5000 });
      expect(result.ok).toBe(true);
      expect(result.publicTotalRub).toBe(10000);
      expect(result.adjusted).toBe(false);
    });

    it('MARGIN-2 below floor does not change customer price', () => {
      const result = applyMarginGuard({ publicTotalRub: 10000, trustedDirectCostRub: 6000 });
      expect(result.ok).toBe(true);
      expect(result.publicTotalRub).toBe(10000);
      expect(result.adjusted).toBe(false);
    });

    it('MARGIN-3 never lowers price', () => {
      const result = applyMarginGuard({ publicTotalRub: 20000, trustedDirectCostRub: 6000 });
      expect(result.publicTotalRub).toBe(20000);
    });

    it('MARGIN-4 unavailable direct cost does not block or mutate price', () => {
      const result = applyMarginGuard({ publicTotalRub: 10000, trustedDirectCostRub: undefined });
      expect(result.ok).toBe(true);
      expect(result.publicTotalRub).toBe(10000);
      expect(result.code).toBe('MARGIN_COST_BASIS_UNAVAILABLE');
    });

    it('MARGIN-5 engine exposes trustedDirectCostRub', async () => {
      const outcome = await createEngine().calculate({
        customerType: 'retail',
        items: [
          {
            itemId: 'item-1',
            productType: 'FRAME',
            widthMm: 1000,
            heightMm: 1500,
            quantity: 1,
            meshType: 'STANDARD',
            color: { kind: 'WHITE' },
            fastening: 'Z_METAL',
            frameProfile: '25',
            cornerType: 'PLASTIC',
            handleType: 'PLASTIC',
          },
        ],
        delivery: { type: 'pickup' },
        installation: { enabled: false },
        measurement: { includeFee: false },
        discount: { percent: 0 },
        payment: { method: 'cash' },
      });
      expect(outcome.trustedDirectCostRub).toBeGreaterThan(0);
      expect(outcome.items[0]?.directCost).toBeGreaterThan(0);
    });

    it('MARGIN-6 PRELIMINARY_ALL_IN tool applies margin without leaking cost', async () => {
      const tool = new CalculationTool(createEngine());
      const result = await tool.execute(
        fakeCalculateOrderCall('call-margin-6', {
          mode: 'PRELIMINARY_ALL_IN',
          customerType: 'retail',
          items: [
            {
              itemId: 'item-1',
              productType: 'FRAME',
              widthMm: 1000,
              heightMm: 1500,
              quantity: 1,
              meshType: 'STANDARD',
              color: { kind: 'WHITE' },
              fastening: 'Z_METAL',
              frameProfile: '25',
              cornerType: 'PLASTIC',
              handleType: 'PLASTIC',
            },
          ],
          delivery: { type: 'city' },
        }),
      );
      expect(result.status).toBe('calculated');
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/trustedDirectCost|directCost|margin|себестоим/i);
    });

    it('MARGIN-7 safe projection never includes economics fields', () => {
      const safe = projectSafeCalculationOutcome(
        {
          status: 'calculated',
          items: [],
          total: 10000,
          warnings: [],
          missingFields: [],
          calculationVersion: 'v',
          priceVersion: 'p',
          businessRulesVersion: 'b',
          trustedDirectCostRub: 4000,
        },
        'PRELIMINARY_ALL_IN',
        10000,
      );
      expect(JSON.stringify(safe)).not.toMatch(/trustedDirectCost|directCost/i);
    });
  });

  describe('ACCEPT commercial facts', () => {
    it('ACCEPT-1 preliminaryPriceAccepted=true binds quote id', () => {
      let memory = memoryWithItem('FRAME', { profileColor: 'WHITE' });
      const quoted = persistQuote(memory, 18500);
      memory = quoted.memory;
      memory = applyCommercialFact(memory, {
        field: 'preliminaryPriceAccepted',
        value: true,
        source: SOURCE,
      }).memory;
      expect(memory.acceptedPreliminaryQuoteId).toBe(memory.preliminaryQuote?.quoteId);
    });

    it('ACCEPT-2 preliminaryPriceAccepted=false clears binding', () => {
      let memory = memoryWithItem('FRAME', { profileColor: 'WHITE' });
      memory = applyCommercialFact(memory, {
        field: 'preliminaryPriceAccepted',
        value: true,
        source: SOURCE,
      }).memory;
      memory = applyCommercialFact(memory, {
        field: 'preliminaryPriceAccepted',
        value: false,
        source: { ...SOURCE, sourceMessageId: 'msg-2' },
      }).memory;
      expect(memory.acceptedPreliminaryQuoteId).toBeUndefined();
    });

    it('ACCEPT-3 extraction applies commercialFacts EXPLICIT only', () => {
      const memory = memoryWithItem('FRAME');
      const applied = applyValidatedExtraction(
        memory,
        {
          itemProposals: [],
          customerFacts: [],
          fulfillmentFacts: [],
          commercialFacts: [
            {
              field: 'measurementAgreed',
              value: true,
              explicitness: 'EXPLICIT',
              evidenceText: 'давайте на замер',
            },
          ],
          issues: [],
        },
        extractionRequest(memory, 'Ок, давайте на замер.'),
      );
      expect(getFactValue(applied.memory.commercial?.measurementAgreed)).toBe(true);
    });

    it('ACCEPT-4 UNCERTAIN commercial fact skipped', () => {
      const memory = memoryWithItem('FRAME');
      const applied = applyValidatedExtraction(
        memory,
        {
          itemProposals: [],
          customerFacts: [],
          fulfillmentFacts: [],
          commercialFacts: [
            {
              field: 'preliminaryPriceAccepted',
              value: true,
              explicitness: 'UNCERTAIN',
              evidenceText: 'наверное устроит',
            },
          ],
          issues: [],
        },
        extractionRequest(memory, 'Наверное устроит.'),
      );
      expect(applied.memory.commercial?.preliminaryPriceAccepted).toBeUndefined();
    });

    it('ACCEPT-5 monetary amount forbidden as fact field', () => {
      const memory = memoryWithItem('FRAME');
      const applied = applyValidatedExtraction(
        memory,
        {
          itemProposals: [],
          customerFacts: [
            {
              field: 'preliminaryTotal' as never,
              value: 18500,
              explicitness: 'EXPLICIT',
              evidenceText: '18500',
            },
          ],
          fulfillmentFacts: [],
          commercialFacts: [],
          issues: [],
        },
        extractionRequest(memory, '18500 рублей'),
      );
      expect(applied.diagnostics.issues.some((issue) => issue.code === 'PRICE_FIELD_FORBIDDEN')).toBe(
        true,
      );
    });

    it('ACCEPT-6 measurementAgreed independent from price acceptance', () => {
      let memory = memoryWithItem('FRAME');
      memory = applyCommercialFact(memory, {
        field: 'measurementAgreed',
        value: true,
        source: SOURCE,
      }).memory;
      expect(getFactValue(memory.commercial?.preliminaryPriceAccepted)).toBeUndefined();
      expect(getFactValue(memory.commercial?.measurementAgreed)).toBe(true);
    });
  });

  describe('QUOTE snapshot', () => {
    it('QUOTE-1 service creates snapshot with quoteTrustStatus', () => {
      const { memory, snapshot } = persistQuote(
        memoryWithItem('FRAME', { profileColor: 'WHITE' }),
        20000,
      );
      expect(snapshot.quoteTrustStatus).toBe('TRUSTED_LEGACY_CALCULATION');
      expect(memory.preliminaryQuote?.quoteId).toMatch(/^pq_/);
    });

    it('QUOTE-2 fingerprint stable for same memory', () => {
      const memory = memoryWithItem('FRAME', { meshType: 'STANDARD', profileColor: 'WHITE' });
      const a = computeQuoteInputFingerprintFromMemory(memory);
      const b = computeQuoteInputFingerprintFromMemory(structuredClone(memory));
      expect(a).toBe(b);
    });

    it('QUOTE-3 fingerprint changes when price-relevant field changes', () => {
      let memory = memoryWithItem('FRAME', { profileColor: 'WHITE' });
      const before = computeQuoteInputFingerprintFromMemory(memory);
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'profileColor',
        value: 'GRAY_7016',
        source: { ...SOURCE, sourceMessageId: 'msg-2' },
      }).memory;
      expect(computeQuoteInputFingerprintFromMemory(memory)).not.toBe(before);
    });

    it('QUOTE-4 new quote clears stale acceptance binding', () => {
      let memory = memoryWithItem('FRAME', { profileColor: 'WHITE' });
      memory = persistQuote(memory, 18000).memory;
      memory = applyCommercialFact(memory, {
        field: 'preliminaryPriceAccepted',
        value: true,
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'meshType',
        value: 'ANTIMOSHKA',
        source: { ...SOURCE, sourceMessageId: 'msg-3' },
      }).memory;
      memory = persistQuote(memory, 19000).memory;
      expect(memory.acceptedPreliminaryQuoteId).toBeUndefined();
    });

    it('QUOTE-5 memory context shows quote public total not direct cost', () => {
      const memory = persistQuote(memoryWithItem('FRAME', { profileColor: 'WHITE' }), 18500).memory;
      const context = buildOrderMemoryContext(memory);
      expect(context).toContain('publicTotalRub=18500');
      expect(context).not.toMatch(/directCost|margin|trustedDirect/i);
    });

    it('QUOTE-6 codec round-trip preliminary quote', () => {
      const memory = persistQuote(memoryWithItem('FRAME', { profileColor: 'WHITE' }), 17500).memory;
      const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(memory, 1)).memory;
      expect(decoded.preliminaryQuote?.publicTotalRub).toBe(17500);
      expect(decoded.preliminaryQuote?.quoteTrustStatus).toBe('TRUSTED_LEGACY_CALCULATION');
    });
  });

  describe('READY readiness', () => {
    function readyMemory(): OrderMemory {
      let memory = memoryWithItem('FRAME', {
        widthMm: 1000,
        heightMm: 1500,
        measurementBasis: 'PRODUCT_SIZE',
        profileColor: 'WHITE',
      });
      memory = applyCustomerFact(memory, {
        field: 'phone',
        value: '+79990000000',
        source: SOURCE,
      }).memory;
      memory = applyCustomerFact(memory, {
        field: 'address',
        value: 'Москва, ул. Тестовая 1',
        source: SOURCE,
      }).memory;
      memory = persistQuote(memory, 20000).memory;
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

    it('READY-1 full gates → READY_FOR_MEASUREMENT', () => {
      expect(evaluateLeadReadiness(readyMemory()).status).toBe('READY_FOR_MEASUREMENT');
    });

    it('READY-2 missing quote → QUOTE_MISSING', () => {
      const readiness = evaluateLeadReadiness(memoryWithItem('FRAME'));
      expect(readiness.blockingCodes).toContain('QUOTE_MISSING');
    });

    it('READY-3 missing price acceptance', () => {
      let memory = readyMemory();
      memory = {
        ...memory,
        commercial: {
          measurementAgreed: memory.commercial?.measurementAgreed,
        },
      };
      memory = persistQuote(memory, 20000).memory;
      expect(evaluateLeadReadiness(memory).blockingCodes).toContain('PRICE_NOT_ACCEPTED');
    });

    it('READY-4 missing measurement agreement', () => {
      let memory = readyMemory();
      memory = {
        ...memory,
        commercial: {
          preliminaryPriceAccepted: memory.commercial?.preliminaryPriceAccepted,
        },
      };
      expect(evaluateLeadReadiness(memory).blockingCodes).toContain('MEASUREMENT_NOT_AGREED');
    });

    it('READY-5 missing phone', () => {
      let memory = readyMemory();
      memory = { ...memory, customer: { address: memory.customer?.address } };
      expect(evaluateLeadReadiness(memory).blockingCodes).toContain('CONTACT_MISSING');
    });

    it('READY-6 missing address', () => {
      let memory = readyMemory();
      memory = { ...memory, customer: { phone: memory.customer?.phone } };
      expect(evaluateLeadReadiness(memory).blockingCodes).toContain('ADDRESS_MISSING');
    });

    it('READY-7 stale quote after param change', () => {
      let memory = readyMemory();
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'profileColor',
        value: 'GRAY_7016',
        source: { ...SOURCE, sourceMessageId: 'msg-4' },
      }).memory;
      expect(evaluateLeadReadiness(memory).blockingCodes).toContain('QUOTE_STALE');
    });

    it('READY-8 NEEDS_SIZE_BASIS blocks', () => {
      const readiness = evaluateLeadReadiness(
        memoryWithItem('FRAME', { widthMm: 1000, heightMm: 1500 }),
      );
      expect(readiness.blockingCodes).toContain('NEEDS_SIZE_BASIS');
    });

    it('READY-9 color change WHITE vs GRAY_7016 preserved in readiness path', () => {
      let memory = memoryWithItem('FRAME', { profileColor: 'WHITE' });
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'profileColor',
        value: 'GRAY_7016',
        source: { ...SOURCE, sourceMessageId: 'msg-5' },
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'ral',
        value: '7016',
        source: { ...SOURCE, sourceMessageId: 'msg-5' },
      }).memory;
      expect(getFactValue(memory.items[0]?.profileColor)).toBe('GRAY_7016');
      expect(getFactValue(memory.items[0]?.profileColor)).not.toBe('WHITE');
    });

    it('READY-10 Firestore restart preserves readiness inputs', async () => {
      const { orderMemoryStore } = createPersistentJarvisRuntime({
        gateway: new InMemoryFirestoreGateway(),
      });
      const memory = readyMemory();
      await orderMemoryStore.save(memory);
      const loaded = await orderMemoryStore.get('c1');
      expect(evaluateLeadReadiness(loaded!).blockingCodes).not.toContain('QUOTE_MISSING');
      expect(getFactValue(loaded?.customer?.phone)).toBe('+79990000000');
    });
  });

  describe('ACTION policy', () => {
    it('ACTION-1 AUTO_WHEN_READY + ready → AUTO_ALLOWED', () => {
      expect(decideMeasurementAction(readyFixture(), 'AUTO_WHEN_READY')).toBe('AUTO_ALLOWED');
    });

    it('ACTION-2 not ready → NOT_READY', () => {
      expect(decideMeasurementAction(memoryWithItem('FRAME'), 'AUTO_WHEN_READY')).toBe('NOT_READY');
    });

    it('ACTION-3 ALWAYS_MANUAL → AWAITING_OWNER_APPROVAL', () => {
      expect(decideMeasurementAction(readyFixture(), 'ALWAYS_MANUAL')).toBe(
        'AWAITING_OWNER_APPROVAL',
      );
    });

    it('ACTION-4 DISABLED → NOT_READY', () => {
      expect(decideMeasurementAction(readyFixture(), 'DISABLED')).toBe('NOT_READY');
    });

    it('ACTION-5 measurement draft has no cost fields', () => {
      const draft = buildMeasurementDraft(readyFixture());
      expect(JSON.stringify(draft)).not.toMatch(/directCost|margin|publicTotalRub/i);
      expect(draft.items[0]?.widthMm).toBe(1000);
    });
  });

  describe('Orchestrator integration', () => {
    it('HUMAN mode still skips LLM', async () => {
      const store = new InMemoryConversationStore();
      await store.createConversation({
        conversationId: 'conv-h',
        channel: 'telegram',
        customerId: 'c',
        mode: 'HUMAN',
        createdAt: SOURCE.sourceTimestamp,
        updatedAt: SOURCE.sourceTimestamp,
      });
      const llm = new FakeToolCallingLlmProvider([{ type: 'text', text: 'nope' }]);
      const orchestrator = new ConversationOrchestrator(
        store,
        llm,
        new FakeSystemPromptProvider('SYS'),
        {
          toolRuntime: new ToolRuntime(new CalculationTool(createEngine())),
          factExtractor: new FakeFactExtractor([emptyExtraction()]),
          orderMemoryStore: new InMemoryOrderMemoryStore(),
        },
      );
      const result = await orchestrator.handleIncomingMessage({
        conversationId: 'conv-h',
        messageId: 'm1',
        text: 'привет',
      });
      expect(result.status).toBe('human_owned');
      expect(llm.requests).toHaveLength(0);
    });
  });
});

function readyFixture(): OrderMemory {
  let memory = memoryWithItem('FRAME', {
    widthMm: 1000,
    heightMm: 1500,
    measurementBasis: 'PRODUCT_SIZE',
    profileColor: 'WHITE',
  });
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
  memory = persistQuote(memory, 20000).memory;
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
