/**
 * Date helpers. Storage layer uses ISO 8601 / timestamptz.
 * Display defaults to Australia/Melbourne unless caller specifies otherwise.
 */

export const DEFAULT_TZ = 'Australia/Melbourne';

export function nowIso(): string {
  return new Date().toISOString();
}

export function startOfMonthInTz(d: Date, tz: string = DEFAULT_TZ): Date {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function endOfMonthInTz(d: Date, tz: string = DEFAULT_TZ): Date {
  const start = startOfMonthInTz(d, tz);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function formatLocalDate(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}
