import { NextRequest, NextResponse, after } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import {
  sendMessageGuarded,
  getGowaConfig,
  getWarmUpState,
  reconnectDevice,
  logoutDevice,
} from '@/lib/whatsapp';
import { db } from '@/db';
import { recipients, campaigns, messageTemplates, autoResumeRuns } from '@/db/schema';
import { eq, and, or, isNull, isNotNull, inArray, sql, asc, type AnyColumn } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';
import {
  tryStartRun,
  heartbeat,
  isCancelRequested,
} from '@/lib/auto-resume-control';
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

// The drain runs after the response via after(); give it the longest budget the plan allows.
export const maxDuration = 300;

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
async function drainPendingQueue() {
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
      if (await pauseWithHeartbeat(60_000 + Math.random() * 60_000, runId, sent)) {
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

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = (body.action || '').trim();

    if (action === 'reconnect') {
      const result = await reconnectDevice();
      if (result?.code === 'SUCCESS' || result?.results?.success) {
        // after() keeps the serverless invocation alive until the drain finishes.
        after(() => drainPendingQueue());
      }
      return NextResponse.json(result);
    }

    if (action === 'logout') {
      const result = await logoutDevice();
      return NextResponse.json(result);
    }

    // Default: send message
    const phone = (body.phone || '').trim();
    const message = (body.message || '').trim();
    const rawRecipientId = body.recipientId ?? body.id;
    const recipientId =
      rawRecipientId === undefined || rawRecipientId === null || rawRecipientId === ''
        ? null
        : Number(rawRecipientId);

    if (recipientId !== null && !Number.isInteger(recipientId)) {
      return NextResponse.json({ success: false, error: 'recipientId is invalid.' }, { status: 400 });
    }
    if (!phone || !message) {
      return NextResponse.json({ success: false, error: 'phone and message are required.' }, { status: 400 });
    }

    // An explicit admin action may retry a 'failed' row; anything already sent or in flight is refused.
    if (recipientId !== null && !(await claimRecipient(recipientId, ['pending', 'failed']))) {
      return NextResponse.json(
        { code: 'RECIPIENT_NOT_PENDING', isSuccess: false, message: 'Recipient is not pending (already sent or in progress).' },
        { status: 409 },
      );
    }

    const config = await getGowaConfig();
    let guarded;
    try {
      guarded = await sendMessageGuarded(phone, message, config.deviceId, config);
    } catch (err) {
      if (recipientId !== null) await markRecipientFailed(recipientId);
      throw err;
    }

    if (!guarded.ok) {
      if (recipientId !== null) await releaseRecipient(recipientId);
      const { state } = guarded;
      const blockedBy = await getAdminUsername(req);
      await logAuditForRequest(
        req,
        blockedBy ?? 'unknown',
        'send_blocked_quota',
        `Kirim WA${recipientId ? ` (recipient #${recipientId})` : ''} diblokir: kuota harian ${state.sentToday}/${state.dailyLimit} habis`,
      );
      return NextResponse.json(
        {
          code: 'DAILY_QUOTA_EXCEEDED',
          isSuccess: false,
          message:
            `Daily warm-up limit reached (${state.sentToday}/${state.dailyLimit}). ` +
            'Try again tomorrow.',
          sentToday: state.sentToday,
          dailyLimit: state.dailyLimit,
        },
        { status: 429 },
      );
    }

    const result: any = guarded.result;
    const { messageId, isSuccess } = parseSendResult(result);

    if (recipientId !== null) {
      if (isSuccess) await markRecipientSent(recipientId, messageId, message);
      else await markRecipientFailed(recipientId);
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'send_message',
      recipientId ? `Kirim WA ke recipient #${recipientId}` : 'Kirim WA (tanpa recipient)',
    );

    return NextResponse.json({
      ...result,
      message_id: messageId,
      isSuccess,
    });
  } catch (err: any) {
    console.error('WA action error:', err);
    return NextResponse.json({ code: 'ERROR', message: err?.message || 'Could not send via the WhatsApp Gateway.' }, { status: 500 });
  }
}
