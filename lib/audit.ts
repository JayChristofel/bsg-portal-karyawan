import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
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
 * Build a before/after description for an update, listing only the fields that
 * actually changed.
 *
 * Values are passed through unchanged: these tables already hold encrypted or
 * redacted content where that is the case, and logging is not the place to
 * introduce a second, weaker copy of a secret.
 */
export function describeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): string {
  const parts: string[] = [];
  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    if (a === b) continue;
    parts.push(`${field}: "${a ?? ''}" → "${b ?? ''}"`);
  }
  return parts.length ? parts.join('; ') : 'no field changes';
}

/**
 * Actor label for unauthenticated endpoints. Kept in one place so the audit
 * log never mixes several spellings of the same actor.
 */
export const PUBLIC_ACTOR = 'public';