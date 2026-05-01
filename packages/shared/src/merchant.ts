/**
 * Merchant string normalisation. Australian bank descriptors are notoriously messy:
 *   "WW METRO 1234 RICHMOND      AUS"
 *   "SQ *FRIENDS COFFEE      MELBOURN"
 *   "PAYPAL *SPOTIFYAU"
 * We strip noise so rule patterns and recurrence detection have a stable string.
 */

const NOISE_TOKENS = [
  /\b(?:AUS|AU|AUSTRALIA)\b/gi,
  /\b(?:VIC|NSW|QLD|SA|WA|TAS|ACT|NT)\b/gi,
  /\b\d{4,}\b/g,
  /\b(?:CARD|EFTPOS|VISA|MASTERCARD|AMEX|DEBIT|CREDIT|PURCHASE|PAYMENT|TRANSACTION)\b/gi,
  /\b(?:PAYPAL|SQ|SQUARE|STRIPE|XSOLLA)\s*\*/gi,
  /[*#]+/g,
];

export function normaliseMerchant(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.toUpperCase();
  for (const re of NOISE_TOKENS) {
    s = s.replace(re, ' ');
  }
  s = s.replace(/[^A-Z0-9& '-]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function merchantSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aw = new Set(a.split(/\s+/).filter((w) => w.length >= 3));
  const bw = new Set(b.split(/\s+/).filter((w) => w.length >= 3));
  if (aw.size === 0 || bw.size === 0) return 0;
  let inter = 0;
  for (const w of aw) if (bw.has(w)) inter += 1;
  return inter / Math.min(aw.size, bw.size);
}
