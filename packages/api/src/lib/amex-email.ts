/**
 * Parser for Amex Australia transaction-alert emails.
 *
 * Amex sends one alert per purchase (when "Account Alerts → Charge over $X"
 * or "Charge approved" is enabled). The body has a stable structure:
 *
 *   Amount: AUD 25.70
 *   Merchant: SCHNITZ - BARKLY SQU
 *   Date: 1 May 2026 06:41 PM
 *
 * We tolerate small variations in spacing/case and either the HTML or text
 * version of the multipart message — the regexes accept both.
 *
 * Returns null if the email doesn't look like an Amex alert (caller can log
 * + ignore those without mis-categorising).
 */

export interface ParsedAmexAlert {
  amountCents: number;
  merchantRaw: string;
  postedAt: string; // ISO 8601 UTC
  /** Stable per-purchase id. Amex doesn't include one, so we hash the
   *  meaningful fields. Same purchase → same id, idempotent upsert. */
  syntheticId: string;
}

const FROM_ALLOWLIST = [/@americanexpress\.com(\.au)?$/i, /@amex\.com(\.au)?$/i];

export function isAmexSender(fromEmail: string): boolean {
  const e = fromEmail.toLowerCase();
  return FROM_ALLOWLIST.some((re) => re.test(e));
}

export function parseAmexAlert(opts: { from: string; subject: string; html: string; text: string }): ParsedAmexAlert | null {
  if (!isAmexSender(opts.from)) return null;

  // Prefer text body; fall back to a stripped HTML version.
  const body = opts.text && opts.text.trim().length > 50 ? opts.text : stripHtml(opts.html);
  if (!body) return null;

  const amount = matchAmount(body);
  const merchant = matchMerchant(body);
  const date = matchDate(body, opts.subject);
  if (!amount || !merchant || !date) return null;

  const id = stableId(merchant, amount, date);
  return {
    amountCents: amount,
    merchantRaw: merchant,
    postedAt: date,
    syntheticId: id,
  };
}

function matchAmount(body: string): number | null {
  // Examples that should match:
  //   "AUD 25.70", "AUD$25.70", "Amount: AUD 25.70", "$25.70 AUD",
  //   "$1,234.56", "for AUD 1,234.56"
  const candidates = [
    /(?:amount|charge|spent|transaction)[^0-9$]{0,15}(?:AUD|\$)\s*\$?([0-9][0-9,]*\.[0-9]{2})/i,
    /(?:AUD|\$)\s*\$?([0-9][0-9,]*\.[0-9]{2})/,
  ];
  for (const re of candidates) {
    const m = body.match(re);
    if (m && m[1]) {
      const cleaned = m[1].replace(/,/g, '');
      const n = Number.parseFloat(cleaned);
      if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
    }
  }
  return null;
}

function matchMerchant(body: string): string | null {
  // Common patterns:
  //   "Merchant: SCHNITZ - BARKLY SQU"
  //   "Where:\n   SCHNITZ - BARKLY SQU"
  //   "at SCHNITZ - BARKLY SQU on..."
  const lineLabelled = body.match(/(?:merchant|where|location|at)\s*[:\-]\s*([^\n\r]+?)(?:\s{2,}|$)/i);
  if (lineLabelled && lineLabelled[1]) {
    const m = lineLabelled[1].trim();
    if (m.length >= 2 && m.length <= 120 && !/^\d+$/.test(m)) return m;
  }
  // Fallback: line that's all caps with a reasonable length, often
  // surrounded by whitespace or table cell content.
  const upperLine = body.match(/(?<=\s)([A-Z][A-Z0-9 &',\-./]{4,80}[A-Z0-9])(?=\s*\n)/);
  if (upperLine && upperLine[1]) return upperLine[1].trim();
  return null;
}

function matchDate(body: string, subject: string): string | null {
  // Amex AU emails carry a header date like "1 May 2026 06:41 PM" near
  // the body and the subject sometimes contains "for 1 May".
  const candidates = [
    body.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?)/i),
    subject.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i),
  ];
  for (const m of candidates) {
    if (m && m[1]) {
      const parsed = parseAuDate(m[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function parseAuDate(raw: string): string | null {
  // Use the JS engine, but anchor to AEST to interpret times reasonably.
  // Format examples: "1 May 2026", "01 May 2026 6:41 PM", "1 May 2026 06:41 PM"
  const d = new Date(`${raw} UTC+10`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

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

function stableId(merchant: string, amountCents: number, isoDate: string): string {
  // Truncate to minute precision so a duplicate Amex alert (Amex sometimes
  // resends) collapses to the same id.
  const minute = isoDate.slice(0, 16);
  const slug = merchant.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `amex-email:${minute}:${slug}:${amountCents}`;
}
