import { describe, expect, it } from 'vitest';

import { buildTrustedJarvisMeasurementSubmission } from '../src/application/measurement-submission/jarvis-measurement-submission.js';
import {
  assertMeasurementFinancialPayload,
  buildMeasurementFinancials,
  formatMeasurerPayerText,
} from '../src/domain/measurement-financials.js';
import type { OrderMemory } from '../src/domain/index.js';
import {
  encodeMeasurementSheetRequest,
  encodeUpcomingMeasurementDocument,
} from '../src/infrastructure/measurement-submission/index.js';
import {
  applyCommercialFact,
  applyCustomerFact,
  applyOrderItemFact,
  createOrderMemory,
} from '../src/jarvis/memory/index.js';
import { persistTestQuote } from './helpers/persist-test-quote.js';

const NOW = '2026-08-14T10:00:00.000Z';
const SOURCE = {
  sourceMessageId: 'money-message',
  sourceChannel: 'telegram' as const,
  sourceTimestamp: NOW,
};

async function readyMemory(conversationId: string, total = 15_200): Promise<OrderMemory> {
  let memory = createOrderMemory({
    orderId: conversationId,
    conversationId,
    itemIds: ['item-1'],
    now: NOW,
  });
  for (const [field, value] of [
    ['productType', 'FRAME'],
    ['profileColor', 'WHITE'],
    ['meshType', 'STANDARD'],
    ['widthMm', 1000],
    ['heightMm', 1500],
    ['measurementBasis', 'PRODUCT_SIZE'],
  ] as const) {
    memory = applyOrderItemFact(memory, {
      orderItemId: 'item-1',
      field,
      value,
      source: SOURCE,
    }).memory;
  }
  memory = applyCustomerFact(memory, {
    field: 'phone',
    value: '+79990000000',
    source: SOURCE,
  }).memory;
  memory = applyCustomerFact(memory, {
    field: 'address',
    value: 'Москва, Тверская 1',
    source: SOURCE,
  }).memory;
  memory = (await persistTestQuote(memory, total)).memory;
  memory = { ...memory, revision: memory.revision ?? 1 };
  memory = applyCommercialFact(memory, {
    field: 'preliminaryPriceAccepted',
    value: true,
    source: SOURCE,
  }).memory;
  return applyCommercialFact(memory, {
    field: 'measurementAgreed',
    value: true,
    source: SOURCE,
  }).memory;
}

describe('Task 14.1.1 measurement financial model', () => {
  it('MONEY-1 customer pays measurer', () => {
    const financials = buildMeasurementFinancials({
      preliminaryTotalRub: 15_000,
      measurerPayer: 'CUSTOMER',
    });

    expect(financials).toEqual({
      preliminaryTotalRub: 15_000,
      measurerPayoutRub: 1000,
      measurerPayer: 'CUSTOMER',
      customerDepositRub: 1000,
      remainingBalanceRub: 14_000,
      payerText: 'Заказчик',
    });
    expect(formatMeasurerPayerText('CUSTOMER')).toBe('Заказчик');
  });

  it('MONEY-2 company pays measurer', () => {
    const financials = buildMeasurementFinancials({
      preliminaryTotalRub: 15_000,
      measurerPayer: 'COMPANY',
    });

    expect(financials).toEqual({
      preliminaryTotalRub: 15_000,
      measurerPayoutRub: 1000,
      measurerPayer: 'COMPANY',
      customerDepositRub: 0,
      remainingBalanceRub: 15_000,
      payerText: 'фирма',
    });
  });

  it('MONEY-3 trusted Jarvis quote stays 15200 with deposit and balance', async () => {
    const memory = await readyMemory('conversation-money-3', 15_200);
    const submission = buildTrustedJarvisMeasurementSubmission(memory);

    expect(submission.preliminaryTotalRub).toBe(15_200);
    expect(submission.measurerPayoutRub).toBe(1000);
    expect(submission.customerDepositRub).toBe(1000);
    expect(submission.remainingBalanceRub).toBe(14_200);
    expect(memory.preliminaryQuote?.publicTotalRub).toBe(15_200);
  });

  it('MONEY-4 payout is not added on top of customer total', async () => {
    const memory = await readyMemory('conversation-money-4', 15_200);
    const submission = buildTrustedJarvisMeasurementSubmission(memory);
    const quoteTotal = memory.preliminaryQuote?.publicTotalRub;

    expect(quoteTotal).toBe(submission.preliminaryTotalRub);
    expect(quoteTotal).not.toBe(submission.preliminaryTotalRub + submission.measurerPayoutRub);
  });

  it('MONEY-5 rejects inconsistent derived values', () => {
    expect(() =>
      assertMeasurementFinancialPayload({
        preliminaryTotalRub: 15_000,
        measurerPayoutRub: 1000,
        measurerPayer: 'CUSTOMER',
        customerDepositRub: 0,
        remainingBalanceRub: 15_000,
      }),
    ).toThrow(/inconsistent/i);
  });

  it('MONEY-6 rejects totals below customer deposit', () => {
    expect(() =>
      buildMeasurementFinancials({
        preliminaryTotalRub: 500,
        measurerPayer: 'CUSTOMER',
      }),
    ).toThrow(/exceeds preliminaryTotalRub/i);
  });

  it('maps Firestore legacy payout and technical totals separately', async () => {
    const memory = await readyMemory('conversation-money-firestore', 15_200);
    const submission = buildTrustedJarvisMeasurementSubmission(memory);
    const doc = encodeUpcomingMeasurementDocument({
      submission,
      createdAt: NOW,
      updatedAt: NOW,
      sheetSyncStatus: 'pending',
      sheetSyncUpdatedAt: NOW,
    });

    expect(doc.amount_rub).toBe(1000);
    expect(doc.preliminaryTotalRub).toBe(15_200);
    expect(doc.customerDepositRub).toBe(1000);
    expect(doc.remainingBalanceRub).toBe(14_200);
    expect(doc.payer_text).toBe('Заказчик');
  });

  it('maps Sheet request payout to column F semantics', async () => {
    const memory = await readyMemory('conversation-money-sheet', 15_200);
    const submission = buildTrustedJarvisMeasurementSubmission(memory);
    const payload = encodeMeasurementSheetRequest(submission);

    expect(payload.amount_rub).toBe(1000);
    expect(payload.payer_text).toBe('Заказчик');
    expect(payload.preliminaryTotalRub).toBe(15_200);
    expect(payload.remainingBalanceRub).toBe(14_200);
    expect(payload).not.toHaveProperty('comment');
  });
});
