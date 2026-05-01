/**
 * Money helpers. All money in Leftovers is integer cents.
 * Never use Number.prototype arithmetic across cent boundaries — use these.
 */

export type Cents = number;

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export function dollarsToCents(dollars: number): Cents {
  if (!Number.isFinite(dollars)) {
    throw new Error(`dollarsToCents: not finite — ${dollars}`);
  }
  const c = Math.round(dollars * 100);
  if (Math.abs(c) > MAX_SAFE_CENTS) {
    throw new Error(`dollarsToCents: out of safe integer range — ${dollars}`);
  }
  return c;
}

export function centsToDollars(cents: Cents): number {
  return cents / 100;
}

export function formatAud(cents: Cents, options: { sign?: 'never' | 'auto' | 'always' } = {}): string {
  const sign = options.sign ?? 'auto';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remCents = abs % 100;
  const formatted = `$${dollars.toLocaleString('en-AU')}.${remCents.toString().padStart(2, '0')}`;
  if (sign === 'never') return formatted;
  if (cents < 0) return `-${formatted}`;
  if (sign === 'always') return `+${formatted}`;
  return formatted;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}
