/**
 * Small input helpers so malformed requests become 400s instead of TypeErrors
 * (and therefore 500s) deep inside a handler.
 */

/** Parses the body as a JSON *object*; null, arrays, scalars and bad JSON give null. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Trimmed string capped at `max` chars; any non-string becomes ''. */
export function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Positive integer from a route param ("12" ok; "1.5", "12abc", "-1", "" are not). */
export function parseId(raw: unknown): number | null {
  if (typeof raw === 'number') raw = String(raw);
  if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

/** Finite number clamped into [min, max] and rounded; anything else gives `fallback`. */
export function boundedInt(value: unknown, min: number, max: number, fallback = min): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Valid calendar date (YYYY-MM-DD) or null. */
export function parseDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

/** Keyset paging params: `?limit=` (1..max) and `?before=<id>` (rows with a smaller id). */
export function parsePageParams(sp: URLSearchParams, max = 1000): { limit: number; before: number | null } {
  const lim = sp.get('limit');
  const bef = sp.get('before');
  return {
    limit: boundedInt(lim === null ? NaN : Number(lim), 1, max, max),
    before: bef !== null && /^\d+$/.test(bef) ? Number(bef) : null,
  };
}
