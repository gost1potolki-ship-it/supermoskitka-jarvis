import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  type CalculationOutcome,
} from '../src/calculation/index.js';
import {
  CALCULATE_ORDER_PARAMETERS_SCHEMA,
  CALCULATE_ORDER_TOOL_NAME,
  CalculationTool,
  createCalculateOrderToolDefinition,
  parseCalculationRequestArguments,
  projectSafeCalculationOutcome,
  ToolRuntime,
} from '../src/jarvis/tools/index.js';
import {
  buildCalculationRequestFromTrustedInput,
  parseTrustedCalculationToolInput,
} from '../src/jarvis/pricing/index.js';
import { CURRENT_PRICE_CATALOG } from './fixtures/calculation-prices-current.js';
import { describe, expect, it } from 'vitest';

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

const VALID_PRODUCT_ONLY = {
  mode: 'PRODUCT_ONLY',
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
};

function collectSchemaKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectSchemaKeys(entry, keys);
    }
    return keys;
  }
  if (typeof value !== 'object' || value === null) {
    return keys;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectSchemaKeys(nested, keys);
  }
  return keys;
}

describe('Neutral calculation tool contract', () => {
  it('TOOLS-1 tool definition is provider-neutral', () => {
    const definition = createCalculateOrderToolDefinition();
    expect(definition.name).toBe(CALCULATE_ORDER_TOOL_NAME);
    expect(definition.description.length).toBeGreaterThan(0);
    expect(definition.parameters).toBeTypeOf('object');
    expect(JSON.stringify(definition)).not.toMatch(/openai|odirouter|@google/i);
  });

  it('TOOLS-2 invalid arguments JSON does not crash', async () => {
    const tool = new CalculationTool(createEngine());
    const result = await tool.execute({
      id: 'call-1',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: '{broken',
    });
    expect(result.status).toBe('invalid_arguments');
    expect(result.message).toBe('Calculation arguments are invalid.');
  });

  it('TOOLS-3 unknown tool fails closed', async () => {
    const runtime = new ToolRuntime(new CalculationTool(createEngine()));
    const result = await runtime.executeToolCall({
      id: 'call-2',
      name: 'delete_everything',
      argumentsJson: '{}',
    });
    expect(result.status).toBe('unknown_tool');
  });

  it('TOOLS-4 calculated result projected safely', async () => {
    const tool = new CalculationTool(createEngine());
    const result = await tool.execute({
      id: 'call-3',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: JSON.stringify(VALID_PRODUCT_ONLY),
    });
    expect(result.status).toBe('calculated');
    expect(typeof result.total).toBe('number');
    expect(result.mode).toBe('PRODUCT_ONLY');
    expect(result.items).toBeUndefined();
  });

  it('TOOLS-5 needs_input preserved', async () => {
    const tool = new CalculationTool(createEngine());
    const result = await tool.execute({
      id: 'call-4',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: JSON.stringify({
        mode: 'PRODUCT_ONLY',
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
      }),
    });
    expect(result.status).toBe('needs_input');
    expect(result.missingFields?.length).toBeGreaterThan(0);
    expect(result.total ?? null).toBeNull();
  });

  it('TOOLS-6 unsupported preserved', async () => {
    const tool = new CalculationTool(createEngine());
    const result = await tool.execute({
      id: 'call-5',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: JSON.stringify({
        mode: 'PRODUCT_ONLY',
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
      }),
    });
    expect(result.status).toBe('unsupported');
  });

  it('TOOLS-7 internal economics absent from tool result', () => {
    const outcome: CalculationOutcome = {
      status: 'calculated',
      items: [
        {
          itemId: 'i1',
          productType: 'FRAME',
          quantity: 1,
          unitPrice: 1000,
          productTotal: 1000,
          installationTotal: 800,
        },
      ],
      total: 1800,
      warnings: [],
      missingFields: [],
      calculationVersion: 'v',
      priceVersion: 'p',
      businessRulesVersion: 'b',
      orderBreakdown: {
        itemsBasePrice: 1000,
        measurementFee: 0,
        installTotal: 800,
        deliveryCost: 0,
        discountPercent: 0,
        discountAmount: 0,
        paymentSurcharge: 0,
        grandTotal: 1800,
      },
    };
    const safe = projectSafeCalculationOutcome(outcome, 'PRODUCT_ONLY');
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toMatch(/assemblyLabor|margin|profit|себестоим|businessRulesVersion/i);
    expect(serialized).not.toMatch(/unitPrice|productTotal|installationTotal|discountAmount/i);
    expect(safe).not.toHaveProperty('orderBreakdown');
    expect(safe).not.toHaveProperty('calculationVersion');
    expect(safe).toEqual(
      expect.objectContaining({
        status: 'calculated',
        total: 1800,
        mode: 'PRODUCT_ONLY',
      }),
    );
  });

  it('parseCalculationRequestArguments rejects non-object JSON', () => {
    expect(parseCalculationRequestArguments('"x"').ok).toBe(false);
  });

  it('TOOL-PRICE-1 schema does NOT expose installation.overrideAmount', () => {
    expect(collectSchemaKeys(CALCULATE_ORDER_PARAMETERS_SCHEMA).has('overrideAmount')).toBe(
      false,
    );
  });

  it('TOOL-PRICE-2 schema does NOT expose measurement.overrideAmount', () => {
    const keys = collectSchemaKeys(CALCULATE_ORDER_PARAMETERS_SCHEMA);
    expect(keys.has('measurement')).toBe(false);
    expect(keys.has('overrideAmount')).toBe(false);
  });

  it('TOOL-PRICE-3 schema does NOT expose delivery.overrideAmount', () => {
    expect(JSON.stringify(CALCULATE_ORDER_PARAMETERS_SCHEMA.properties.delivery)).not.toMatch(
      /overrideAmount|amount/,
    );
  });

  it('TOOL-PRICE-4 schema does NOT expose discount', () => {
    expect(collectSchemaKeys(CALCULATE_ORDER_PARAMETERS_SCHEMA).has('discount')).toBe(false);
  });

  it('TOOL-PRICE-5 schema does NOT expose arbitrary manual price fields', () => {
    const keys = collectSchemaKeys(CALCULATE_ORDER_PARAMETERS_SCHEMA);
    for (const forbidden of [
      'manualPrice',
      'priceOverride',
      'customAmount',
      'laborOverride',
      'markupOverride',
      'payment',
      'installation',
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it('runtime rejects monetary authority fields', async () => {
    const tool = new CalculationTool(createEngine());
    const result = await tool.execute({
      id: 'call-money',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: JSON.stringify({
        ...VALID_PRODUCT_ONLY,
        discount: { percent: 99 },
        installation: { overrideAmount: 1 },
      }),
    });
    expect(result.status).toBe('invalid_arguments');
  });

  it('MODE-1 PRELIMINARY_ALL_IN is accepted enum', () => {
    expect(CALCULATE_ORDER_PARAMETERS_SCHEMA.properties.mode.enum).toContain(
      'PRELIMINARY_ALL_IN',
    );
    const parsed = parseTrustedCalculationToolInput(
      JSON.stringify({
        ...VALID_PRODUCT_ONLY,
        mode: 'PRELIMINARY_ALL_IN',
        delivery: { type: 'city' },
      }),
    );
    expect(parsed.ok).toBe(true);
  });

  it('MODE-2 PRODUCT_ONLY is accepted enum', () => {
    expect(CALCULATE_ORDER_PARAMETERS_SCHEMA.properties.mode.enum).toContain('PRODUCT_ONLY');
    expect(parseTrustedCalculationToolInput(JSON.stringify(VALID_PRODUCT_ONLY)).ok).toBe(true);
  });

  it('MODE-3 unknown mode → invalid_arguments', () => {
    const parsed = parseTrustedCalculationToolInput(
      JSON.stringify({ ...VALID_PRODUCT_ONLY, mode: 'CHEAP_ONLY' }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.result.status).toBe('invalid_arguments');
    }
  });

  it('all-in missing delivery → needs_input (no silent PRODUCT_ONLY)', async () => {
    const tool = new CalculationTool(createEngine());
    const result = await tool.execute({
      id: 'call-allin',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: JSON.stringify({
        ...VALID_PRODUCT_ONLY,
        mode: 'PRELIMINARY_ALL_IN',
      }),
    });
    expect(result.status).toBe('needs_input');
    expect(result.missingFields).toContain('delivery.type');
    expect(result.total ?? null).toBeNull();
  });

  it('dealer customerType does not auto-apply discount via tool policy', async () => {
    const tool = new CalculationTool(createEngine());
    const retail = await tool.execute({
      id: 'retail',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: JSON.stringify(VALID_PRODUCT_ONLY),
    });
    const dealer = await tool.execute({
      id: 'dealer',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: JSON.stringify({ ...VALID_PRODUCT_ONLY, customerType: 'dealer' }),
    });
    expect(retail.status).toBe('calculated');
    expect(dealer.status).toBe('calculated');
    expect(dealer.total).toBe(retail.total);

    const built = buildCalculationRequestFromTrustedInput({
      mode: 'PRODUCT_ONLY',
      customerType: 'dealer',
      items: VALID_PRODUCT_ONLY.items as never,
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.request.discount).toEqual({ percent: 0 });
    }
  });
});
