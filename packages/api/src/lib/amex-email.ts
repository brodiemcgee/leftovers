/**
 * Parser for Amex Australia transaction-alert emails.
 *
 * Two real-world delivery shapes:
 *
 * 1. Direct: Amex sends to a mailbox we receive at. From-header is
 *    `AmericanExpress@welcome.americanexpress.com`.
 * 2. Forwarded: Amex sends to the user's normal inbox; the user (or a
 *    Gmail filter) forwards to our `amex+<alias>@…` address. From-header
 *    becomes the user; the original Amex headers are quoted INSIDE the
 *    body (text + html).
 *
 * Either way the body has the canonical Amex AU alert structure:
 *
 *   From: American Express <AmericanExpress@welcome.americanexpress.com>
 *   …
 *   You asked us to let you know whenever a transaction greater than A$1.00
 *   was made on your Qantas American Express Ultimate Card.
 *
 *   2 May 2026 KMART
 *
 *   A$16.00
 *
 * The "A$1.00" line in the prelude is the user's alert threshold — we MUST
 * skip it and grab the amount that follows the date+merchant line.
 *
 * Returns null for anything that doesn't look like an Amex alert (caller
 * silently drops those without crashing the inbound queue).
 */

export interface ParsedAmexAlert {
  amountCents: number;
  merchantRaw: string;
  postedAt: string; // ISO 8601 UTC
  /** Stable per-purchase id so duplicate alerts collapse on upsert. */
  syntheticId: string;
}

export function parseAmexAlert(opts: { from: string; subject: string; html: string; text: string }): ParsedAmexAlert | null {
  // Body — prefer text, fall back to a stripped HTML version.
  const text = opts.text ?? '';
  const html = opts.html ?? '';
  const body = text.trim().length > 50 ? text : stripHtml(html);
  if (!body) return null;

  // 1. Confirm this is an Amex alert. Either the headers or the body
  //    must mention an americanexpress.com sender, plus the canonical
  //    "Transaction Update" / "transaction" wording.
  if (!looksLikeAmex(opts.from, opts.subject, body)) return null;

  // 2. Find the date+merchant line and the amount that follows it.
  //    Pattern in the body:
  //      "2 May 2026 KMART"
  //      ""
  //      "A$16.00"
  const txMatch = matchAmexTransaction(body);
  if (!txMatch) return null;

  const isoDate = parseAuDate(txMatch.dateRaw);
  if (!isoDate) return null;

  return {
    amountCents: txMatch.amountCents,
    merchantRaw: txMatch.merchantRaw,
    postedAt: isoDate,
    syntheticId: stableId(txMatch.merchantRaw, txMatch.amountCents, isoDate),
  };
}

// MARK: - Detection

const AMEX_DOMAINS = /\bamericanexpress\.com(\.au)?\b/i;

function looksLikeAmex(fromHeader: string, subject: string, body: string): boolean {
  if (AMEX_DOMAINS.test(fromHeader)) return true;
  // Forwarded mail: the original Amex sender is quoted in the body.
  if (AMEX_DOMAINS.test(body)) return true;
  // Belt-and-braces: subject mentions a transaction update from Amex
  if (/transaction update/i.test(subject) && /american express/i.test(body)) return true;
  return false;
}

// MARK: - Transaction extraction

interface TxMatch { dateRaw: string; merchantRaw: string; amountCents: number }

/**
 * Find the line that has a date + merchant name, then the next line with
 * an A$ amount. We deliberately scan windows so the alert-threshold value
 * (e.g. "transactions greater than A$1.00") is excluded — that line has
 * a different shape (no date prefix and no following amount-only line).
 */
function matchAmexTransaction(body: string): TxMatch | null {
  // Date-and-merchant on one logical line. Allow optional whitespace and
  // an arbitrary merchant string (Amex uses ALL CAPS but we stay tolerant).
  const dateMerchantRe =
    /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+([A-Z][A-Z0-9 &',.\-/*]{2,80}[A-Z0-9*])/g;
  const amountRe = /A?\$\s*([0-9][0-9,]*\.[0-9]{2})/;

  for (const dm of body.matchAll(dateMerchantRe)) {
    const after = body.slice((dm.index ?? 0) + dm[0].length, (dm.index ?? 0) + dm[0].length + 200);
    const am = after.match(amountRe);
    if (!am) continue;
    const amount = parseCents(am[1]!);
    if (amount === null || amount === 0) continue;
    const merchantRaw = dm[2]!.trim();
    if (looksLikeNoise(merchantRaw)) continue;
    return { dateRaw: dm[1]!.trim(), merchantRaw, amountCents: amount };
  }
  return null;
}

function parseCents(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const NOISE_MERCHANTS = /^(MCGEE|ACCOUNT|TRANSACTION|UPDATE|VIEW|MANAGE|PRIVACY|CONTACT|STOP|PLEASE|YOUR|AMERICAN|EXPRESS)$/i;
function looksLikeNoise(s: string): boolean {
  return NOISE_MERCHANTS.test(s) || s.length < 3;
}

// MARK: - Date

function parseAuDate(raw: string): string | null {
  // Format examples: "1 May 2026", "01 May 2026". No time → midday Aussie
  // for the transaction so timezone arithmetic doesn't bump us off the
  // calendar day in either direction.
  const d = new Date(`${raw} 12:00:00 UTC+10`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// MARK: - HTML strip

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// MARK: - Stable id

function stableId(merchant: string, amountCents: number, isoDate: string): string {
  // Day-level grain: Amex sometimes resends the same alert and we don't
  // want a duplicate per purchase.
  const day = isoDate.slice(0, 10);
  const slug = merchant.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `amex-email:${day}:${slug}:${amountCents}`;
}
