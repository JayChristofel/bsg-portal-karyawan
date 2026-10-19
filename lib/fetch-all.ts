/**
 * Loads a keyset-paged list endpoint (`{ rows, nextBefore }`) completely, one page
 * per request, so no single response nears the platform's body-size limit.
 * Throws on a non-OK page instead of returning a silently truncated list.
 */
export async function fetchAllRows<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let before: number | null = null;
  for (;;) {
    const sep = url.includes('?') ? '&' : '?';
    const res: Response = await fetch(`${url}${before === null ? '' : `${sep}before=${before}`}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
    const page = (await res.json()) as { rows: T[]; nextBefore: number | null };
    out.push(...page.rows);
    if (page.nextBefore === null) return out;
    before = page.nextBefore;
  }
}
