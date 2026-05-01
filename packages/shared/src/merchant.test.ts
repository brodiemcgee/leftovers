import { describe, expect, it } from 'vitest';
import { merchantSimilarity, normaliseMerchant } from './merchant.js';

describe('normaliseMerchant', () => {
  it('strips state codes and trailing junk', () => {
    expect(normaliseMerchant('WW METRO 1234 RICHMOND VIC AUS')).toBe('WW METRO RICHMOND');
  });

  it('strips processor prefixes', () => {
    expect(normaliseMerchant('PAYPAL *SPOTIFYAU')).toBe('SPOTIFYAU');
    expect(normaliseMerchant('SQ *FRIENDS COFFEE')).toBe('FRIENDS COFFEE');
  });

  it('handles null / empty', () => {
    expect(normaliseMerchant(null)).toBe('');
    expect(normaliseMerchant('')).toBe('');
  });
});

describe('merchantSimilarity', () => {
  it('1.0 for identical', () => {
    expect(merchantSimilarity('SPOTIFY', 'SPOTIFY')).toBe(1);
  });
  it('handles partial overlap', () => {
    const s = merchantSimilarity('AMAZON PRIME VIDEO', 'AMAZON VIDEO STORE');
    expect(s).toBeGreaterThan(0.4);
  });
  it('zero on disjoint', () => {
    expect(merchantSimilarity('SPOTIFY', 'NETFLIX')).toBe(0);
  });
});
