/** Business time zone (WITA). Server runtimes default to UTC, so never use getHours(). */
export const APP_TZ = 'Asia/Makassar';

export function hourInAppTz(d: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return Number(h);
}

// WITA is a fixed UTC+8 with no daylight saving, so a literal offset is exact.
const WITA_OFFSET = '+08:00';

/** Start of the given calendar day (YYYY-MM-DD) in WITA, as an absolute instant. */
export function startOfDayAppTz(date: string): Date {
  return new Date(`${date}T00:00:00.000${WITA_OFFSET}`);
}

/** Last millisecond of the given calendar day (YYYY-MM-DD) in WITA. */
export function endOfDayAppTz(date: string): Date {
  return new Date(`${date}T23:59:59.999${WITA_OFFSET}`);
}

/** "19/10/2026, 14.05.00" in WITA, independent of the server's own zone. */
export function formatAppDateTime(d: Date | string | number): string {
  return new Date(d).toLocaleString('id-ID', { timeZone: APP_TZ });
}

/** ISO instant -> value for <input type="datetime-local"> in the browser's own zone. */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * <input type="datetime-local"> value -> ISO instant. The browser knows the viewer's
 * zone; the server (UTC on Vercel) does not, so a bare "2026-10-20T09:00" sent as-is
 * would be read as 09:00 UTC.
 */
export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
