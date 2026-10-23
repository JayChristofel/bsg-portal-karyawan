import { NextRequest, NextResponse, after } from 'next/server';
import { asNetError } from '@/lib/utils';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import {
  sendMessageGuarded,
  getGatewayConfig,
  startSession,
  logoutSession,
} from '@/lib/whatsapp';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';
import {
  claimRecipient,
  markRecipientSent,
  markRecipientFailed,
  releaseRecipient,
  parseSendResult,
} from '@/lib/recipient-queue';
import { drainPendingQueue } from '@/lib/auto-resume-drain';

// The drain runs after the response via after(); give it the longest budget the plan allows.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = (body.action || '').trim();

    if (action === 'reconnect') {
      const result = await startSession();
      if (result?.status !== 'failed') {
        // after() keeps the serverless invocation alive until the drain finishes.
        after(() => drainPendingQueue());
      }
      return NextResponse.json(result);
    }

    if (action === 'logout') {
      const result = await logoutSession();
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

    const config = await getGatewayConfig();
    let guarded: Awaited<ReturnType<typeof sendMessageGuarded>>;
    try {
      guarded = await sendMessageGuarded(phone, message, config.sessionId, config);
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

    const result = guarded.result as Record<string, unknown>;
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
  } catch (err: unknown) {
    console.error('WA action error:', err);
    return NextResponse.json({ code: 'ERROR', message: asNetError(err).message || 'Could not send via the WhatsApp Gateway.' }, { status: 500 });
  }
}
