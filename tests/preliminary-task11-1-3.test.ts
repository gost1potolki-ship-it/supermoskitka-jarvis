import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OrderMemory } from '../src/domain/index.js';
import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
} from '../src/calculation/index.js';
import {
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import {
  TrustedPreliminaryQuoteProof,
  buildCalculationRequestFromTrustedPreliminaryInput,
  buildPreliminaryQuoteSnapshot,
  buildTrustedPreliminaryCalculationInput,
  calculateTrustedPreliminaryQuote,
  computeQuoteInputFingerprintFromTrustedCalculation,
  ESTIMATED_AVERAGE_HEIGHT_MM,
  ESTIMATED_AVERAGE_WIDTH_MM,
  PreliminaryQuoteService,
} from '../src/jarvis/preliminary/index.js';
import { CalculationTool } from '../src/jarvis/tools/index.js';
import { fakeCalculateOrderCall } from '../src/llm/index.js';
import { CURRENT_PRICE_CATALOG } from './fixtures/calculation-prices-current.js';
import { FixedTotalCalculationEngine } from './helpers/fixed-total-engine.js';
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
const GUARDED_SRC = path.resolve(
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

function frameMemory(): OrderMemory {
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
  return memory;
}

describe('Task 11.1.3 final trusted quote provenance', () => {
  it('TRUST-FINAL-1 production barrel has no raw proof factories', () => {
    const barrel = readFileSync(PRELIMINARY_INDEX_PATH, 'utf8');
    expect(barrel).not.toMatch(/createTrustedPreliminaryQuoteProof/);
    expect(barrel).not.toMatch(/createTrustedPreliminaryQuoteProofForTests/);
    expect(barrel).not.toMatch(/fromTrustedLegacyCalculation/);
    expect(barrel).toMatch(/calculateTrustedPreliminaryQuote/);

    const src = readFileSync(GUARDED_SRC, 'utf8');
    expect(src).not.toMatch(/createTrustedPreliminaryQuoteProofForTests/);
    expect(src).not.toMatch(/export function createTrustedPreliminaryQuoteProof/);
  });

  it('TRUST-FINAL-2 createTrustedPreliminaryQuoteProof is not a production export', async () => {
    const preliminary = await import('../src/jarvis/preliminary/index.js');
    expect(
      (preliminary as { createTrustedPreliminaryQuoteProof?: unknown })
        .createTrustedPreliminaryQuoteProof,
    ).toBeUndefined();
    expect(
      (preliminary as { createTrustedPreliminaryQuoteProofForTests?: unknown })
        .createTrustedPreliminaryQuoteProofForTests,
    ).toBeUndefined();
  });

  it('TRUST-FINAL-3 proof totals come only from engine execution', async () => {
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
      expect(calculated.outcome.total).toBe(total);
      expect(calculated.proof?.publicTotalRub).toBe(total);
    }
  });

  it('TRUST-FINAL-4 plain object and forged token are rejected', () => {
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

  it('TRUST-FINAL-5 CalculationTool normal path binds proof to engine total', async () => {
    const memory = frameMemory();
    const tool = new CalculationTool(createEngine());
    tool.setOrderMemoryContext(memory);
    const result = await tool.execute(
      fakeCalculateOrderCall('trust-final-5', {
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
    expect(result.total).toBe(tool.lastExecuteMeta?.outcome?.total);
    expect(tool.lastExecuteMeta?.guardedPrice?.publicTotalRub).toBe(
      tool.lastExecuteMeta?.outcome?.total,
    );

    const persisted = new PreliminaryQuoteService().persistAfterPreliminaryCalculation({
      memory,
      proof: tool.lastExecuteMeta!.guardedPrice!,
      deliveryType: 'city',
    });
    expect(persisted.snapshot.publicTotalRub).toBe(tool.lastExecuteMeta?.outcome?.total);
  });

  it('TRUST-FINAL-6 coordinator always derives engine request from trustedInput', async () => {
    const memory = frameMemory();
    const cityBuilt = buildTrustedPreliminaryCalculationInput(memory, { type: 'city' });
    expect(cityBuilt.ok).toBe(true);
    if (!cityBuilt.ok) {
      return;
    }

    const cityEngine = new FixedTotalCalculationEngine(15200);
    const cityCalculated = await calculateTrustedPreliminaryQuote({
      engine: cityEngine,
      memory,
      trustedInput: cityBuilt.input,
    });
    expect(cityCalculated.ok).toBe(true);
    expect(cityEngine.lastRequest).toEqual(
      buildCalculationRequestFromTrustedPreliminaryInput(cityBuilt.input),
    );
    expect(cityEngine.lastRequest?.items[0]?.widthMm).toBe(ESTIMATED_AVERAGE_WIDTH_MM);
    expect(cityEngine.lastRequest?.items[0]?.heightMm).toBe(ESTIMATED_AVERAGE_HEIGHT_MM);
    expect(cityCalculated.proof?.inputFingerprint).toBe(
      computeQuoteInputFingerprintFromTrustedCalculation(memory, cityBuilt.input),
    );
    expect(cityCalculated.proof?.publicTotalRub).toBe(cityCalculated.outcome.total);

    const pickupBuilt = buildTrustedPreliminaryCalculationInput(memory, { type: 'pickup' });
    expect(pickupBuilt.ok).toBe(true);
    if (!pickupBuilt.ok) {
      return;
    }
    const pickupEngine = new FixedTotalCalculationEngine(9000);
    const pickupCalculated = await calculateTrustedPreliminaryQuote({
      engine: pickupEngine,
      memory,
      trustedInput: pickupBuilt.input,
    });
    expect(pickupCalculated.ok).toBe(true);
    expect(pickupEngine.lastRequest).toEqual(
      buildCalculationRequestFromTrustedPreliminaryInput(pickupBuilt.input),
    );
    expect(pickupEngine.lastRequest?.installation?.enabled).toBe(false);
    expect(pickupEngine.lastRequest?.measurement?.includeFee).toBe(false);
    expect(pickupCalculated.proof?.inputFingerprint).toBe(
      computeQuoteInputFingerprintFromTrustedCalculation(memory, pickupBuilt.input),
    );
  });
});
