import { db } from '@/db';
import { recipients } from '@/db/schema';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';

/**
 * Recipient send lifecycle: pending -> sending -> sent | failed.
 *
 * A row is claimed with a conditional UPDATE *before* the gateway call, so two
 * concurrent senders (auto-resume, a second tab, a double click) can never both
 * pick the same recipient. A 'failed' row is never retried automatically: a
 * timeout may mean the message left the device, so only an admin re-sends it.
 */

type Claimable = 'pending' | 'failed';

const STALE_SENDING_MS = 15 * 60_000;

export async function claimRecipient(
  id: number,
  from: Claimable[] = ['pending'],
): Promise<boolean> {
  const fromPending = from.includes('pending');
  const states = from.filter((s) => s !== 'pending');
  const cond = [
    ...(fromPending ? [isNull(recipients.waStatus), eq(recipients.waStatus, 'pending')] : []),
    ...(states.length ? [inArray(recipients.waStatus, states)] : []),
  ];
  const rows = await db
    .update(recipients)
    .set({ waStatus: 'sending', waSentAt: new Date() })
    .where(and(eq(recipients.id, id), or(...cond)))
    .returning({ id: recipients.id });
  return rows.length > 0;
}

export async function markRecipientSent(
  id: number,
  messageId: string | null,
  message?: string,
): Promise<void> {
  await db
    .update(recipients)
    .set({
      waMessageId: messageId,
      waStatus: 'sent',
      waSentAt: new Date(),
      ...(message !== undefined ? { message } : {}),
    })
    .where(and(eq(recipients.id, id), eq(recipients.waStatus, 'sending')));
}

/** Gateway refused or the outcome is unknown: park it for a human, do not auto-retry. */
export async function markRecipientFailed(id: number): Promise<void> {
  await db
    .update(recipients)
    .set({ waStatus: 'failed', waSentAt: null })
    .where(and(eq(recipients.id, id), eq(recipients.waStatus, 'sending')));
}

/** Nothing left the device (quota block): put it back in the queue. */
export async function releaseRecipient(id: number): Promise<void> {
  await db
    .update(recipients)
    .set({ waStatus: 'pending', waSentAt: null })
    .where(and(eq(recipients.id, id), eq(recipients.waStatus, 'sending')));
}

/** A worker that died mid-send leaves 'sending' rows; park them as failed for review. */
export async function sweepStaleSending(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SENDING_MS);
  const rows = await db
    .update(recipients)
    .set({ waStatus: 'failed', waSentAt: null })
    .where(and(eq(recipients.waStatus, 'sending'), lt(recipients.waSentAt, cutoff)))
    .returning({ id: recipients.id });
  return rows.length;
}

/** Normalises the several shapes GOWA answers with. Strict on purpose: no substring guessing. */
export function parseSendResult(result: unknown): { messageId: string | null; isSuccess: boolean } {
  const r = (result ?? {}) as {
    code?: string;
    message_id?: string;
    results?: { message_id?: string; id?: string };
  };
  const messageId = r.results?.message_id || r.results?.id || r.message_id || null;
  const isSuccess = r.code === 'SUCCESS' || r.code === 'OK' || Boolean(messageId);
  return { messageId, isSuccess };
}

/** Function replacer so `$&`, `$1` etc. inside a name are inserted literally. */
export function renderMessage(
  body: string,
  vars: { nama: string; link: string },
): string {
  return body
    .replace(/\{nama\}/gi, () => vars.nama)
    .replace(/\{link\}/gi, () => vars.link);
}

export function portalLinkFrom(origin?: string | null): string {
  const base =
    origin ||
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '');
  return `${base.replace(/\/$/, '')}/`;
}
