import { PersistenceDataError, type OrderMemory } from '../src/domain/index.js';
import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  MESH_ACTUAL_COST_RUB_PER_M2,
  MISSING_COST_REASON,
  POLLTEX_INVOICE_NET_RUB_PER_LINEAR_M,
  POLLTEX_VAT_RATE,
  POLLTEX_WIDTH_M,
  PSYCHOLOGICAL_PRICING_ACTIVE,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  calculateFrameBomCost,
  computePolltexGrossCostRubPerM2,
  type CalculationOutcome,
} from '../src/calculation/index.js';
import {
  JARVIS_PERSISTENCE_SCHEMA_VERSION,
  buildOrderMemoryDocument,
  decodeOrderMemoryDocument,
} from '../src/infrastructure/firestore/index.js';
import { buildOrderMemoryContext } from '../src/jarvis/extraction/index.js';
import {
  applyCommercialFact,
  applyCustomerFact,
  applyFulfillmentFact,
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import { computeOrderProfitability } from '../src/jarvis/pricing/profitability-analytics.js';
import {
  buildCalculationRequestFromTrustedPreliminaryInput,
  buildPreliminaryQuoteSnapshot,
  buildTrustedPreliminaryCalculationInput,
  computeFrameOrderDirectCost,
  computeOrderProfitabilitySnapshot,
  decideMeasurementAction,
  evaluateLeadReadiness,
  type TrustedPreliminaryQuoteProof,
} from '../src/jarvis/preliminary/index.js';
import { persistTestQuote } from './helpers/persist-test-quote.js';
import { createProofViaFakeEngine } from './helpers/create-proof-via-fake-engine.js';
import { CalculationTool, projectSafeCalculationOutcome } from '../src/jarvis/tools/index.js';
import { fakeCalculateOrderCall } from '../src/llm/index.js';
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

function calculatedOutcome(total: number): CalculationOutcome {
  return {
    status: 'calculated',
    items: [],
    total,
    warnings: [],
    missingFields: [],
    calculationVersion: 'v',
    priceVersion: 'p',
    businessRulesVersion: 'b',
  };
}

async function proofForMemory(
  memory: OrderMemory,
  total: number,
  deliveryType: 'city' | 'out' | 'pickup' = 'city',
) {
  return createProofViaFakeEngine(memory, total, deliveryType);
}

function frameMemory(fields: Record<string, unknown> = {}, quantity = 1): OrderMemory {
  let memory = createOrderMemory({
    orderId: 'o1',
    conversationId: 'c1',
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
  if (quantity !== 1) {
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field: 'quantity',
      value: quantity,
      source: SOURCE,
    }).memory;
  }
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

describe('Task 11.1.1 profitability analytics without selling mutation', () => {
  describe('PROFIT math', () => {
    it('PROFIT-1 50% margin / 100% markup is GREEN', async () => {
      const snapshot = computeOrderProfitability({
        sellingTotalRub: 8800,
        actualDirectCostRub: 4400,
        costBasisStatus: 'EXACT',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(snapshot.grossProfitRub).toBe(4400);
      expect(snapshot.grossMarginPercent).toBe(50);
      expect(snapshot.markupPercent).toBe(100);
      expect(snapshot.profitabilityBand).toBe('GREEN');
    });

    it('PROFIT-2 yellow band keeps customer price', async () => {
      const snapshot = computeOrderProfitability({
        sellingTotalRub: 8500,
        actualDirectCostRub: 4500,
        costBasisStatus: 'EXACT',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(snapshot.grossProfitRub).toBe(4000);
      expect(snapshot.grossMarginPercent).toBeCloseTo(47.0588235, 5);
      expect(snapshot.markupPercent).toBeCloseTo(88.8888889, 5);
      expect(snapshot.profitabilityBand).toBe('YELLOW');
      expect(snapshot.sellingTotalRub).toBe(8500);
    });

    it('PROFIT-3 red band does not invalidate quote', async () => {
      const snapshot = computeOrderProfitability({
        sellingTotalRub: 8000,
        actualDirectCostRub: 4500,
        costBasisStatus: 'EXACT',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(snapshot.grossMarginPercent).toBe(43.75);
      expect(snapshot.profitabilityBand).toBe('RED');
      expect(snapshot.sellingTotalRub).toBe(8000);
      const quote = await proofForMemory(frameMemory(), 8000);
      expect(quote.ok).toBe(true);
      if (quote.ok) {
        expect(quote.proof.publicTotalRub).toBe(8000);
      }
    });

    it('PROFIT-4 high-margin legacy is not reduced', async () => {
      const snapshot = computeOrderProfitability({
        sellingTotalRub: 15200,
        actualDirectCostRub: 5750,
        costBasisStatus: 'EXACT',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(snapshot.sellingTotalRub).toBe(15200);
      expect(snapshot.profitabilityBand).toBe('GREEN');
      const quote = await proofForMemory(frameMemory(), 15200);
      expect(quote.ok).toBe(true);
      if (quote.ok) {
        expect(quote.proof.publicTotalRub).toBe(15200);
      }
    });
  });

  describe('PRICE-IMMUTABLE', () => {
    it('PRICE-IMMUTABLE-1 legacy 8500 stays 8500', async () => {
      const created = await proofForMemory(frameMemory(), 8500);
      expect(created.ok).toBe(true);
      if (created.ok) {
        expect(created.proof.publicTotalRub).toBe(8500);
      }
    });

    it('PRICE-IMMUTABLE-2 legacy 9000 is not 8970', async () => {
      const created = await proofForMemory(frameMemory(), 9000);
      expect(created.ok).toBe(true);
      if (created.ok) {
        expect(created.proof.publicTotalRub).toBe(9000);
      }
    });

    it('PRICE-IMMUTABLE-3 legacy 9050 is not 8970', async () => {
      const created = await proofForMemory(frameMemory(), 9050);
      expect(created.ok).toBe(true);
      if (created.ok) {
        expect(created.proof.publicTotalRub).toBe(9050);
      }
    });

    it('PRICE-IMMUTABLE-4 actual catalog change does not change legacy selling', async () => {
      const request = {
        customerType: 'retail' as const,
        items: [
          {
            itemId: 'item-1' as const,
            productType: 'FRAME' as const,
            widthMm: 800,
            heightMm: 1600,
            quantity: 1,
            meshType: 'STANDARD' as const,
            color: { kind: 'WHITE' as const },
            fastening: 'Z_METAL' as const,
            frameProfile: '25' as const,
            cornerType: 'PLASTIC' as const,
            handleType: 'PLASTIC' as const,
          },
        ],
        delivery: { type: 'city' as const },
        installation: { enabled: true },
        measurement: { includeFee: true },
        discount: { percent: 0 as const },
        payment: { method: 'cash' as const },
      };
      const before = await createEngine().calculate(request);
      const original = MESH_ACTUAL_COST_RUB_PER_M2.STANDARD;
      MESH_ACTUAL_COST_RUB_PER_M2.STANDARD = 1;
      try {
        const after = await createEngine().calculate(request);
        expect(after.total).toBe(before.total);
        const profitability = computeOrderProfitabilitySnapshot({
          memory: frameMemory(),
          sellingTotalRub: after.total ?? 0,
          deliveryType: 'city',
          computedAt: SOURCE.sourceTimestamp,
        });
        expect(profitability.costBasisStatus).not.toBe('EXACT');
      } finally {
        MESH_ACTUAL_COST_RUB_PER_M2.STANDARD = original;
      }
    });

    it('psychological pricing is not active', async () => {
      expect(PSYCHOLOGICAL_PRICING_ACTIVE).toBe(false);
    });
  });

  describe('incomplete cost does not block quote', () => {
    it('INCOMPLETE-1 WING quote succeeds with unavailable profitability', async () => {
      let memory = createOrderMemory({
        orderId: 'w1',
        conversationId: 'c1',
        itemIds: ['item-1'],
        now: SOURCE.sourceTimestamp,
      });
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'productType',
        value: 'WING',
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'profileColor',
        value: 'WHITE',
        source: SOURCE,
      }).memory;
      const tool = new CalculationTool(createEngine());
      tool.setOrderMemoryContext(memory);
      const result = await tool.execute(
        fakeCalculateOrderCall('wing', {
          mode: 'PRELIMINARY_ALL_IN',
          customerType: 'retail',
          items: [
            {
              itemId: 'item-1',
              productType: 'WING',
              widthMm: 800,
              heightMm: 1600,
              quantity: 1,
              meshType: 'STANDARD',
              color: { kind: 'WHITE' },
              fastening: 'WING_FLAGS',
            },
          ],
          delivery: { type: 'city' },
        }),
      );
      expect(result.status).toBe('calculated');
      expect(result.total).toBe(tool.lastExecuteMeta?.outcome?.total);
      const profitability = computeOrderProfitabilitySnapshot({
        memory,
        sellingTotalRub: result.total ?? 0,
        deliveryType: 'city',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(profitability.costBasisStatus).toBe('UNAVAILABLE');
      expect(profitability.missingCostReasons).toContain(MISSING_COST_REASON.WING_ACTUAL_COST_UNKNOWN);
      expect(profitability.grossMarginPercent).toBeUndefined();
    });

    it('INCOMPLETE-2 mixed order quote succeeds without exact profitability', async () => {
      let memory = createOrderMemory({
        orderId: 'mix1',
        conversationId: 'c1',
        itemIds: ['item-1', 'item-2'],
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
        value: 800,
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'heightMm',
        value: 1600,
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'measurementBasis',
        value: 'PRODUCT_SIZE',
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-2',
        field: 'productType',
        value: 'DOOR',
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-2',
        field: 'profileColor',
        value: 'WHITE',
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-2',
        field: 'widthMm',
        value: 900,
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-2',
        field: 'heightMm',
        value: 2100,
        source: SOURCE,
      }).memory;
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-2',
        field: 'measurementBasis',
        value: 'PRODUCT_SIZE',
        source: SOURCE,
      }).memory;

      const tool = new CalculationTool(createEngine());
      tool.setOrderMemoryContext(memory);
      const result = await tool.execute(
        fakeCalculateOrderCall('mixed', {
          mode: 'PRELIMINARY_ALL_IN',
          customerType: 'retail',
          items: [
            {
              itemId: 'item-1',
              productType: 'FRAME',
              widthMm: 800,
              heightMm: 1600,
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
      const profitability = computeOrderProfitabilitySnapshot({
        memory,
        sellingTotalRub: result.total ?? 0,
        deliveryType: 'city',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(profitability.costBasisStatus).not.toBe('EXACT');
      expect(profitability.grossMarginPercent).toBeUndefined();
    });

    it('INCOMPLETE-3 regional delivery quote succeeds', async () => {
      let memory = frameMemory();
      memory = applyFulfillmentFact(memory, {
        field: 'deliveryType',
        value: 'out',
        source: SOURCE,
      }).memory;
      memory = applyFulfillmentFact(memory, {
        field: 'deliveryKm',
        value: 25,
        source: SOURCE,
      }).memory;
      const tool = new CalculationTool(createEngine());
      tool.setOrderMemoryContext(memory);
      const result = await tool.execute(
        fakeCalculateOrderCall('regional', {
          mode: 'PRELIMINARY_ALL_IN',
          customerType: 'retail',
          items: [
            {
              itemId: 'item-1',
              productType: 'FRAME',
              widthMm: 800,
              heightMm: 1600,
              quantity: 1,
              meshType: 'STANDARD',
              color: { kind: 'WHITE' },
              fastening: 'Z_METAL',
              frameProfile: '25',
              cornerType: 'PLASTIC',
              handleType: 'PLASTIC',
            },
          ],
          delivery: { type: 'out', distanceKm: 25 },
        }),
      );
      expect(result.status).toBe('calculated');
      const profitability = computeOrderProfitabilitySnapshot({
        memory,
        sellingTotalRub: result.total ?? 0,
        deliveryType: 'out',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(profitability.costBasisStatus).toBe('PARTIAL');
      expect(profitability.missingCostReasons).toContain(
        MISSING_COST_REASON.REGIONAL_DELIVERY_DIRECT_COST_UNKNOWN,
      );
    });

    it('INCOMPLETE-4 FRAME 32 never falls back to actual 25 profile cost', async () => {
      const bom25 = calculateFrameBomCost({
        widthMm: 800,
        heightMm: 1600,
        profileColor: 'WHITE',
        meshType: 'STANDARD',
        fastening: 'Z_METAL',
        frameProfile: '25',
        businessRules: CURRENT_BUSINESS_RULES,
      });
      const bom32 = calculateFrameBomCost({
        widthMm: 800,
        heightMm: 1600,
        profileColor: 'WHITE',
        meshType: 'STANDARD',
        fastening: 'Z_METAL',
        frameProfile: '32',
        businessRules: CURRENT_BUSINESS_RULES,
      });
      expect(bom32.profileRub).toBe(0);
      expect(bom32.profileRub).not.toBe(bom25.profileRub);
      expect(bom32.missingCostReasons).toContain(
        MISSING_COST_REASON.FRAME_PROFILE_32_ACTUAL_COST_UNKNOWN,
      );
      const memory = frameMemory({ profileType: '32' });
      const created = await proofForMemory(memory, 12000);
      expect(created.ok).toBe(true);
      const profitability = computeOrderProfitabilitySnapshot({
        memory,
        sellingTotalRub: 12000,
        deliveryType: 'city',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(profitability.costBasisStatus).not.toBe('EXACT');
      expect(profitability.missingCostReasons).toContain(
        MISSING_COST_REASON.FRAME_PROFILE_32_ACTUAL_COST_UNKNOWN,
      );
    });
  });

  describe('pickup, poll-tex, hardware, proof, visibility, readiness', () => {
    it('pickup turns off public measurement and installation', async () => {
      const memory = frameMemory();
      const built = buildTrustedPreliminaryCalculationInput(memory, { type: 'pickup' });
      expect(built.ok).toBe(true);
      if (!built.ok) {
        return;
      }
      const request = buildCalculationRequestFromTrustedPreliminaryInput(built.input);
      expect(request.installation?.enabled).toBe(false);
      expect(request.measurement?.includeFee).toBe(false);
      const direct = computeFrameOrderDirectCost({ memory, deliveryType: 'pickup' });
      expect(direct.ok).toBe(true);
      if (direct.ok) {
        expect(direct.measurementDirectCostRub).toBe(0);
        expect(direct.installationDirectCostRub).toBe(0);
        expect(direct.deliveryDirectCostRub).toBe(0);
      }
    });

    it('Poll-tex actual price is 330.00 ₽/m²', async () => {
      const computed =
        Math.round(
          ((POLLTEX_INVOICE_NET_RUB_PER_LINEAR_M * (1 + POLLTEX_VAT_RATE)) / POLLTEX_WIDTH_M) *
            100,
        ) / 100;
      expect(computed).toBe(330);
      expect(computePolltexGrossCostRubPerM2()).toBe(330);
      expect(MESH_ACTUAL_COST_RUB_PER_M2.ANTIDUST).toBe(330);
    });

    it('HARDWARE missing quantity never becomes an EXACT zero', async () => {
      const memory = frameMemory();
      const profitability = computeOrderProfitabilitySnapshot({
        memory,
        sellingTotalRub: 10000,
        deliveryType: 'city',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(profitability.knownDirectCostSubtotalRub).toBeGreaterThan(0);
      expect(profitability.costBasisStatus).toBe('PARTIAL');
      expect(profitability.grossMarginPercent).toBeUndefined();
      expect(profitability.missingCostReasons).toContain(
        MISSING_COST_REASON.FRAME_HARDWARE_ACTUAL_COST_UNKNOWN,
      );
    });

    it('trusted quote cannot be forged from a plain object', async () => {
      expect(() =>
        buildPreliminaryQuoteSnapshot({
          memory: frameMemory(),
          proof: {
            publicTotalRub: 20000,
            quoteTrustStatus: 'TRUSTED_LEGACY_CALCULATION',
            inputFingerprint: 'fp-test',
          } as unknown as TrustedPreliminaryQuoteProof,
        }),
      ).toThrow(/arbitrary object cannot create trusted readiness quote/);
    });

    it('customer LLM context and SafeToolResult hide internal economics', async () => {
      let memory = frameMemory();
      memory = {
        ...memory,
        orderProfitability: computeOrderProfitabilitySnapshot({
          memory,
          sellingTotalRub: 8000,
          deliveryType: 'city',
          computedAt: SOURCE.sourceTimestamp,
        }),
        preliminaryQuote: {
          quoteId: 'pq_vis',
          inputFingerprint: 'fp',
          publicTotalRub: 8000,
          createdAt: SOURCE.sourceTimestamp,
          pricingPolicyVersion: 'jarvis-pricing-policy-v3',
          quoteTrustStatus: 'TRUSTED_LEGACY_CALCULATION',
        },
      };
      const context = buildOrderMemoryContext(memory);
      expect(context).toContain('publicTotalRub=8000');
      expect(context).not.toMatch(/cost|profit|margin|markup|supplier|waste|payout/i);
      const safe = projectSafeCalculationOutcome(
        {
          ...calculatedOutcome(8000),
          trustedDirectCostRub: 4500,
        },
        'PRELIMINARY_ALL_IN',
        8000,
      );
      expect(JSON.stringify(safe)).not.toMatch(
        /cost|profit|margin|markup|supplier|waste|payout/i,
      );
    });

    it('low-margin accepted quote can still reach READY/AUTO_ALLOWED', async () => {
      let memory = frameMemory({
        widthMm: 1000,
        heightMm: 1500,
        measurementBasis: 'PRODUCT_SIZE',
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
      memory = (await persistTestQuote(memory, 8000)).memory;
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
      const readiness = evaluateLeadReadiness(memory);
      expect(readiness.status).toBe('READY_FOR_MEASUREMENT');
      expect(decideMeasurementAction(memory, 'AUTO_WHEN_READY')).toBe('AUTO_ALLOWED');
    });

    it('unknown persisted quote status is PersistenceDataError', async () => {
      const memory = createOrderMemory({
        orderId: 'o1',
        conversationId: 'c1',
        itemIds: [],
        now: SOURCE.sourceTimestamp,
      });
      expect(() =>
        decodeOrderMemoryDocument(
          buildOrderMemoryDocument(
            {
              ...memory,
              preliminaryQuote: {
                quoteId: 'pq_bad',
                inputFingerprint: 'fp',
                publicTotalRub: 1,
                createdAt: SOURCE.sourceTimestamp,
                pricingPolicyVersion: 'v',
                pricingPolicyStatus: 'NOT_A_STATUS',
              } as never,
            },
            1,
          ),
        ),
      ).toThrow(PersistenceDataError);
      expect(JARVIS_PERSISTENCE_SCHEMA_VERSION).toBe(1);
    });
  });
});
