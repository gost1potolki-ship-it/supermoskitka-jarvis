import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PersistenceDataError, type OrderMemory } from '../src/domain/index.js';
import {
  ACTUAL_COST_CATALOG_VERSION,
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  MISSING_COST_REASON,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  calculateFrameBomCost,
} from '../src/calculation/index.js';
import {
  buildOrderMemoryDocument,
  decodeOrderMemoryDocument,
} from '../src/infrastructure/firestore/index.js';
import {
  applyCommercialFact,
  applyCustomerFact,
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import {
  TrustedPreliminaryQuoteProof,
  buildPreliminaryQuoteSnapshot,
  buildTrustedPreliminaryCalculationInput,
  calculateTrustedPreliminaryQuote,
  computeFrameOrderDirectCost,
  computeOrderProfitabilitySnapshot,
  decideMeasurementAction,
  evaluateLeadReadiness,
  finalizeFrameOrderProfitability,
  PreliminaryQuoteService,
} from '../src/jarvis/preliminary/index.js';
import { CalculationTool } from '../src/jarvis/tools/index.js';
import { fakeCalculateOrderCall } from '../src/llm/index.js';
import { CURRENT_PRICE_CATALOG } from './fixtures/calculation-prices-current.js';
import { FixedTotalCalculationEngine } from './helpers/fixed-total-engine.js';
import { persistTestQuote } from './helpers/persist-test-quote.js';
import { describe, expect, it } from 'vitest';

const SOURCE = {
  sourceMessageId: 'msg-1',
  sourceChannel: 'telegram' as const,
  sourceTimestamp: '2026-08-13T10:00:00.000Z',
};

const PRELIMINARY_INDEX_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/jarvis/preliminary/index.ts',
);
const GUARDED_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/jarvis/preliminary/guarded-preliminary-price.ts',
);

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

function frameMemory(fields: Record<string, unknown> = {}): OrderMemory {
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

describe('Task 11.1.2 trusted quote & profitability invariants', () => {
  describe('TRUST proof provenance', () => {
    it('TRUST-1 production barrel has no raw proof factories', () => {
      expect(TrustedPreliminaryQuoteProof).toBeDefined();
      const barrel = readFileSync(PRELIMINARY_INDEX_PATH, 'utf8');
      expect(barrel).not.toMatch(/fromTrustedLegacyCalculation/);
      expect(barrel).not.toMatch(/createTrustedPreliminaryQuoteProof/);
      expect(barrel).not.toMatch(/createTrustedPreliminaryQuoteProofForTests/);
      expect(barrel).toMatch(/calculateTrustedPreliminaryQuote/);

      const guarded = readFileSync(GUARDED_PATH, 'utf8');
      expect(guarded).not.toMatch(/createTrustedPreliminaryQuoteProofForTests/);
      expect(guarded).not.toMatch(/static fromTrustedLegacyCalculation/);
      expect(guarded).toMatch(/export async function calculateTrustedPreliminaryQuote/);
    });

    it('TRUST-2 no public createTrustedPreliminaryQuoteProof outcome factory', async () => {
      const preliminary = await import('../src/jarvis/preliminary/index.js');
      expect(
        (preliminary as { createTrustedPreliminaryQuoteProof?: unknown })
          .createTrustedPreliminaryQuoteProof,
      ).toBeUndefined();
    });

    it('TRUST-3 plain object cast is rejected', () => {
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

      expect(
        () =>
          new TrustedPreliminaryQuoteProof(
            Symbol('forged') as never,
            1,
            'TRUSTED_LEGACY_CALCULATION',
            'fake',
            undefined,
            undefined,
          ),
      ).toThrow(/cannot be constructed directly/);
    });

    it('TRUST-4 CalculationTool trusted path creates proof + snapshot', async () => {
      const memory = frameMemory();
      const tool = new CalculationTool(createEngine());
      tool.setOrderMemoryContext(memory);
      const result = await tool.execute(
        fakeCalculateOrderCall('trust-4', {
          mode: 'PRELIMINARY_ALL_IN',
          customerType: 'retail',
          items: [
            {
              itemId: 'item-1',
              productType: 'FRAME',
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
      expect(tool.lastExecuteMeta?.guardedPrice).toBeInstanceOf(TrustedPreliminaryQuoteProof);
      expect(tool.lastExecuteMeta?.guardedPrice?.publicTotalRub).toBe(
        tool.lastExecuteMeta?.outcome?.total,
      );

      const persisted = new PreliminaryQuoteService().persistAfterPreliminaryCalculation({
        memory,
        proof: tool.lastExecuteMeta!.guardedPrice!,
        deliveryType: 'city',
      });
      expect(persisted.snapshot.quoteTrustStatus).toBe('TRUSTED_LEGACY_CALCULATION');
      expect(persisted.snapshot.publicTotalRub).toBe(tool.lastExecuteMeta?.outcome?.total);
    });

    it('TRUST-5 proof totals come from fake engine via coordinator', async () => {
      for (const total of [8500, 9000, 9050, 15200]) {
        const memory = frameMemory();
        const built = buildTrustedPreliminaryCalculationInput(memory, { type: 'city' });
        expect(built.ok).toBe(true);
        if (!built.ok) {
          continue;
        }
        const calculated = await calculateTrustedPreliminaryQuote({
          engine: new FixedTotalCalculationEngine(total),
          memory,
          trustedInput: built.input,
        });
        expect(calculated.ok).toBe(true);
        expect(calculated.proof).toBeDefined();
        expect(calculated.outcome.total).toBe(total);
        expect(calculated.proof?.publicTotalRub).toBe(total);
      }
    });
  });

  describe('PROF-BASIS analytics orchestration', () => {
    it('PROF-BASIS-1 synthetic complete cost → EXACT via orchestration path', () => {
      const snapshot = finalizeFrameOrderProfitability({
        sellingTotalRub: 8800,
        knownDirectCostSubtotalRub: 4400,
        missingCostReasons: [],
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(snapshot.costBasisStatus).toBe('EXACT');
      expect(snapshot.actualDirectCostRub).toBe(4400);
      expect(snapshot.grossProfitRub).toBe(4400);
      expect(snapshot.grossMarginPercent).toBe(50);
      expect(snapshot.markupPercent).toBe(100);
      expect(snapshot.profitabilityBand).toBe('GREEN');
    });

    it('PROF-BASIS-2 incomplete FRAME stays PARTIAL', () => {
      const memory = frameMemory();
      const direct = computeFrameOrderDirectCost({ memory, deliveryType: 'city' });
      expect(direct.ok).toBe(true);
      if (!direct.ok) {
        return;
      }
      expect(direct.costBasisStatus).toBe('PARTIAL');
      expect(direct.knownDirectCostSubtotalRub).toBeGreaterThan(0);
      expect(direct.actualDirectCostRub).toBeUndefined();
      expect(direct.missingCostReasons).toContain(
        MISSING_COST_REASON.FRAME_HARDWARE_ACTUAL_COST_UNKNOWN,
      );

      const profitability = computeOrderProfitabilitySnapshot({
        memory,
        sellingTotalRub: 10000,
        deliveryType: 'city',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(profitability.costBasisStatus).toBe('PARTIAL');
      expect(profitability.knownDirectCostSubtotalRub).toBeGreaterThan(0);
      expect(profitability.actualDirectCostRub).toBeUndefined();
      expect(profitability.grossMarginPercent).toBeUndefined();
      expect(profitability.markupPercent).toBeUndefined();
      expect(profitability.profitabilityBand).toBe('UNAVAILABLE');
    });

    it('PROF-BASIS-3 FRAME32 never falls back to 25mm actual profile cost', () => {
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

      const profitability = computeOrderProfitabilitySnapshot({
        memory: frameMemory({ profileType: '32' }),
        sellingTotalRub: 12000,
        deliveryType: 'city',
        computedAt: SOURCE.sourceTimestamp,
      });
      expect(profitability.costBasisStatus).toBe('PARTIAL');
      expect(profitability.missingCostReasons).toContain(
        MISSING_COST_REASON.FRAME_PROFILE_32_ACTUAL_COST_UNKNOWN,
      );
      expect(profitability.actualDirectCostRub).toBeUndefined();
    });
  });

  describe('CODEC strict migration + EXACT profitability', () => {
    it('CODEC-1 valid quoteTrustStatus + invalid legacy pricingPolicyStatus fails', () => {
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
                publicTotalRub: 1000,
                createdAt: SOURCE.sourceTimestamp,
                pricingPolicyVersion: 'v',
                quoteTrustStatus: 'TRUSTED_LEGACY_CALCULATION',
                pricingPolicyStatus: 'GARBAGE',
              } as never,
            },
            1,
          ),
        ),
      ).toThrow(PersistenceDataError);
    });

    it('CODEC-2 EXACT missing actualDirectCostRub fails', () => {
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
              orderProfitability: {
                costBasisStatus: 'EXACT',
                sellingTotalRub: 8800,
                grossProfitRub: 4400,
                grossMarginPercent: 50,
                markupPercent: 100,
                profitabilityBand: 'GREEN',
                actualCostCatalogVersion: ACTUAL_COST_CATALOG_VERSION,
                computedAt: SOURCE.sourceTimestamp,
              } as never,
            },
            1,
          ),
        ),
      ).toThrow(PersistenceDataError);
    });

    it('CODEC-3 EXACT with UNAVAILABLE band fails', () => {
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
              orderProfitability: {
                costBasisStatus: 'EXACT',
                sellingTotalRub: 8800,
                actualDirectCostRub: 4400,
                grossProfitRub: 4400,
                grossMarginPercent: 50,
                markupPercent: 100,
                profitabilityBand: 'UNAVAILABLE',
                actualCostCatalogVersion: ACTUAL_COST_CATALOG_VERSION,
                computedAt: SOURCE.sourceTimestamp,
              } as never,
            },
            1,
          ),
        ),
      ).toThrow(PersistenceDataError);
    });

    it('CODEC-4 valid EXACT snapshot round-trips', () => {
      const memory = createOrderMemory({
        orderId: 'o1',
        conversationId: 'c1',
        itemIds: [],
        now: SOURCE.sourceTimestamp,
      });
      const withProfit = {
        ...memory,
        orderProfitability: {
          costBasisStatus: 'EXACT' as const,
          sellingTotalRub: 8800,
          actualDirectCostRub: 4400,
          knownDirectCostSubtotalRub: 4400,
          grossProfitRub: 4400,
          grossMarginPercent: 50,
          markupPercent: 100,
          profitabilityBand: 'GREEN' as const,
          actualCostCatalogVersion: ACTUAL_COST_CATALOG_VERSION,
          computedAt: SOURCE.sourceTimestamp,
        },
      };
      const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(withProfit, 1)).memory;
      expect(decoded.orderProfitability).toEqual(withProfit.orderProfitability);
    });

    it('CODEC-5 valid PARTIAL snapshot round-trips', () => {
      const memory = createOrderMemory({
        orderId: 'o1',
        conversationId: 'c1',
        itemIds: [],
        now: SOURCE.sourceTimestamp,
      });
      const withProfit = {
        ...memory,
        orderProfitability: {
          costBasisStatus: 'PARTIAL' as const,
          sellingTotalRub: 10000,
          knownDirectCostSubtotalRub: 5000,
          profitabilityBand: 'UNAVAILABLE' as const,
          missingCostReasons: [MISSING_COST_REASON.FRAME_HARDWARE_ACTUAL_COST_UNKNOWN],
          actualCostCatalogVersion: ACTUAL_COST_CATALOG_VERSION,
          computedAt: SOURCE.sourceTimestamp,
        },
      };
      const decoded = decodeOrderMemoryDocument(buildOrderMemoryDocument(withProfit, 1)).memory;
      expect(decoded.orderProfitability).toEqual(withProfit.orderProfitability);
    });
  });

  describe('readiness with non-blocking profitability', () => {
    it('RED/PARTIAL profitability does not block READY/AUTO_ALLOWED', async () => {
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
      memory = {
        ...memory,
        orderProfitability: finalizeFrameOrderProfitability({
          sellingTotalRub: 8000,
          knownDirectCostSubtotalRub: 4500,
          missingCostReasons: [],
          computedAt: SOURCE.sourceTimestamp,
        }),
      };
      expect(memory.orderProfitability?.profitabilityBand).toBe('RED');
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
      expect(evaluateLeadReadiness(memory).status).toBe('READY_FOR_MEASUREMENT');
      expect(decideMeasurementAction(memory, 'AUTO_WHEN_READY')).toBe('AUTO_ALLOWED');
    });
  });
});
