import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  type CalculationRequest,
} from '../src/calculation/index.js';
import { PARITY_PRICE_CATALOG } from './fixtures/calculation-prices.js';
import { describe, expect, it } from 'vitest';

const fixturesRoot = path.dirname(fileURLToPath(import.meta.url));
const parity = JSON.parse(
  readFileSync(path.join(fixturesRoot, 'fixtures/calculation-parity.json'), 'utf8'),
) as {
  cases: Array<{
    caseId: string;
    description: string;
    kind: 'item' | 'order';
    input: Record<string, unknown>;
    expected: Record<string, number>;
  }>;
};

const PRICE_VERSION = 'calc_v2-constants-PRICES@66465b1';

function createEngine() {
  return new SuperMoskitkaCalculationEngine(
    new StaticPriceCatalogProvider({
      version: PRICE_VERSION,
      prices: PARITY_PRICE_CATALOG,
    }),
  );
}

function itemRequest(
  productType: 'FRAME' | 'WING' | 'DOOR' | 'PLISSE_NET',
  overrides: Record<string, unknown> = {},
): CalculationRequest {
  const base = {
    itemId: 'item-1',
    productType,
    widthMm: 1000,
    heightMm: 1500,
    quantity: 1,
    color: 'white',
    meshType: 'standard',
    fastening: 'z_metal',
    frameProfile: '25',
    doorProfile: '42',
    hingesCount: 3,
    hasLatch: true,
    openingType: 'side',
    thresholdType: 'standard',
    handlesCount: 2,
    ...overrides,
  };

  return {
    customerType: 'retail',
    items: [base as CalculationRequest['items'][number]],
  };
}

describe('Calculation Engine', () => {
  it('CALC-1 FRAME with valid params calculates', async () => {
    const result = await createEngine().calculate(itemRequest('FRAME'));
    expect(result.status).toBe('calculated');
    expect(result.total).toBeGreaterThan(0);
    expect(result.items[0]?.productType).toBe('FRAME');
  });

  it('CALC-2 WING calculates', async () => {
    const result = await createEngine().calculate(
      itemRequest('WING', { widthMm: 800, heightMm: 1400 }),
    );
    expect(result.status).toBe('calculated');
    expect(result.items[0]?.productType).toBe('WING');
  });

  it('CALC-3 DOOR without bolt calculates', async () => {
    const result = await createEngine().calculate(
      itemRequest('DOOR', {
        widthMm: 900,
        heightMm: 2100,
        frameProfile: undefined,
      }),
    );
    expect(result.status).toBe('calculated');
    expect(result.items[0]?.productType).toBe('DOOR');
  });

  it('CALC-4 PLISSE_NET calculates', async () => {
    const result = await createEngine().calculate(
      itemRequest('PLISSE_NET', {
        widthMm: 1000,
        heightMm: 2000,
        fastening: undefined,
        frameProfile: undefined,
      }),
    );
    expect(result.status).toBe('calculated');
    expect(result.items[0]?.productType).toBe('PLISSE_NET');
  });

  it('CALC-5 missing required size returns needs_input', async () => {
    const result = await createEngine().calculate(
      itemRequest('FRAME', { widthMm: undefined }),
    );
    expect(result.status).toBe('needs_input');
    expect(result.total).toBeNull();
    expect(result.missingFields.some((field) => field.includes('widthMm'))).toBe(true);
  });

  it('CALC-6 zero/negative size is rejected', async () => {
    const result = await createEngine().calculate(itemRequest('FRAME', { heightMm: 0 }));
    expect(result.status).toBe('needs_input');
    expect(result.total).toBeNull();
    expect(result.missingFields.some((field) => field.includes('heightMm'))).toBe(true);
  });

  it('CALC-7 unsupported product does not invent a price', async () => {
    const result = await createEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'item-1',
          productType: 'ROLL' as unknown as 'FRAME',
          widthMm: 1000,
          heightMm: 1500,
          quantity: 1,
          color: 'white',
          meshType: 'standard',
        },
      ],
    });
    expect(result.status).toBe('unsupported');
    expect(result.total).toBeNull();
  });

  it('CALC-8 dealer customerType does not auto-apply 30% discount', async () => {
    const retail = await createEngine().calculate(itemRequest('FRAME'));
    const dealer = await createEngine().calculate({
      ...itemRequest('FRAME'),
      customerType: 'dealer',
    });
    expect(retail.status).toBe('calculated');
    expect(dealer.status).toBe('calculated');
    expect(dealer.total).toBe(retail.total);
    expect(dealer.orderBreakdown?.discountPercent).toBe(0);
  });

  it('CALC-9 priceVersion comes from PriceCatalogProvider', async () => {
    const result = await createEngine().calculate(itemRequest('FRAME'));
    expect(result.priceVersion).toBe(PRICE_VERSION);
    expect(result.calculationVersion).toBe('supermoskitka-calculation-v1');
  });

  it('CALC-10 result has no internal cost/margin/profit fields', async () => {
    const result = await createEngine().calculate(itemRequest('FRAME'));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/margin|profit|себестоим|costBreakdown|masterAnti/i);
    expect(result).not.toHaveProperty('margin');
    expect(result).not.toHaveProperty('profit');
  });
});

describe('Calculation parity with calc_v2', () => {
  for (const parityCase of parity.cases) {
    it(`${parityCase.caseId} — ${parityCase.description}`, async () => {
      const engine = createEngine();

      if (parityCase.kind === 'item') {
        const input = parityCase.input;
        const result = await engine.calculate({
          customerType: 'retail',
          items: [
            {
              itemId: 'item-1',
              productType: input.productType as 'FRAME' | 'WING' | 'DOOR' | 'PLISSE_NET',
              widthMm: input.widthMm as number,
              heightMm: input.heightMm as number,
              quantity: input.quantity as number,
              color: input.color as 'white',
              meshType: input.meshType as 'standard',
              fastening: input.fastening as 'z_metal' | undefined,
              frameProfile: input.frameProfile as '25' | undefined,
              doorProfile: input.doorProfile as '42' | undefined,
              hingesCount: input.hingesCount as number | undefined,
              hasLatch: input.hasLatch as boolean | undefined,
              openingType: input.openingType as 'side' | 'counter' | undefined,
              thresholdType: input.thresholdType as 'standard' | undefined,
              handlesCount: input.handlesCount as number | undefined,
            },
          ],
        });

        expect(result.status).toBe('calculated');
        expect(result.items[0]?.productTotal).toBe(parityCase.expected.total);
        expect(result.items[0]?.installationTotal).toBe(parityCase.expected.install);
      } else {
        const result = await engine.calculate(parityCase.input as unknown as CalculationRequest);
        expect(result.status).toBe('calculated');
        expect(result.total).toBe(parityCase.expected.grandTotal);
        expect(result.orderBreakdown?.itemsBasePrice).toBe(parityCase.expected.itemsBasePrice);
        expect(result.orderBreakdown?.installTotal).toBe(parityCase.expected.installTotal);
        expect(result.orderBreakdown?.deliveryCost).toBe(parityCase.expected.deliveryCost);
        expect(result.orderBreakdown?.measurementFee).toBe(parityCase.expected.measurementFee);
        expect(result.orderBreakdown?.discountPercent).toBe(parityCase.expected.discountPercent);
        expect(result.orderBreakdown?.paymentSurcharge).toBe(parityCase.expected.paymentSurcharge);
        if (parityCase.expected.discountAmount !== undefined) {
          expect(result.orderBreakdown?.discountAmount).toBe(parityCase.expected.discountAmount);
        }
      }
    });
  }
});
