import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEGACY_PARITY_BUSINESS_RULES,
  LEGACY_PARITY_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  type CalculationItemInput,
  type CalculationRequest,
} from '../src/calculation/index.js';
import { LEGACY_PARITY_PRICE_CATALOG } from './fixtures/calculation-prices-legacy.js';
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

function createLegacyEngine() {
  return new SuperMoskitkaCalculationEngine(
    new StaticPriceCatalogProvider({
      version: PRICE_VERSION,
      prices: LEGACY_PARITY_PRICE_CATALOG,
      businessRulesVersion: LEGACY_PARITY_BUSINESS_RULES_VERSION,
      businessRules: LEGACY_PARITY_BUSINESS_RULES,
    }),
  );
}

function colorWhite() {
  return { kind: 'WHITE' as const };
}

function toPublicItem(raw: Record<string, unknown>, itemId = 'item-1'): CalculationItemInput {
  const productType = raw.productType as CalculationItemInput['productType'];
  const meshRaw = String(raw.meshType ?? 'standard');
  const meshType =
    meshRaw === 'anticat' || meshRaw === 'ANTICAT'
      ? 'ANTICAT'
      : meshRaw === 'antimoshka' || meshRaw === 'ANTIMOSHKA'
        ? 'ANTIMOSHKA'
        : meshRaw === 'antipyl' || meshRaw === 'ANTIDUST'
          ? 'ANTIDUST'
          : 'STANDARD';

  const base = {
    itemId,
    widthMm: raw.widthMm as number,
    heightMm: raw.heightMm as number,
    quantity: raw.quantity as number,
    meshType: meshType as 'STANDARD',
    color: colorWhite(),
  };

  if (productType === 'FRAME') {
    return {
      ...base,
      productType: 'FRAME',
      fastening: 'Z_METAL',
      frameProfile: (raw.frameProfile as '25' | '32') ?? '25',
      cornerType: 'PLASTIC',
      handleType: 'PLASTIC',
    };
  }
  if (productType === 'WING') {
    return {
      ...base,
      productType: 'WING',
      fastening: 'WING_FLAGS',
    };
  }
  if (productType === 'DOOR') {
    return {
      ...base,
      productType: 'DOOR',
      doorProfile: (raw.doorProfile as '32' | '42') ?? '42',
      hingesCount: (raw.hingesCount as 2 | 3) ?? 3,
    };
  }
  return {
    ...base,
    productType: 'PLISSE_NET',
    openingType:
      raw.openingType === 'counter' ? 'COUNTER' : raw.openingType === 'up' ? 'UP' : 'SIDE',
    thresholdType: 'STANDARD',
    handlesCount: (raw.handlesCount as number) ?? 2,
  };
}

function itemRequest(
  productType: CalculationItemInput['productType'],
  overrides: Partial<CalculationItemInput> = {},
): CalculationRequest {
  const base = toPublicItem({
    productType,
    widthMm: 1000,
    heightMm: 1500,
    quantity: 1,
    meshType: 'standard',
    frameProfile: '25',
    doorProfile: '42',
    hingesCount: 3,
    openingType: 'side',
    handlesCount: 2,
  });

  return {
    customerType: 'retail',
    items: [{ ...base, ...overrides } as CalculationItemInput],
  };
}

describe('Calculation Engine (public contract)', () => {
  it('CALC-1 FRAME with valid params calculates', async () => {
    const result = await createLegacyEngine().calculate(itemRequest('FRAME'));
    expect(result.status).toBe('calculated');
    expect(result.total).toBeGreaterThan(0);
  });

  it('CALC-2 WING calculates', async () => {
    const result = await createLegacyEngine().calculate(
      itemRequest('WING', { widthMm: 800, heightMm: 1400 }),
    );
    expect(result.status).toBe('calculated');
  });

  it('CALC-3 DOOR without bolt calculates', async () => {
    const result = await createLegacyEngine().calculate(
      itemRequest('DOOR', { widthMm: 900, heightMm: 2100 }),
    );
    expect(result.status).toBe('calculated');
  });

  it('CALC-4 PLISSE_NET calculates', async () => {
    const result = await createLegacyEngine().calculate(
      itemRequest('PLISSE_NET', { widthMm: 1000, heightMm: 2000 }),
    );
    expect(result.status).toBe('calculated');
  });

  it('CALC-5 missing required size returns needs_input', async () => {
    const result = await createLegacyEngine().calculate(
      itemRequest('FRAME', { widthMm: undefined }),
    );
    expect(result.status).toBe('needs_input');
    expect(result.total).toBeNull();
  });

  it('CALC-6 zero/negative size is rejected', async () => {
    const result = await createLegacyEngine().calculate(itemRequest('FRAME', { heightMm: 0 }));
    expect(result.status).toBe('needs_input');
    expect(result.total).toBeNull();
  });

  it('CALC-7 unsupported product does not invent a price', async () => {
    const result = await createLegacyEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'item-1',
          productType: 'ROLL' as unknown as 'FRAME',
          widthMm: 1000,
          heightMm: 1500,
          quantity: 1,
          meshType: 'STANDARD',
          color: colorWhite(),
          fastening: 'Z_METAL',
          frameProfile: '25',
          cornerType: 'PLASTIC',
          handleType: 'PLASTIC',
        },
      ],
    });
    expect(result.status).toBe('unsupported');
    expect(result.total).toBeNull();
  });

  it('CALC-8/CURRENT-015 dealer customerType does not auto-apply discount', async () => {
    const retail = await createLegacyEngine().calculate(itemRequest('FRAME'));
    const dealer = await createLegacyEngine().calculate({
      ...itemRequest('FRAME'),
      customerType: 'dealer',
    });
    expect(dealer.total).toBe(retail.total);
    expect(dealer.orderBreakdown?.discountPercent).toBe(0);
  });

  it('CALC-9 priceVersion comes from PriceCatalogProvider', async () => {
    const result = await createLegacyEngine().calculate(itemRequest('FRAME'));
    expect(result.priceVersion).toBe(PRICE_VERSION);
    expect(result.calculationVersion).toBe('supermoskitka-calculation-v1.1');
    expect(result.businessRulesVersion).toBe(LEGACY_PARITY_BUSINESS_RULES_VERSION);
  });

  it('CALC-10 result has no internal cost/margin/profit fields', async () => {
    const result = await createLegacyEngine().calculate(itemRequest('FRAME'));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/margin|profit|себестоим|assembly_labor|costBreakdown/i);
  });
});

describe('Calculation parity with calc_v2 (historical)', () => {
  for (const parityCase of parity.cases) {
    it(`${parityCase.caseId} — ${parityCase.description}`, async () => {
      const engine = createLegacyEngine();

      if (parityCase.kind === 'item') {
        const result = await engine.calculate({
          customerType: 'retail',
          items: [toPublicItem(parityCase.input)],
        });
        expect(result.status).toBe('calculated');
        expect(result.items[0]?.productTotal).toBe(parityCase.expected.total);
        expect(result.items[0]?.installationTotal).toBe(parityCase.expected.install);
      } else {
        const input = parityCase.input;
        const items = (input.items as Array<Record<string, unknown>>).map((item, index) =>
          toPublicItem(item, `item-${index + 1}`),
        );
        const result = await engine.calculate({
          customerType: (input.customerType as 'retail') ?? 'retail',
          items,
          delivery: input.delivery as CalculationRequest['delivery'],
          installation: input.installation as CalculationRequest['installation'],
          measurement: input.measurement as CalculationRequest['measurement'],
          discount: input.discount as CalculationRequest['discount'],
          payment: input.payment as CalculationRequest['payment'],
        });
        expect(result.status).toBe('calculated');
        expect(result.total).toBe(parityCase.expected.grandTotal);
        expect(result.orderBreakdown?.itemsBasePrice).toBe(parityCase.expected.itemsBasePrice);
        expect(result.orderBreakdown?.installTotal).toBe(parityCase.expected.installTotal);
        expect(result.orderBreakdown?.deliveryCost).toBe(parityCase.expected.deliveryCost);
        expect(result.orderBreakdown?.measurementFee).toBe(parityCase.expected.measurementFee);
        expect(result.orderBreakdown?.discountPercent).toBe(parityCase.expected.discountPercent);
        expect(result.orderBreakdown?.paymentSurcharge).toBe(parityCase.expected.paymentSurcharge);
      }
    });
  }
});
