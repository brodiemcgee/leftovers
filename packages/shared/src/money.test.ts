import { describe, expect, it } from 'vitest';
import { dollarsToCents, centsToDollars, formatAud, sumCents } from './money.js';

describe('money', () => {
  it('dollarsToCents rounds half away from zero', () => {
    expect(dollarsToCents(1.005)).toBe(101);
    expect(dollarsToCents(-1.005)).toBe(-100);
    expect(dollarsToCents(0)).toBe(0);
  });

  it('centsToDollars is exact for cent values', () => {
    expect(centsToDollars(347900)).toBe(3479);
    expect(centsToDollars(-12345)).toBe(-123.45);
  });

  it('formatAud renders en-AU thousands separators', () => {
    expect(formatAud(347900)).toBe('$3,479.00');
    expect(formatAud(-5050)).toBe('-$50.50');
    expect(formatAud(0)).toBe('$0.00');
    expect(formatAud(123, { sign: 'always' })).toBe('+$1.23');
  });

  it('sumCents handles empty + signed', () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([100, -50, 25])).toBe(75);
  });

  it('dollarsToCents rejects non-finite', () => {
    expect(() => dollarsToCents(Number.NaN)).toThrow();
    expect(() => dollarsToCents(Number.POSITIVE_INFINITY)).toThrow();
  });
});
