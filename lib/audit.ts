import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { getClientIp } from '@/lib/proxy';

/*
 * Endpoints reachable without a session (the public portal form, the webhook
 * receiver) pass an explicit actor such as PUBLIC_ACTOR or the device id
 * instead of resolving one from the cookie.
 */

/**
 * Append an audit entry.
 *
 * Logging must never break the request it describes, so failures are swallowed
 * after being logged to stderr. `ipAddress` is resolved from the request rather
 * than passed by callers, because a forgotten argument is how log rows end up
 * with a null IP and become useless for incident review.
 */
export async function logAudit(
  adminUsername: string,
  action: string,
  detail?: string,
  ipAddress?: string,
) {
  try {
    await db.insert(auditLog).values({
      adminUsername,
      action,
      detail: detail || null,
      ipAddress: ipAddress || null,
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

/** Convenience wrapper that takes the request and fills in the client IP. */
export async function logAuditForRequest(
  req: NextRequest,
  actor: string,
  action: string,
  detail?: string,
) {
  return logAudit(actor, action, detail, getClientIp(req));
}

/**
 * Audit entry for read-only "viewed X" events. Pages poll and re-fetch, so logging
 * every GET buries real events and makes the audit table grow without bound; one
 * entry per actor+action per `minutes` is enough to show that the data was viewed.
 */
export async function logAuditThrottled(
  req: NextRequest,
  actor: string,
  action: string,
  detail: string,
  minutes = 10,
) {
  try {
    const since = new Date(Date.now() - minutes * 60_000);
    const recent = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.adminUsername, actor), eq(auditLog.action, action), gt(auditLog.createdAt, since)))
      .limit(1);
    if (recent.length > 0) return;
  } catch (err) {
    console.error('Audit throttle check failed:', err);
  }
  await logAuditForRequest(req, actor, action, detail);
}

/**
 * Build a before/after description for an update, listing only the fields that
 * actually changed.
 *
 * Fields listed in `sensitive` (decrypted PII such as NIP or phone numbers) are
 * reported by name only: the audit log is plaintext, so writing their values
 * would be a second, weaker copy of data the database encrypts.
 */
export function describeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
  sensitive: string[] = [],
): string {
  const parts: string[] = [];
  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    if (a === b) continue;
    parts.push(
      sensitive.includes(field)
        ? `${field}: (diubah)`
        : `${field}: "${a ?? ''}" → "${b ?? ''}"`,
    );
  }
  return parts.length ? parts.join('; ') : 'no field changes';
}

/**
 * Actor label for unauthenticated endpoints. Kept in one place so the audit
 * log never mixes several spellings of the same actor.
 */
export const PUBLIC_ACTOR = 'public';