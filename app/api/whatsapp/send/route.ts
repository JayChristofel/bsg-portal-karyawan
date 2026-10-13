import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import {
  sendMessageGuarded,
  getGowaConfig,
  getWarmUpState,
  reconnectDevice,
  logoutDevice,
} from '@/lib/whatsapp';
import { db } from '@/db';
import { recipients, autoResumeRuns } from '@/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';
import {
  isCancelRequested,
  markAutoResumeStarted,
  markAutoResumeFinished,
  isAutoResumeRunning,
} from '@/lib/auto-resume-control';

function getBatchConfig() {
  const batchSize = Number(process.env.BROADCAST_BATCH_SIZE) || 100;
  const timeWindowStart = Number(process.env.BROADCAST_TIME_START) || 8;
  const timeWindowEnd = Number(process.env.BROADCAST_TIME_END) || 20;
  return { batchSize, timeWindowStart, timeWindowEnd };
}

function isWithinTimeWindow(): boolean {
  const { timeWindowStart, timeWindowEnd } = getBatchConfig();
  const hour = new Date().getHours();
  return hour >= timeWindowStart && hour < timeWindowEnd;
}

/**
 * Single-flight guard for the background drain.
 *
 * Auto-resume runs server-side with no browser attached, while a manual
 * broadcast is a client-side loop. Without this guard both can interleave and
 * produce a burst of near-simultaneous sends from one number, which is exactly
 * the pattern that trips rate limiting.
 */

async function beginRun(queued: number): Promise<number> {
  const [row] = await db
    .insert(autoResumeRuns)
    .values({ status: 'running', messagesSent: 0, queuedRemaining: queued })
    .returning({ id: autoResumeRuns.id });
  return row?.id ?? 0;
}

async function endRun(
  runId: number,
  status: 'completed' | 'stopped' | 'error',
  sent: number,
  stopReason: string | null,
  detail?: string,
) {
  await db
    .update(autoResumeRuns)
    .set({
      status,
      finishedAt: new Date(),
      messagesSent: sent,
      stopReason,
      detail,
    })
    .where(eq(autoResumeRuns.id, runId));
}

async function resumePendingBroadcasts() {
  if (isAutoResumeRunning()) {
    console.log('Auto-resume already running; skipping duplicate drain.');
    return;
  }
  markAutoResumeStarted();
  try {
    await drainPendingQueue();
  } finally {
    markAutoResumeFinished();
  }
}

/**
 * Drains the pending queue in the background after the device reconnects.
 *
 * Respects the same warm-up quota and batch ceiling as the manual broadcast:
 * auto-resume is just another entry point into the same send path, and letting
 * it bypass the guard would make the guard meaningless.
 */
async function drainPendingQueue() {
  try {
    if (!isWithinTimeWindow()) {
      const { timeWindowStart, timeWindowEnd } = getBatchConfig();
      console.log(`Auto-resume skipped: outside time window (${timeWindowStart}:00-${timeWindowEnd}:00)`);
      return;
    }

    const config = await getGowaConfig();
    const numberId = config.deviceId;
    const { batchSize } = getBatchConfig();

    const pendingRecipients = (await db
      .select({
        id: recipients.id,
        phone: recipients.phone,
        message: recipients.message,
        campaignId: recipients.campaignId,
      })
      .from(recipients)
      .where(eq(recipients.waStatus, 'pending')))
      .filter((r) => r.phone !== null && r.phone !== '');

    if (pendingRecipients.length === 0) {
      console.log('Auto-resume: nothing pending.');
      return;
    }

    // Headroom may be smaller than the batch ceiling; take the lesser of the two.
    const warmUp = await getWarmUpState(numberId);
    const batch = pendingRecipients.slice(0, Math.min(batchSize, warmUp.remainingToday));
    const remaining = pendingRecipients.length - batch.length;

    const runId = await beginRun(pendingRecipients.length);

    console.log(
      `Auto-resume: ${batch.length} in this batch, ${remaining} queued, ` +
        `daily quota ${warmUp.sentToday}/${warmUp.dailyLimit} (run #${runId})`,
    );

    let sent = 0;
    let stopReason: string | null = null;
    let outcome: 'completed' | 'stopped' | 'error' = 'completed';
    let detail: string | undefined;

    for (const target of batch) {
      if (isCancelRequested()) {
        stopReason = 'cancelled';
        outcome = 'stopped';
        break;
      }

      try {
        const guarded = await sendMessageGuarded(
          target.phone!,
          target.message || '',
          numberId,
          config,
        );

        if (!guarded.ok) {
          stopReason = 'quota';
          outcome = 'stopped';
          detail =
            `Daily quota ${guarded.state.sentToday}/${guarded.state.dailyLimit} reached.`;
          console.log(`Auto-resume stopped: ${detail}`);
          break;
        }

        const result: any = guarded.result;
        const messageId =
          result?.results?.message_id ||
          result?.results?.id ||
          result?.message_id ||
          null;
        const isSuccess =
          result?.code === 'SUCCESS' ||
          result?.code === 'OK' ||
          Boolean(messageId);

        if (isSuccess) {
          sent++;
          await db
            .update(recipients)
            .set({
              waMessageId: messageId,
              waStatus: 'sent',
              waSentAt: new Date(),
            })
            .where(eq(recipients.id, target.id));
        }

        await db
          .update(autoResumeRuns)
          .set({ messagesSent: sent })
          .where(eq(autoResumeRuns.id, runId));

        await new Promise((r) => setTimeout(r, 60000 + Math.random() * 60000));
      } catch (err) {
        outcome = 'error';
        stopReason = 'device_error';
        detail = (err as Error).message;
        console.error(`Auto-resume failed for recipient ${target.id}:`, err);
        break;
      }
    }

    if (stopReason === null && remaining > 0) stopReason = 'batch_complete';

    const queuedLeft = Math.max(0, pendingRecipients.length - sent);
    await endRun(runId, outcome, sent, stopReason, detail);

    await db
      .update(autoResumeRuns)
      .set({ queuedRemaining: queuedLeft })
      .where(eq(autoResumeRuns.id, runId));

    console.log(
      `Auto-resume run #${runId} ${outcome}: sent ${sent}, ${queuedLeft} still queued` +
        (stopReason ? ` (${stopReason})` : ''),
    );
  } catch (err) {
    console.error('Auto-resume error:', err);
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
        void resumePendingBroadcasts();
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
    const recipientId = body.recipientId || body.id;

    if (!phone || !message) {
      return NextResponse.json({ success: false, error: 'phone and message are required.' }, { status: 400 });
    }

    const config = await getGowaConfig();
    const guarded = await sendMessageGuarded(phone, message, config.deviceId, config);

    if (!guarded.ok) {
      const { state } = guarded;
      const blockedBy = await getAdminUsername(req);
      await logAuditForRequest(
        req,
        blockedBy ?? 'unknown',
        'send_blocked_quota',
        `Kirim WA ke ${phone} diblokir: kuota harian ${state.sentToday}/${state.dailyLimit} habis`,
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

    const messageId =
      result?.results?.message_id ||
      result?.results?.id ||
      result?.message_id ||
      null;

    const isSuccess =
      result?.code === 'SUCCESS' ||
      result?.code === 'OK' ||
      Boolean(messageId) ||
      result?.message?.toLowerCase().includes('success');

    // If recipient ID was provided and send succeeded, update the recipient record
    if (recipientId && isSuccess) {
      await db
        .update(recipients)
        .set({
          waMessageId: messageId,
          waStatus: 'sent',
          waSentAt: new Date(),
          message,
        })
        .where(eq(recipients.id, Number(recipientId)));
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'send_message',
      `Kirim WA ke ${phone}${recipientId ? ` (recipient #${recipientId})` : ''}`,
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
