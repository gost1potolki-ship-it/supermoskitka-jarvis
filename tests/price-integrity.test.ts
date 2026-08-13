import {
  PriceIntegrityGuard,
  extractCurrencyAmounts,
  formatRubAmount,
  uniqueCurrencyAmounts,
} from '../src/jarvis/pricing/index.js';
import { describe, expect, it } from 'vitest';

describe('PriceIntegrityGuard', () => {
  const guard = new PriceIntegrityGuard();

  it('PRICE-1 wrong total → fallback with authoritative amount', () => {
    const result = guard.enforce('Стоимость составит 3650 рублей.', {
      mode: 'PRODUCT_ONLY',
      authoritativeTotal: 1790,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('wrong_total');
    expect(result.outgoingText).toContain('1 790 ₽');
    expect(result.outgoingText).not.toContain('3650');
  });

  it('PRICE-2 correct total accepted', () => {
    const result = guard.enforce('Стоимость — 1 790 ₽.', {
      mode: 'PRODUCT_ONLY',
      authoritativeTotal: 1790,
    });
    expect(result.accepted).toBe(true);
    expect(result.outgoingText).toBe('Стоимость — 1 790 ₽.');
  });

  it('PRICE-3 formatting variant accepted', () => {
    const result = guard.enforce('Стоимость — 1790 рублей.', {
      mode: 'PRODUCT_ONLY',
      authoritativeTotal: 1790,
    });
    expect(result.accepted).toBe(true);
  });

  it('PRICE-4 missing total → fallback', () => {
    const result = guard.enforce('Стоимость рассчитана.', {
      mode: 'PRODUCT_ONLY',
      authoritativeTotal: 1790,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('missing_total');
    expect(result.outgoingText).toBe(
      'Стоимость изделия по указанным параметрам — 1 790 ₽.',
    );
  });

  it('PRICE-5 correct + conflicting amount → fallback', () => {
    const result = guard.enforce('Итого 1 790 ₽, с учётом чего-то будет 2 100 ₽', {
      mode: 'PRODUCT_ONLY',
      authoritativeTotal: 1790,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('conflicting_amounts');
    expect(result.outgoingText).not.toContain('2100');
    expect(result.outgoingText).not.toContain('2 100');
  });

  it('PRICE-6 dimensions do not trigger conflict', () => {
    const result = guard.enforce('Рамочная сетка 1000×1500 мм — 1 790 ₽.', {
      mode: 'PRODUCT_ONLY',
      authoritativeTotal: 1790,
    });
    expect(result.accepted).toBe(true);
    expect(uniqueCurrencyAmounts('Рамочная сетка 1000×1500 мм — 1 790 ₽.')).toEqual([1790]);
  });

  it('PRICE-7 PRODUCT_ONLY fallback wording', () => {
    const result = guard.enforce('ок', {
      mode: 'PRODUCT_ONLY',
      authoritativeTotal: 1790,
    });
    expect(result.outgoingText).toBe(
      'Стоимость изделия по указанным параметрам — 1 790 ₽.',
    );
  });

  it('PRICE-8 PRELIMINARY_ALL_IN fallback wording', () => {
    const result = guard.enforce('ок', {
      mode: 'PRELIMINARY_ALL_IN',
      authoritativeTotal: 1790,
    });
    expect(result.outgoingText).toBe(
      'Предварительная стоимость по указанным параметрам — 1 790 ₽ под ключ.',
    );
  });

  it('money helpers format and extract currency-marked amounts only', () => {
    expect(formatRubAmount(1790)).toBe('1 790 ₽');
    expect(extractCurrencyAmounts('1000×1500 и ещё текст')).toEqual([]);
    expect(extractCurrencyAmounts('1 790 руб.')).toEqual([1790]);
  });
});
