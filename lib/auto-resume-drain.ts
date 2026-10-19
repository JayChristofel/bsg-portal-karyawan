import {
  sendMessageGuarded,
  getGowaConfig,
  getWarmUpState,
  getDeviceStatus,
} from '@/lib/whatsapp';
import { db } from '@/db';
import { recipients, campaigns, messageTemplates, autoResumeRuns } from '@/db/schema';
import { eq, and, or, isNull, isNotNull, inArray, sql, asc, type AnyColumn } from 'drizzle-orm';
import { tryStartRun, heartbeat, isCancelRequested } from '@/lib/auto-resume-control';
import {
  claimRecipient,
  markRecipientSent,
  markRecipientFailed,
  releaseRecipient,
  sweepStaleSending,
  parseSendResult,
  renderMessage,
  portalLinkFrom,
} from '@/lib/recipient-queue';
import { hourInAppTz } from '@/lib/time';

// A serverless invocation is killed at maxDuration (300 s). The drain stops itself
// before that so the run is closed cleanly instead of being left 'running' with a
// stale heartbeat; the next trigger (reconnect or cron) continues with what is left.
const DRAIN_BUDGET_MS = 270_000;

function getBatchConfig() {
  const batchSize = Number(process.env.BROADCAST_BATCH_SIZE) || 100;
  const timeWindowStart = Number(process.env.BROADCAST_TIME_START) || 8;
  const timeWindowEnd = Number(process.env.BROADCAST_TIME_END) || 20;
  return { batchSize, timeWindowStart, timeWindowEnd };
}

function isWithinTimeWindow(): boolean {
  const { timeWindowStart, timeWindowEnd } = getBatchConfig();
  const hour = hourInAppTz();
  return hour >= timeWindowStart && hour < timeWindowEnd;
}

/** Sleeps in short steps so a stop request and the heartbeat are never a full pause late. */
async function pauseWithHeartbeat(ms: number, runId: number, sent: number): Promise<boolean> {
  const STEP = 10_000;
  let waited = 0;
  while (waited < ms) {
    await new Promise((r) => setTimeout(r, Math.min(STEP, ms - waited)));
    waited += STEP;
    await heartbeat(runId, sent);
    if (await isCancelRequested(runId)) return true;
  }
  return false;
}

async function endRun(
  runId: number,
  status: 'completed' | 'stopped' | 'error',
  sent: number,
  queuedLeft: number,
  stopReason: string | null,
  detail?: string,
) {
  await db
    .update(autoResumeRuns)
    .set({
      status,
      finishedAt: new Date(),
      messagesSent: sent,
      queuedRemaining: queuedLeft,
      stopReason,
      detail,
    })
    .where(eq(autoResumeRuns.id, runId));
}

const hasText = (col: AnyColumn) => sql`coalesce(trim(${col}), '') <> ''`;

/**
 * Drains the pending queue in the background after the device reconnects.
 *
 * Only recipients that were deliberately queued are eligible: either ad-hoc rows
 * that already carry their own message, or rows of a campaign that is still
 * scheduled/sending. Draft or cancelled campaigns, and rows with nothing to say,
 * are left alone. Respects the same warm-up quota as every other send path.
 */
export async function drainPendingQueue(opts: { requireConnected?: boolean } = {}) {
  const deadline = Date.now() + DRAIN_BUDGET_MS;
  let runId: number | null = null;
  try {
    if (!isWithinTimeWindow()) {
      const { timeWindowStart, timeWindowEnd } = getBatchConfig();
      console.log(`Auto-resume skipped: outside time window (${timeWindowStart}:00-${timeWindowEnd}:00)`);
      return;
    }

    await sweepStaleSending();

    const config = await getGowaConfig();
    const numberId = config.deviceId;

    // A scheduled trigger must not push messages into a disconnected device: each
    // attempt would fail a real recipient. Reconnect-triggered drains skip this check.
    if (opts.requireConnected) {
      const status = (await getDeviceStatus(config).catch(() => null)) as
        | { results?: { is_connected?: boolean; is_logged_in?: boolean } }
        | null;
      if (!status?.results?.is_connected || !status.results.is_logged_in) {
        console.log('Auto-resume skipped: WhatsApp device is not connected.');
        return;
      }
    }
    const { batchSize } = getBatchConfig();

    const queue = (
      await db
        .select({
          id: recipients.id,
          label: recipients.label,
          phone: recipients.phone,
          message: recipients.message,
          templateBody: messageTemplates.body,
        })
        .from(recipients)
        .leftJoin(campaigns, eq(recipients.campaignId, campaigns.id))
        .leftJoin(messageTemplates, eq(campaigns.templateId, messageTemplates.id))
        .where(
          and(
            or(isNull(recipients.waStatus), eq(recipients.waStatus, 'pending')),
            hasText(recipients.phone),
            or(
              and(isNull(recipients.campaignId), hasText(recipients.message)),
              and(
                inArray(campaigns.status, ['scheduled', 'sending']),
                or(isNotNull(messageTemplates.id), hasText(recipients.message)),
              ),
            ),
          ),
        )
        .orderBy(asc(recipients.id))
    ).filter((r) => r.phone);

    if (queue.length === 0) {
      console.log('Auto-resume: nothing eligible.');
      return;
    }

    // Headroom may be smaller than the batch ceiling; take the lesser of the two.
    const warmUp = await getWarmUpState(numberId);
    const batch = queue.slice(0, Math.min(batchSize, warmUp.remainingToday));
    if (batch.length === 0) {
      console.log('Auto-resume: daily quota exhausted.');
      return;
    }

    runId = await tryStartRun(queue.length);
    if (runId === null) {
      console.log('Auto-resume already running; skipping duplicate drain.');
      return;
    }

    const link = portalLinkFrom();
    console.log(
      `Auto-resume: ${batch.length} in this batch, ${queue.length - batch.length} queued, ` +
        `daily quota ${warmUp.sentToday}/${warmUp.dailyLimit} (run #${runId})`,
    );

    let sent = 0;
    let stopReason: string | null = null;
    let outcome: 'completed' | 'stopped' | 'error' = 'completed';
    let detail: string | undefined;

    for (const target of batch) {
      if (await isCancelRequested(runId)) {
        stopReason = 'cancelled';
        outcome = 'stopped';
        break;
      }

      // Lost the race to another sender (manual send, second drain): skip it.
      if (!(await claimRecipient(target.id))) continue;

      try {
        const text = target.templateBody
          ? renderMessage(target.templateBody, { nama: target.label, link })
          : renderMessage(target.message ?? '', { nama: target.label, link });

        const guarded = await sendMessageGuarded(target.phone!, text, numberId, config);

        if (!guarded.ok) {
          await releaseRecipient(target.id);
          stopReason = 'quota';
          outcome = 'stopped';
          detail = `Daily quota ${guarded.state.sentToday}/${guarded.state.dailyLimit} reached.`;
          console.log(`Auto-resume stopped: ${detail}`);
          break;
        }

        const { messageId, isSuccess } = parseSendResult(guarded.result);
        if (!isSuccess) {
          // The gateway refused it; the device is probably unhealthy, so stop
          // instead of burning quota on every remaining recipient.
          await markRecipientFailed(target.id);
          outcome = 'error';
          stopReason = 'device_error';
          detail = 'Gateway menolak pesan.';
          break;
        }

        await markRecipientSent(target.id, messageId, text);
        sent++;
      } catch (err) {
        // Outcome unknown (timeout etc.): never auto-retry, a human decides.
        await markRecipientFailed(target.id);
        outcome = 'error';
        stopReason = 'device_error';
        detail = (err as Error).message;
        console.error(`Auto-resume failed for recipient ${target.id}:`, detail);
        break;
      }

      await heartbeat(runId, sent);
      const pause = 60_000 + Math.random() * 60_000;
      if (Date.now() + pause > deadline) {
        stopReason = 'time_budget';
        break;
      }
      if (await pauseWithHeartbeat(pause, runId, sent)) {
        stopReason = 'cancelled';
        outcome = 'stopped';
        break;
      }
    }

    if (stopReason === null && queue.length > batch.length) stopReason = 'batch_complete';

    const queuedLeft = Math.max(0, queue.length - sent);
    await endRun(runId, outcome, sent, queuedLeft, stopReason, detail);

    console.log(
      `Auto-resume run #${runId} ${outcome}: sent ${sent}, ${queuedLeft} still queued` +
        (stopReason ? ` (${stopReason})` : ''),
    );
  } catch (err) {
    console.error('Auto-resume error:', err);
    if (runId !== null) {
      await endRun(runId, 'error', 0, 0, 'error', (err as Error).message).catch(() => {});
    }
  }
}
