import { db } from '@/db';
import { autoResumeRuns } from '@/db/schema';
import { and, eq, gt, sql } from 'drizzle-orm';
import { rowsOf } from '@/lib/db-util';

/**
 * Control channel for the auto-resume drain, persisted in `auto_resume_runs`.
 *
 * On Vercel every request may land on a different instance, so in-memory flags
 * cannot coordinate "is a drain running" or "stop it". A run is 'running' while
 * its worker keeps bumping `last_heartbeat_at`; a run whose heartbeat is older
 * than HEARTBEAT_TTL_MS is considered dead and no longer blocks a new one.
 * 'stopping' is the cancel request the worker polls for.
 */

const HEARTBEAT_TTL_MS = 5 * 60_000;

function liveSince(): Date {
  return new Date(Date.now() - HEARTBEAT_TTL_MS);
}

/**
 * Registers a run unless a live one exists. Returns the run id or null.
 *
 * "INSERT ... WHERE NOT EXISTS" alone is not atomic: under READ COMMITTED two
 * concurrent callers both see no live run and both insert (the integration test
 * demonstrates 10 of 10 getting through). A transaction-scoped advisory lock makes
 * the check-and-insert a critical section; it is released automatically on commit
 * and is safe with transaction-mode poolers.
 */
export async function tryStartRun(queued: number): Promise<number | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('auto_resume_run'))`);
    const result = await tx.execute(sql`
      INSERT INTO auto_resume_runs (status, messages_sent, queued_remaining, last_heartbeat_at)
      SELECT 'running', 0, ${queued}, NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM auto_resume_runs
         WHERE status IN ('running', 'stopping')
           AND finished_at IS NULL
           AND last_heartbeat_at > ${liveSince().toISOString()}::timestamptz
      )
      RETURNING id
    `);
    return rowsOf<{ id: number }>(result)[0]?.id ?? null;
  });
}

export async function heartbeat(runId: number, sent: number): Promise<void> {
  await db
    .update(autoResumeRuns)
    .set({ lastHeartbeatAt: new Date(), messagesSent: sent })
    .where(eq(autoResumeRuns.id, runId));
}

export async function isCancelRequested(runId: number): Promise<boolean> {
  const [row] = await db
    .select({ status: autoResumeRuns.status })
    .from(autoResumeRuns)
    .where(eq(autoResumeRuns.id, runId));
  return row?.status === 'stopping';
}

/** Returns how many live runs were asked to stop (0 = nothing was running). */
export async function requestAutoResumeCancel(): Promise<number> {
  const rows = await db
    .update(autoResumeRuns)
    .set({ status: 'stopping' })
    .where(
      and(
        eq(autoResumeRuns.status, 'running'),
        gt(autoResumeRuns.lastHeartbeatAt, liveSince()),
      ),
    )
    .returning({ id: autoResumeRuns.id });
  return rows.length;
}

export async function isAutoResumeRunning(): Promise<boolean> {
  const rows = await db
    .select({ id: autoResumeRuns.id })
    .from(autoResumeRuns)
    .where(
      and(
        sql`${autoResumeRuns.status} IN ('running', 'stopping')`,
        sql`${autoResumeRuns.finishedAt} IS NULL`,
        gt(autoResumeRuns.lastHeartbeatAt, liveSince()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
