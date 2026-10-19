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
