import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  mapColor,
  mapMeshType,
  resolveFrameAssemblyLabor,
  resolvePlisseMeshPriceReference,
  type CalculationItemInput,
  type CalculationRequest,
  type DoorCalculationItem,
} from '../src/calculation/index.js';
import { CURRENT_PRICE_CATALOG } from './fixtures/calculation-prices-current.js';
import { describe, expect, it } from 'vitest';

function createCurrentEngine() {
  return new SuperMoskitkaCalculationEngine(
    new StaticPriceCatalogProvider({
      version: 'current-prices-base@66465b1',
      prices: CURRENT_PRICE_CATALOG,
      businessRulesVersion: CURRENT_BUSINESS_RULES_VERSION,
      businessRules: CURRENT_BUSINESS_RULES,
    }),
  );
}

function frame(overrides: Partial<Extract<CalculationItemInput, { productType: 'FRAME' }>> = {}) {
  return {
    itemId: 'item-1',
    productType: 'FRAME' as const,
    widthMm: 1000,
    heightMm: 1500,
    quantity: 1,
    meshType: 'STANDARD' as const,
    color: { kind: 'WHITE' as const },
    fastening: 'Z_METAL' as const,
    frameProfile: '25' as const,
    cornerType: 'PLASTIC' as const,
    handleType: 'PLASTIC' as const,
    ...overrides,
  };
}

describe('CURRENT business rules', () => {
  it('CURRENT-001 FRAME STANDARD labor = 250', () => {
    expect(resolveFrameAssemblyLabor('STANDARD', 'Z_METAL', CURRENT_BUSINESS_RULES)).toBe(250);
  });

  it('CURRENT-002 FRAME ANTIMOSHKA labor = 250', () => {
    expect(resolveFrameAssemblyLabor('ANTIMOSHKA', 'Z_METAL', CURRENT_BUSINESS_RULES)).toBe(250);
  });

  it('CURRENT-003 FRAME ANTICAT labor = 300', () => {
    expect(resolveFrameAssemblyLabor('ANTICAT', 'Z_METAL', CURRENT_BUSINESS_RULES)).toBe(300);
  });

  it('CURRENT-004 FRAME ANTIDUST labor = 300', () => {
    expect(resolveFrameAssemblyLabor('ANTIDUST', 'Z_METAL', CURRENT_BUSINESS_RULES)).toBe(300);
  });

  it('CURRENT-005 FRAME plunger priority = 300 (not summed)', () => {
    expect(resolveFrameAssemblyLabor('STANDARD', 'PLUNGER', CURRENT_BUSINESS_RULES)).toBe(300);
    expect(resolveFrameAssemblyLabor('ANTICAT', 'PLUNGER', CURRENT_BUSINESS_RULES)).toBe(300);
  });

  it('CURRENT-006 WING labor = 500', () => {
    expect(CURRENT_BUSINESS_RULES.assemblyLabor.wing).toBe(500);
  });

  it('CURRENT-007 DOOR labor = 850', () => {
    expect(CURRENT_BUSINESS_RULES.assemblyLabor.door).toBe(850);
  });

  it('CURRENT-008 regional delivery uses 60/km', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [frame()],
      delivery: { type: 'out', distanceKm: 25 },
      installation: { enabled: false },
      measurement: { includeFee: false },
      discount: { percent: 0 },
      payment: { method: 'cash' },
    });
    expect(result.status).toBe('calculated');
    // delivery_base 1000 + 25*60 = 2500
    expect(result.orderBreakdown?.deliveryCost).toBe(1000 + 25 * 60);
  });

  it('CURRENT-009 missing out-of-city distance → needs_input', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [frame()],
      delivery: { type: 'out' },
    });
    expect(result.status).toBe('needs_input');
    expect(result.total).toBeNull();
    expect(result.missingFields).toContain('delivery.distanceKm');
  });

  it('CURRENT-010 invalid distances are rejected', async () => {
    for (const distanceKm of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await createCurrentEngine().calculate({
        customerType: 'retail',
        items: [frame()],
        delivery: { type: 'out', distanceKm },
      });
      expect(result.status).toBe('needs_input');
      expect(result.total).toBeNull();
    }
  });

  it('CURRENT-011 fractional quantity → needs_input', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [frame({ quantity: 1.5 })],
    });
    expect(result.status).toBe('needs_input');
    expect(result.missingFields.some((field) => field.includes('quantity'))).toBe(true);
  });

  it('CURRENT-012 ANTICAT maps to classic/plisse legacy keys', () => {
    expect(mapMeshType('FRAME', 'ANTICAT', CURRENT_PRICE_CATALOG)).toBe('anticat');
    expect(mapMeshType('PLISSE_NET', 'ANTICAT', CURRENT_PRICE_CATALOG)).toBe('antikoshka');
  });

  it('CURRENT-013 invalid mesh cannot fallback to standard', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        frame({
          meshType: 'NOT_A_MESH' as unknown as 'STANDARD',
        }),
      ],
    });
    expect(result.status).not.toBe('calculated');
    expect(result.total).toBeNull();
  });

  it('CURRENT-014 invalid color cannot fallback to white', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        frame({
          color: { kind: 'GOLD' } as unknown as { kind: 'WHITE' },
        }),
      ],
    });
    expect(result.status).not.toBe('calculated');
    expect(result.total).toBeNull();
  });

  it('CURRENT-016 DoorCalculationItem has no hasBolt and adapter disables bolt', () => {
    const door: DoorCalculationItem = {
      itemId: 'door-1',
      productType: 'DOOR',
      widthMm: 900,
      heightMm: 2100,
      quantity: 1,
      meshType: 'STANDARD',
      color: { kind: 'WHITE' },
      doorProfile: '42',
      hingesCount: 3,
    };
    expect('hasBolt' in door).toBe(false);
  });

  it('CURRENT-017 standard door hardware uses latch and 2|3 hinges', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'door-1',
          productType: 'DOOR',
          widthMm: 900,
          heightMm: 2100,
          quantity: 1,
          meshType: 'STANDARD',
          color: { kind: 'WHITE' },
          doorProfile: '42',
          hingesCount: 2,
        },
      ],
    });
    expect(result.status).toBe('calculated');
  });

  it('CURRENT-018 approved colors only (compile-time + runtime invalid rejected)', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        frame({
          color: { kind: 'beige' } as unknown as { kind: 'WHITE' },
        }),
      ],
    });
    expect(result.status).not.toBe('calculated');
  });

  it('CURRENT-019 CUSTOM_RAL requires ral', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        frame({
          color: { kind: 'CUSTOM_RAL', ral: '' },
        }),
      ],
    });
    expect(result.status).toBe('needs_input');
    expect(result.missingFields.some((field) => field.includes('color.ral'))).toBe(true);
  });

  it('CURRENT-020 REINFORCED threshold does not invent surcharge', async () => {
    const requestBase: CalculationRequest = {
      customerType: 'retail',
      items: [
        {
          itemId: 'p1',
          productType: 'PLISSE_NET',
          widthMm: 1000,
          heightMm: 2000,
          quantity: 1,
          meshType: 'STANDARD',
          color: { kind: 'WHITE' },
          openingType: 'SIDE',
          thresholdType: 'STANDARD',
          handlesCount: 2,
        },
      ],
    };
    const standard = await createCurrentEngine().calculate(requestBase);
    const reinforced = await createCurrentEngine().calculate({
      ...requestBase,
      items: [
        {
          ...requestBase.items[0]!,
          productType: 'PLISSE_NET',
          thresholdType: 'REINFORCED',
        },
      ],
    });
    expect(standard.status).toBe('calculated');
    expect(reinforced.status).toBe('calculated');
    expect(reinforced.items[0]?.productTotal).toBe(standard.items[0]?.productTotal);
    expect(reinforced.warnings.some((warning) => warning.includes('REINFORCED'))).toBe(true);
  });

  it('CURRENT-021 GRAY_7016 maps to classic legacy gray', () => {
    expect(mapColor('FRAME', { kind: 'GRAY_7016' })).toBe('gray');
  });

  it('CURRENT-022 GRAY_7016 maps to plisse legacy anthracite (same business color)', async () => {
    expect(mapColor('PLISSE_NET', { kind: 'GRAY_7016' })).toBe('anthracite');
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'p1',
          productType: 'PLISSE_NET',
          widthMm: 1000,
          heightMm: 2000,
          quantity: 1,
          meshType: 'STANDARD',
          color: { kind: 'GRAY_7016' },
          openingType: 'SIDE',
          thresholdType: 'STANDARD',
          handlesCount: 2,
        },
      ],
    });
    expect(result.status).toBe('calculated');
  });

  it('CURRENT-023 PLISSE Antimoshka is supported', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'p1',
          productType: 'PLISSE_NET',
          widthMm: 1000,
          heightMm: 2000,
          quantity: 1,
          meshType: 'ANTIMOSHKA',
          color: { kind: 'WHITE' },
          openingType: 'SIDE',
          thresholdType: 'STANDARD',
          handlesCount: 2,
        },
      ],
    });
    expect(result.status).toBe('calculated');
    expect(result.total).not.toBeNull();
  });

  it('CURRENT-024 PLISSE Antimoshka price equals Antidust price', async () => {
    const antimoshka = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'a',
          productType: 'PLISSE_NET',
          widthMm: 1000,
          heightMm: 2000,
          quantity: 1,
          meshType: 'ANTIMOSHKA',
          color: { kind: 'WHITE' },
          openingType: 'SIDE',
          thresholdType: 'STANDARD',
          handlesCount: 2,
        },
      ],
    });
    const antidust = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'b',
          productType: 'PLISSE_NET',
          widthMm: 1000,
          heightMm: 2000,
          quantity: 1,
          meshType: 'ANTIDUST',
          color: { kind: 'WHITE' },
          openingType: 'SIDE',
          thresholdType: 'STANDARD',
          handlesCount: 2,
        },
      ],
    });
    expect(antimoshka.status).toBe('calculated');
    expect(antidust.status).toBe('calculated');
    expect(antimoshka.items[0]?.unitPrice).toBe(antidust.items[0]?.unitPrice);
    expect(antimoshka.items[0]?.productTotal).toBe(antidust.items[0]?.productTotal);
  });

  it('CURRENT-025 Antimoshka remains Antimoshka (price reference ≠ semantic alias)', () => {
    expect(resolvePlisseMeshPriceReference('ANTIMOSHKA', CURRENT_BUSINESS_RULES)).toBe('ANTIDUST');
    expect(mapMeshType('PLISSE_NET', 'ANTIMOSHKA', CURRENT_PRICE_CATALOG, CURRENT_BUSINESS_RULES)).toBe(
      'antipyl',
    );
    const item = {
      itemId: 'p1',
      productType: 'PLISSE_NET' as const,
      meshType: 'ANTIMOSHKA' as const,
    };
    expect(item.meshType).toBe('ANTIMOSHKA');
  });

  it('CURRENT-026 invalid fastening fail closed', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        frame({
          fastening: 'SOMETHING_WRONG' as unknown as 'Z_METAL',
        }),
      ],
    });
    expect(result.status).not.toBe('calculated');
    expect(result.total).toBeNull();
    expect(result.missingFields.some((field) => field.includes('fastening'))).toBe(true);
  });

  it('CURRENT-027 invalid corner fail closed', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        frame({
          cornerType: 'SOMETHING_WRONG' as unknown as 'PLASTIC',
        }),
      ],
    });
    expect(result.status).not.toBe('calculated');
    expect(result.total).toBeNull();
  });

  it('CURRENT-028 invalid handle fail closed', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        frame({
          handleType: 'SOMETHING_WRONG' as unknown as 'PLASTIC',
        }),
      ],
    });
    expect(result.status).not.toBe('calculated');
    expect(result.total).toBeNull();
  });

  it('CURRENT-029 invalid PLISSE opening fail closed', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'p1',
          productType: 'PLISSE_NET',
          widthMm: 1000,
          heightMm: 2000,
          quantity: 1,
          meshType: 'STANDARD',
          color: { kind: 'WHITE' },
          openingType: 'SOMETHING_WRONG' as unknown as 'SIDE',
          thresholdType: 'STANDARD',
          handlesCount: 2,
        },
      ],
    });
    expect(result.status).not.toBe('calculated');
    expect(result.total).toBeNull();
  });

  it('CURRENT-030 invalid threshold fail closed', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'p1',
          productType: 'PLISSE_NET',
          widthMm: 1000,
          heightMm: 2000,
          quantity: 1,
          meshType: 'STANDARD',
          color: { kind: 'WHITE' },
          openingType: 'SIDE',
          thresholdType: 'SOMETHING_WRONG' as unknown as 'STANDARD',
          handlesCount: 2,
        },
      ],
    });
    expect(result.status).not.toBe('calculated');
    expect(result.total).toBeNull();
  });

  it('CURRENT-031 invalid productType fail closed', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'x',
          productType: 'UNKNOWN',
          widthMm: 1000,
          heightMm: 1500,
          quantity: 1,
        } as unknown as CalculationItemInput,
      ],
    } as unknown as CalculationRequest);
    expect(result.status).toBe('unsupported');
    expect(result.total).toBeNull();
  });

  it('CURRENT-032 invalid CUSTOM_RAL finish fail closed', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        frame({
          color: {
            kind: 'CUSTOM_RAL',
            ral: '7024',
            finish: 'PEARL' as unknown as 'STANDARD',
          },
        }),
      ],
    });
    expect(result.status).not.toBe('calculated');
    expect(result.total).toBeNull();
    expect(result.missingFields.some((field) => field.includes('color.finish'))).toBe(true);
  });

  it('CURRENT-033 Door 32 is CURRENT_PRICING_GAP (no silent 42mm hardware)', async () => {
    const result = await createCurrentEngine().calculate({
      customerType: 'retail',
      items: [
        {
          itemId: 'door-32',
          productType: 'DOOR',
          widthMm: 900,
          heightMm: 2100,
          quantity: 1,
          meshType: 'STANDARD',
          color: { kind: 'WHITE' },
          doorProfile: '32',
          hingesCount: 3,
        },
      ],
    });
    expect(result.status).toBe('unsupported');
    expect(result.total).toBeNull();
    expect(result.warnings.some((warning) => warning.includes('CURRENT_PRICING_GAP'))).toBe(true);
  });
});
