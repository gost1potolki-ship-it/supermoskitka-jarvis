/** Deterministic RUB money helpers for integer engine totals. */

const THIN_SPACES = /[\s\u00a0\u202f]/g;

/** Format integer rubles as `1 790 ₽`. */
export function formatRubAmount(total: number): string {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('formatRubAmount expects a non-negative integer');
  }
  const grouped = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} ₽`;
}

/**
 * Extract currency-marked amounts from Russian customer-facing text.
 * Dimension numbers (e.g. 1000×1500) are ignored unless marked as money.
 *
 * Note: do not require `\b` after `₽` / `руб.` — those are non-word endings.
 */
export function extractCurrencyAmounts(text: string): number[] {
  const pattern =
    /(\d{1,3}(?:[\s\u00a0\u202f]\d{3})*|\d+)\s*(?:₽|рублей|рубля|руб\.?)/giu;
  const amounts: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    const normalized = raw.replace(THIN_SPACES, '');
    if (!/^\d+$/.test(normalized)) {
      continue;
    }
    amounts.push(Number(normalized));
  }
  return amounts;
}

export function uniqueCurrencyAmounts(text: string): number[] {
  return [...new Set(extractCurrencyAmounts(text))];
}
