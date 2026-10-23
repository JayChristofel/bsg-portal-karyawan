import { db } from '@/db';
import { warmerPairs } from '@/db/schema';
import { eq, and, lte } from 'drizzle-orm';
import { getGatewayConfig, getSessionStatus, sendMessageGuarded, type GatewayConfig } from '@/lib/whatsapp';
import { logAudit } from '@/lib/audit';
import { hourInAppTz } from '@/lib/time';

/**
 * Active number warm-up: two gateway sessions message each other on a random
 * schedule so a fresh number accrues organic-looking activity before it is
 * used for bulk sending. This is separate from the passive quota ladder in
 * lib/whatsapp.ts (WARMUP_LADDER) — warmer traffic still goes through
 * sendMessageGuarded, so it shares that same daily cap rather than bypassing it.
 *
 * Only ever point this at numbers you own for this purpose. It does not defeat
 * WhatsApp's abuse detection, it just avoids the obvious tell of a brand-new
 * number going straight from 0 to bulk broadcast.
 */

/**
 * Small talk sent back and forth. Deliberately generic and casual — the goal
 * is to look like two people chatting, not to deliver content. Not
 * admin-editable in this version: add a settings-backed list if more variety
 * is needed later.
 * ponytail: fixed pool, no per-pair customization — add a settings-backed
 * list if 15 phrases starts looking repetitive to WhatsApp's own detection.
 */
const SMALL_TALK = [
  'Halo, lagi sibuk ga?',
  'Eh udah makan siang belum?',
  'Btw besok ada rapat jam berapa ya',
  'Oke siap, nanti aku follow up',
  'Hahaha iya bener',
  'Lagi di kantor nih',
  'Mantap, makasih infonya',
  'Ok noted',
  'Sip, nanti aku cek dulu',
  'Weekend ini ada rencana?',
  'Baik, ditunggu ya',
  'Oke lanjut aja',
  'Ntar aku kabarin lagi',
  'Gas',
  'Siap',
];

function randomDelayMs(minMinutes: number, maxMinutes: number): number {
  const lo = Math.min(minMinutes, maxMinutes);
  const hi = Math.max(minMinutes, maxMinutes);
  const minutes = lo + Math.random() * (hi - lo);
  return Math.round(minutes * 60_000);
}

function isWithinWindow(hourStart: number, hourEnd: number): boolean {
  const hour = hourInAppTz();
  return hour >= hourStart && hour < hourEnd;
}

type WarmerPair = typeof warmerPairs.$inferSelect;

/**
 * Sends one message for a pair whose turn is due, then schedules the next
 * turn (role flips, delay re-rolled). One send per pair per tick is enough
 * resolution for an interval measured in tens of minutes to a few hours.
 */
async function runPairTick(pair: WarmerPair, base: GatewayConfig): Promise<void> {
  if (!isWithinWindow(pair.activeHourStart, pair.activeHourEnd)) return;

  const fromSession = pair.nextTurn === 'a' ? pair.sessionA : pair.sessionB;
  const toSession = pair.nextTurn === 'a' ? pair.sessionB : pair.sessionA;

  try {
    // Resolved live rather than cached: whichever side is on the receiving end
    // this turn must be connected and have a known phone number right now.
    const toStatus = await getSessionStatus({ ...base, sessionId: toSession });
    if (toStatus.status !== 'ready' || !toStatus.phone) {
      throw new Error(`Session '${toSession}' is not connected.`);
    }

    const text = SMALL_TALK[Math.floor(Math.random() * SMALL_TALK.length)];
    const fromConfig: GatewayConfig = { ...base, sessionId: fromSession };
    const guarded = await sendMessageGuarded(toStatus.phone, text, fromSession, fromConfig);

    if (!guarded.ok) {
      // Daily quota exhausted for the sending session: retry later today rather
      // than spinning every tick, same turn so nothing is skipped.
      await db
        .update(warmerPairs)
        .set({
          nextDueAt: new Date(Date.now() + 6 * 3_600_000),
          lastError: `Kuota harian ${fromSession} habis`,
          updatedAt: new Date(),
        })
        .where(eq(warmerPairs.id, pair.id));
      return;
    }

    await db
      .update(warmerPairs)
      .set({
        nextTurn: pair.nextTurn === 'a' ? 'b' : 'a',
        lastMessageAt: new Date(),
        nextDueAt: new Date(Date.now() + randomDelayMs(pair.intervalMinMinutes, pair.intervalMaxMinutes)),
        messagesSent: pair.messagesSent + 1,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(warmerPairs.id, pair.id));

    void logAudit('cron', 'warmer_message', `${fromSession} -> ${toSession} (pair #${pair.id})`);
  } catch (err) {
    await db
      .update(warmerPairs)
      .set({
        lastError: (err as Error).message,
        nextDueAt: new Date(Date.now() + 15 * 60_000), // brief backoff, try again soon
        updatedAt: new Date(),
      })
      .where(eq(warmerPairs.id, pair.id));
  }
}

/** Runs every pair whose turn is due. Call this from the scheduled cron route. */
export async function runWarmerTick(): Promise<{ ran: number }> {
  const base = await getGatewayConfig();
  const due = await db
    .select()
    .from(warmerPairs)
    .where(and(eq(warmerPairs.enabled, true), lte(warmerPairs.nextDueAt, new Date())));

  for (const pair of due) {
    await runPairTick(pair, base);
  }
  return { ran: due.length };
}
