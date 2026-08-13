import { getFactValue, type OrderMemory } from '../src/domain/index.js';
import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  FRAME_PROFILE_25_COST_RUB_PER_M,
  IMPOST_COST_RUB_PER_M,
  MESH_ACTUAL_COST_RUB_PER_M2,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  calculateFrame600x1800WhiteStandardFixture,
  calculateFrameBomCost,
} from '../src/calculation/index.js';
import {
  buildOrderMemoryDocument,
  decodeOrderMemoryDocument,
} from '../src/infrastructure/firestore/index.js';
import {
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import {
  applyCommercialPricingPolicy,
  applyPsychologicalPricing,
  computeHardFloor47Rub,
  computeRawCommercialPriceRub,
  computeTargetPrice50Rub,
} from '../src/jarvis/pricing/commercial-pricing-policy.js';
import {
  buildPreliminaryQuoteSnapshot,
  computeFrameOrderDirectCost,
  createGuardedPreliminaryPrice,
  ESTIMATED_AVERAGE_HEIGHT_MM,
  ESTIMATED_AVERAGE_WIDTH_MM,
  resolvePreliminaryInputs,
} from '../src/jarvis/preliminary/index.js';
import { CalculationTool } from '../src/jarvis/tools/index.js';
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

describe('Task 11.1 dual catalog and commercial pricing', () => {
  describe('Actual Cost Catalog', () => {
    it('COSTCAT-1 WHITE frame profile = 55', () => {
      expect(FRAME_PROFILE_25_COST_RUB_PER_M.WHITE).toBe(55);
    });
    it('COSTCAT-2 GRAY_7016 frame profile = 60', () => {
      expect(FRAME_PROFILE_25_COST_RUB_PER_M.GRAY_7016).toBe(60);
    });
    it('COSTCAT-3 WHITE impost = 60', () => {
      expect(IMPOST_COST_RUB_PER_M.WHITE).toBe(60);
    });
    it('COSTCAT-4 GRAY_7016 impost = 66', () => {
      expect(IMPOST_COST_RUB_PER_M.GRAY_7016).toBe(66);
    });
    it('COSTCAT-5 STANDARD = 43.58/m²', () => {
      expect(MESH_ACTUAL_COST_RUB_PER_M2.STANDARD).toBe(43.58);
    });
    it('COSTCAT-6 ANTIMOSHKA = 87.39/m²', () => {
      expect(MESH_ACTUAL_COST_RUB_PER_M2.ANTIMOSHKA).toBe(87.39);
    });
    it('COSTCAT-7 ANTICAT = 155.51/m²', () => {
      expect(MESH_ACTUAL_COST_RUB_PER_M2.ANTICAT).toBe(155.51);
    });
    it('COSTCAT-8 POLL-TEX = 329.93/m²', () => {
      expect(MESH_ACTUAL_COST_RUB_PER_M2.ANTIDUST).toBe(329.93);
    });
    it('COSTCAT-9 legacy selling values remain separate and unchanged', async () => {
      const whiteOutcome = await createEngine().calculate({
        customerType: 'retail',
        items: [
          {
            itemId: 'w',
            productType: 'FRAME',
            widthMm: 600,
            heightMm: 1800,
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
      const grayOutcome = await createEngine().calculate({
        customerType: 'retail',
        items: [
          {
            itemId: 'g',
            productType: 'FRAME',
            widthMm: 600,
            heightMm: 1800,
            quantity: 1,
            meshType: 'STANDARD',
            color: { kind: 'GRAY_7016' },
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
      expect(whiteOutcome.total).toBeDefined();
      expect(grayOutcome.total).toBeDefined();
      expect(grayOutcome.total!).toBeGreaterThan(whiteOutcome.total!);

      const bomWhite = calculateFrameBomCost({
        widthMm: 600,
        heightMm: 1800,
        profileColor: 'WHITE',
        meshType: 'STANDARD',
        fastening: 'Z_METAL',
        businessRules: CURRENT_BUSINESS_RULES,
      });
      const bomGray = calculateFrameBomCost({
        widthMm: 600,
        heightMm: 1800,
        profileColor: 'GRAY_7016',
        meshType: 'STANDARD',
        fastening: 'Z_METAL',
        businessRules: CURRENT_BUSINESS_RULES,
      });
      expect(bomGray.totalProductDirectCostRub - bomWhite.totalProductDirectCostRub).toBeLessThan(
        grayOutcome.total! - whiteOutcome.total!,
      );
    });
  });

  describe('FRAME BOM 600×1800 WHITE STANDARD', () => {
    const bom = calculateFrame600x1800WhiteStandardFixture();

    it('quantities match fixture', () => {
      expect(bom.quantities.profileMeters).toBe(5);
      expect(bom.quantities.impostMeters).toBe(1);
      expect(bom.quantities.meshM2).toBeCloseTo(1.08, 5);
      expect(bom.quantities.corners).toBe(4);
      expect(bom.quantities.cordMeters).toBe(5);
      expect(bom.quantities.impostConnectors).toBe(2);
    });

    it('base materials ≈ 435.7964', () => {
      expect(bom.baseMaterialsRub).toBeCloseTo(435.7964, 3);
    });

    it('waste ≈ 19.10332', () => {
      expect(bom.wasteRub).toBeCloseTo(19.10332, 3);
    });

    it('materials after waste ≈ 454.89972', () => {
      expect(bom.materialsAfterWasteRub).toBeCloseTo(454.89972, 2);
    });

    it('STANDARD labor = 250', () => {
      expect(bom.manufacturingLaborRub).toBe(250);
    });

    it('product direct cost ≈ 704.90', () => {
      expect(bom.totalProductDirectCostRub).toBeCloseTo(704.9, 1);
    });
  });

  describe('mesh and color economics', () => {
    it('mesh actual costs increase STANDARD < ANTIMOSHKA < ANTICAT < ANTIDUST', () => {
      const base = {
        widthMm: 600,
        heightMm: 1800,
        profileColor: 'WHITE' as const,
        fastening: 'Z_METAL' as const,
        businessRules: CURRENT_BUSINESS_RULES,
      };
      const standard = calculateFrameBomCost({ ...base, meshType: 'STANDARD' });
      const antimoshka = calculateFrameBomCost({ ...base, meshType: 'ANTIMOSHKA' });
      const anticat = calculateFrameBomCost({ ...base, meshType: 'ANTICAT' });
      const antidust = calculateFrameBomCost({ ...base, meshType: 'ANTIDUST' });

      expect(standard.totalProductDirectCostRub).toBeLessThan(antimoshka.totalProductDirectCostRub);
      expect(antimoshka.totalProductDirectCostRub).toBeLessThan(anticat.totalProductDirectCostRub);
      expect(anticat.totalProductDirectCostRub).toBeLessThan(antidust.totalProductDirectCostRub);
      expect(antimoshka.meshRub / bomMeshM2(600, 1800)).toBeCloseTo(87.39, 2);
      expect(anticat.meshRub / bomMeshM2(600, 1800)).toBeCloseTo(155.51, 2);
      expect(antidust.meshRub / bomMeshM2(600, 1800)).toBeCloseTo(329.93, 2);
    });

    it('labor: STANDARD/ANTIMOSHKA 250, ANTICAT/ANTIDUST 300', () => {
      const base = {
        widthMm: 600,
        heightMm: 1800,
        profileColor: 'WHITE' as const,
        fastening: 'Z_METAL' as const,
        businessRules: CURRENT_BUSINESS_RULES,
      };
      expect(calculateFrameBomCost({ ...base, meshType: 'STANDARD' }).manufacturingLaborRub).toBe(
        250,
      );
      expect(
        calculateFrameBomCost({ ...base, meshType: 'ANTIMOSHKA' }).manufacturingLaborRub,
      ).toBe(250);
      expect(calculateFrameBomCost({ ...base, meshType: 'ANTICAT' }).manufacturingLaborRub).toBe(
        300,
      );
      expect(calculateFrameBomCost({ ...base, meshType: 'ANTIDUST' }).manufacturingLaborRub).toBe(
        300,
      );
    });
  });

  describe('order direct cost and commercial policy', () => {
    it('self pickup: 2×750 → order 1500, target 3000', () => {
      expect(computeTargetPrice50Rub(1500)).toBe(3000);
      const decision = applyCommercialPricingPolicy({
        legacyCommercialTotalRub: 2500,
        orderDirectCostRub: 1500,
      });
      expect(decision.rawCommercialPriceRub).toBe(3000);
    });

    it('full service: 4500 order direct, target 9000, floor 8491, psych 8970', () => {
      expect(computeTargetPrice50Rub(4500)).toBe(9000);
      expect(computeHardFloor47Rub(4500)).toBe(8491);

      const decision = applyCommercialPricingPolicy({
        legacyCommercialTotalRub: 8500,
        orderDirectCostRub: 4500,
      });
      expect(decision.rawCommercialPriceRub).toBe(9000);
      expect(decision.finalCustomerPriceRub).toBe(8970);
    });

    it('services are part of order direct cost before target pricing', async () => {
      const memory = frameMemory({}, 2);
      const direct = computeFrameOrderDirectCost({ memory, deliveryType: 'city' });
      expect(direct.ok).toBe(true);
      if (!direct.ok) {
        return;
      }
      expect(direct.measurementDirectCostRub).toBe(1000);
      expect(direct.deliveryDirectCostRub).toBe(1000);
      expect(direct.installationDirectCostRub).toBe(1000);
      expect(direct.totalDirectCostRub).toBe(
        direct.productDirectCostRub + 1000 + 1000 + 1000,
      );
    });

    it('self pickup zeros service direct costs', () => {
      const memory = frameMemory({}, 2);
      const direct = computeFrameOrderDirectCost({ memory, deliveryType: 'pickup' });
      expect(direct.ok).toBe(true);
      if (!direct.ok) {
        return;
      }
      expect(direct.measurementDirectCostRub).toBe(0);
      expect(direct.deliveryDirectCostRub).toBe(0);
      expect(direct.installationDirectCostRub).toBe(0);
      expect(direct.totalDirectCostRub).toBe(direct.productDirectCostRub);
    });

    it('legacy vs target: never lower when legacy higher', () => {
      expect(computeRawCommercialPriceRub(11000, 9000)).toBe(11000);
      expect(computeRawCommercialPriceRub(8500, 9000)).toBe(9000);
    });

    it('47% hard floor: 5750 → floor 10850, target50 11500', () => {
      expect(computeHardFloor47Rub(5750)).toBe(10850);
      expect(computeTargetPrice50Rub(5750)).toBe(11500);

      const belowFloor = applyCommercialPricingPolicy({
        legacyCommercialTotalRub: 10700,
        orderDirectCostRub: 5750,
      });
      expect(belowFloor.finalCustomerPriceRub).toBe(11500);

      const aboveTarget = applyCommercialPricingPolicy({
        legacyCommercialTotalRub: 15200,
        orderDirectCostRub: 5750,
      });
      expect(aboveTarget.finalCustomerPriceRub).toBe(15200);
    });
  });

  describe('psychological pricing', () => {
    it('PSYCH-1 raw=9000 → 8970', () => {
      expect(applyPsychologicalPricing(9000, 4500).finalPriceRub).toBe(8970);
    });
    it('PSYCH-2 raw=9050 → 8970', () => {
      expect(applyPsychologicalPricing(9050, 4500).finalPriceRub).toBe(8970);
    });
    it('PSYCH-3 raw=9051 → unchanged', () => {
      expect(applyPsychologicalPricing(9051, 4500).finalPriceRub).toBe(9051);
    });
    it('PSYCH-4 raw=8990 → unchanged', () => {
      expect(applyPsychologicalPricing(8990, 4500).finalPriceRub).toBe(8990);
    });
    it('PSYCH-5 raw=10000 → 9970', () => {
      expect(applyPsychologicalPricing(10000, 5000).finalPriceRub).toBe(9970);
    });
    it('PSYCH-6 candidate below 47% floor → rejected', () => {
      const tight = applyPsychologicalPricing(9000, 8500);
      expect(tight.finalPriceRub).toBe(9000);
    });
  });

  describe('trusted input boundary', () => {
    it('INPUT-1 FRAME no dimensions → engine 800×1600, memory absent', async () => {
      const memory = frameMemory();
      const tool = new CalculationTool(createEngine());
      tool.setOrderMemoryContext(memory);

      const result = await tool.execute(
        fakeCalculateOrderCall('call-1', {
          mode: 'PRELIMINARY_ALL_IN',
          customerType: 'retail',
          items: [
            {
              itemId: 'item-1',
              productType: 'FRAME',
              widthMm: 900,
              heightMm: 1700,
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
      expect(getFactValue(memory.items[0]?.widthMm)).toBeUndefined();
      expect(getFactValue(memory.items[0]?.heightMm)).toBeUndefined();
      const resolved = resolvePreliminaryInputs(memory);
      expect(resolved.items[0]?.size.widthMm).toBe(ESTIMATED_AVERAGE_WIDTH_MM);
      expect(resolved.items[0]?.size.heightMm).toBe(ESTIMATED_AVERAGE_HEIGHT_MM);
    });

    it('INPUT-2 LIGHT_OPENING 770×1390 → engine 810×1430', () => {
      const memory = frameMemory({
        widthMm: 770,
        heightMm: 1390,
        measurementBasis: 'LIGHT_OPENING',
      });
      const resolved = resolvePreliminaryInputs(memory);
      expect(resolved.items[0]?.size.widthMm).toBe(810);
      expect(resolved.items[0]?.size.heightMm).toBe(1430);
      expect(getFactValue(memory.items[0]?.widthMm)).toBe(770);
      expect(getFactValue(memory.items[0]?.heightMm)).toBe(1390);
    });

    it('INPUT-3 PRODUCT_SIZE unchanged', () => {
      const memory = frameMemory({
        widthMm: 810,
        heightMm: 1430,
        measurementBasis: 'PRODUCT_SIZE',
      });
      const resolved = resolvePreliminaryInputs(memory);
      expect(resolved.items[0]?.size.widthMm).toBe(810);
      expect(resolved.items[0]?.size.heightMm).toBe(1430);
    });

    it('INPUT-4 dimensions without basis → NEEDS_SIZE_BASIS', () => {
      const memory = frameMemory({ widthMm: 800, heightMm: 1600 });
      const resolved = resolvePreliminaryInputs(memory);
      expect(resolved.blocking).toContain('NEEDS_SIZE_BASIS');
    });

    it('INPUT-5 DOOR no size → NEEDS_INPUT', () => {
      let memory = createOrderMemory({
        orderId: 'd1',
        conversationId: 'c1',
        itemIds: ['item-1'],
        now: SOURCE.sourceTimestamp,
      });
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'productType',
        value: 'DOOR',
        source: SOURCE,
      }).memory;
      const resolved = resolvePreliminaryInputs(memory);
      expect(resolved.blocking).toContain('NEEDS_INPUT');
    });

    it('INPUT-6 PLISSE no size → NEEDS_INPUT', () => {
      let memory = createOrderMemory({
        orderId: 'p1',
        conversationId: 'c1',
        itemIds: ['item-1'],
        now: SOURCE.sourceTimestamp,
      });
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'productType',
        value: 'PLISSE_NET',
        source: SOURCE,
      }).memory;
      const resolved = resolvePreliminaryInputs(memory);
      expect(resolved.blocking).toContain('NEEDS_INPUT');
    });
  });

  describe('guarded preliminary pipeline', () => {
    it('INPUT-MISMATCH: trusted resolver wins over LLM dimensions', async () => {
      const memory = frameMemory();
      const tool = new CalculationTool(createEngine());
      tool.setOrderMemoryContext(memory);

      const result = await tool.execute(
        fakeCalculateOrderCall('call-mismatch', {
          mode: 'PRELIMINARY_ALL_IN',
          customerType: 'retail',
          items: [
            {
              itemId: 'item-1',
              productType: 'FRAME',
              widthMm: 900,
              heightMm: 1700,
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
      const singleFrameOutcome = await createEngine().calculate({
        customerType: 'retail',
        items: [
          {
            itemId: 'item-1',
            productType: 'FRAME',
            widthMm: ESTIMATED_AVERAGE_WIDTH_MM,
            heightMm: ESTIMATED_AVERAGE_HEIGHT_MM,
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
        installation: { enabled: true },
        measurement: { includeFee: true },
        discount: { percent: 0 },
        payment: { method: 'cash' },
      });
      expect(tool.lastExecuteMeta?.outcome?.total).toBe(singleFrameOutcome.total);
      expect(tool.lastExecuteMeta?.guardedPrice?.pricingPolicyStatus).toBe(
        'FRAME_COMMERCIAL_PRICING_PASSED',
      );
    });

    it('SELLING-VS-COST: public install ≠ direct install for 3 frames', async () => {
      const outcome = await createEngine().calculate({
        customerType: 'retail',
        items: [
          {
            itemId: 'item-1',
            productType: 'FRAME',
            widthMm: ESTIMATED_AVERAGE_WIDTH_MM,
            heightMm: ESTIMATED_AVERAGE_HEIGHT_MM,
            quantity: 3,
            meshType: 'STANDARD',
            color: { kind: 'WHITE' },
            fastening: 'Z_METAL',
            frameProfile: '25',
            cornerType: 'PLASTIC',
            handleType: 'PLASTIC',
          },
        ],
        delivery: { type: 'city' },
        installation: { enabled: true },
        measurement: { includeFee: true },
        discount: { percent: 0 },
        payment: { method: 'cash' },
      });

      expect(outcome.items[0]?.installationTotal).toBe(2400);
      const memory = frameMemory({}, 3);
      const direct = computeFrameOrderDirectCost({ memory, deliveryType: 'city' });
      expect(direct.ok).toBe(true);
      if (direct.ok) {
        expect(direct.installationDirectCostRub).toBe(1500);
        expect(direct.productDirectCostRub).toBeGreaterThan(0);
      }
    });

    it('PLISSE unchanged public formula', async () => {
      let memory = createOrderMemory({
        orderId: 'o2',
        conversationId: 'c2',
        itemIds: ['item-1'],
        now: SOURCE.sourceTimestamp,
      });
      memory = applyOrderItemFact(memory, {
        orderItemId: 'item-1',
        field: 'productType',
        value: 'PLISSE_NET',
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

      const engine = createEngine();
      const tool = new CalculationTool(engine);
      tool.setOrderMemoryContext(memory);

      const outcome = await engine.calculate({
        customerType: 'retail',
        items: [
          {
            itemId: 'item-1',
            productType: 'PLISSE_NET',
            widthMm: 1000,
            heightMm: 1500,
            quantity: 1,
            meshType: 'STANDARD',
            color: { kind: 'WHITE' },
            openingType: 'SIDE',
            thresholdType: 'STANDARD',
            handlesCount: 1,
          },
        ],
        delivery: { type: 'city' },
        installation: { enabled: true },
        measurement: { includeFee: true },
        discount: { percent: 0 },
        payment: { method: 'cash' },
      });

      const guarded = createGuardedPreliminaryPrice({
        memory,
        outcome,
        deliveryType: 'city',
      });
      expect(guarded.ok).toBe(true);
      if (guarded.ok) {
        expect(guarded.guarded.publicTotalRub).toBe(outcome.total);
        expect(guarded.guarded.pricingPolicyStatus).toBe('EXISTING_PRODUCT_FORMULA');
      }
    });

    it('buildPreliminaryQuoteSnapshot requires guarded pipeline input', () => {
      const memory = frameMemory();
      const snapshot = buildPreliminaryQuoteSnapshot({
        memory,
        guarded: {
          publicTotalRub: 20000,
          pricingPolicyStatus: 'FRAME_COMMERCIAL_PRICING_PASSED',
          inputFingerprint: 'fp-test',
        },
      });
      expect(snapshot.pricingPolicyStatus).toBe('FRAME_COMMERCIAL_PRICING_PASSED');
      expect(snapshot.pricingPolicyVersion).toBe('jarvis-pricing-policy-v2');
    });

    it('WING-only PRELIMINARY_ALL_IN fails closed', async () => {
      let memory = createOrderMemory({
        orderId: 'o3',
        conversationId: 'c3',
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
        fakeCalculateOrderCall('call-wing', {
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
      expect(result.status).toBe('tool_error');
    });

    it('legacy marginGuardPassed decodes as FRAME_MARGIN_GUARD_PASSED', () => {
      const legacy = {
        quoteId: 'pq_legacy',
        inputFingerprint: 'fp',
        publicTotalRub: 18000,
        createdAt: '2026-08-13T10:00:00.000Z',
        pricingPolicyVersion: 'jarvis-pricing-policy-v1',
        marginGuardPassed: true,
      };
      const decoded = decodeOrderMemoryDocument(
        buildOrderMemoryDocument(
          {
            ...createOrderMemory({
              orderId: 'o1',
              conversationId: 'c1',
              itemIds: [],
              now: '2026-08-13T10:00:00.000Z',
            }),
            preliminaryQuote: legacy as never,
          },
          1,
        ),
      ).memory;
      expect(decoded.preliminaryQuote?.pricingPolicyStatus).toBe('FRAME_MARGIN_GUARD_PASSED');
    });

    it('FRAME_COMMERCIAL_PRICING_PASSED persists in codec', () => {
      const snapshot = {
        quoteId: 'pq_v2',
        inputFingerprint: 'fp',
        publicTotalRub: 8970,
        createdAt: '2026-08-13T10:00:00.000Z',
        pricingPolicyVersion: 'jarvis-pricing-policy-v2',
        pricingPolicyStatus: 'FRAME_COMMERCIAL_PRICING_PASSED',
      };
      const decoded = decodeOrderMemoryDocument(
        buildOrderMemoryDocument(
          {
            ...createOrderMemory({
              orderId: 'o1',
              conversationId: 'c1',
              itemIds: [],
              now: '2026-08-13T10:00:00.000Z',
            }),
            preliminaryQuote: snapshot,
          },
          1,
        ),
      ).memory;
      expect(decoded.preliminaryQuote?.pricingPolicyStatus).toBe(
        'FRAME_COMMERCIAL_PRICING_PASSED',
      );
    });
  });
});

function bomMeshM2(widthMm: number, heightMm: number): number {
  return (widthMm / 1000) * (heightMm / 1000);
}
