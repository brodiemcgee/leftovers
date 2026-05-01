import { describe, expect, it } from 'vitest';
import { findInternalPairs } from './internal-transfer.js';

describe('findInternalPairs', () => {
  it('pairs equal-and-opposite cross-account transactions inside 48h', () => {
    const pairs = findInternalPairs([
      { id: 'a', accountId: 'A', postedAt: '2026-04-15T10:00:00Z', amountCents: -50000, currency: 'AUD' },
      { id: 'b', accountId: 'B', postedAt: '2026-04-15T11:00:00Z', amountCents: 50000, currency: 'AUD' },
      { id: 'c', accountId: 'A', postedAt: '2026-04-16T09:00:00Z', amountCents: -2000, currency: 'AUD' },
    ]);
    expect(pairs).toEqual([{ outboundId: 'a', inboundId: 'b' }]);
  });

  it('skips same-account "transfers"', () => {
    const pairs = findInternalPairs([
      { id: 'a', accountId: 'A', postedAt: '2026-04-15T10:00:00Z', amountCents: -50000, currency: 'AUD' },
      { id: 'b', accountId: 'A', postedAt: '2026-04-15T11:00:00Z', amountCents: 50000, currency: 'AUD' },
    ]);
    expect(pairs).toEqual([]);
  });

  it('skips amounts that differ', () => {
    const pairs = findInternalPairs([
      { id: 'a', accountId: 'A', postedAt: '2026-04-15T10:00:00Z', amountCents: -50000, currency: 'AUD' },
      { id: 'b', accountId: 'B', postedAt: '2026-04-15T11:00:00Z', amountCents: 49900, currency: 'AUD' },
    ]);
    expect(pairs).toEqual([]);
  });

  it('skips when the inbound is too far away in time', () => {
    const pairs = findInternalPairs([
      { id: 'a', accountId: 'A', postedAt: '2026-04-15T10:00:00Z', amountCents: -50000, currency: 'AUD' },
      { id: 'b', accountId: 'B', postedAt: '2026-04-19T11:00:00Z', amountCents: 50000, currency: 'AUD' },
    ]);
    expect(pairs).toEqual([]);
  });

  it('does not double-pair the same transaction', () => {
    const pairs = findInternalPairs([
      { id: 'a', accountId: 'A', postedAt: '2026-04-15T10:00:00Z', amountCents: -50000, currency: 'AUD' },
      { id: 'b', accountId: 'B', postedAt: '2026-04-15T11:00:00Z', amountCents: 50000, currency: 'AUD' },
      { id: 'c', accountId: 'C', postedAt: '2026-04-15T12:00:00Z', amountCents: 50000, currency: 'AUD' },
    ]);
    expect(pairs).toEqual([{ outboundId: 'a', inboundId: 'b' }]);
  });
});
