import {
  CURRENT_BUSINESS_RULES,
  CURRENT_BUSINESS_RULES_VERSION,
  StaticPriceCatalogProvider,
  SuperMoskitkaCalculationEngine,
  type CalculationOutcome,
} from '../src/calculation/index.js';
import {
  CALCULATE_ORDER_TOOL_NAME,
  CalculationTool,
  createCalculateOrderToolDefinition,
  parseCalculationRequestArguments,
  projectSafeCalculationOutcome,
  ToolRuntime,
} from '../src/jarvis/tools/index.js';
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
      argumentsJson: JSON.stringify({
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
      }),
    });
    expect(result.status).toBe('calculated');
    expect(typeof result.total).toBe('number');
    expect(result.items?.[0]?.productType).toBe('FRAME');
  });

  it('TOOLS-5 needs_input preserved', async () => {
    const tool = new CalculationTool(createEngine());
    const result = await tool.execute({
      id: 'call-4',
      name: CALCULATE_ORDER_TOOL_NAME,
      argumentsJson: JSON.stringify({
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
    const safe = projectSafeCalculationOutcome(outcome);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toMatch(/assemblyLabor|margin|profit|себестоим|businessRulesVersion/i);
    expect(safe).not.toHaveProperty('orderBreakdown');
    expect(safe).not.toHaveProperty('calculationVersion');
  });

  it('parseCalculationRequestArguments rejects non-object JSON', () => {
    expect(parseCalculationRequestArguments('"x"').ok).toBe(false);
  });
});
