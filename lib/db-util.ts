/**
 * Rows from `db.execute(sql...)`, whichever driver shape it returns.
 *
 * The postgres-js driver used here returns the rows as an array (with the affected
 * count on `.count`), while node-postgres returns `{ rows, rowCount }`. Reading only
 * `rowCount`/`rows`, as the first version of the quota code did, yields nothing on
 * postgres-js and silently turns "did my UPDATE match?" into "no" every time.
 * Statements whose outcome matters should end in RETURNING and be checked via this.
 */
export function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}
