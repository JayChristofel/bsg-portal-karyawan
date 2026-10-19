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
