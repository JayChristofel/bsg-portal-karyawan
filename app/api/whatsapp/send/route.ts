import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { sendMessage, reconnectDevice, logoutDevice } from '@/lib/whatsapp';
import { db } from '@/db';
import { recipients } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';

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

async function resumePendingBroadcasts() {
  try {
    if (!isWithinTimeWindow()) {
      const { timeWindowStart, timeWindowEnd } = getBatchConfig();
      console.log(`Auto-resume skipped: outside time window (${timeWindowStart}:00–${timeWindowEnd}:00)`);
      return;
    }

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

    if (pendingRecipients.length === 0) return;

    const batch = pendingRecipients.slice(0, batchSize);
    const remaining = pendingRecipients.length - batch.length;

    console.log(`Auto-resume: ${batch.length} pending messages in this batch, ${remaining} remaining`);

    for (const target of batch) {
      try {
        const message = target.message || '';
        const result = await sendMessage(target.phone!, message);
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
          await db
            .update(recipients)
            .set({
              waMessageId: messageId,
              waStatus: 'sent',
              waSentAt: new Date(),
            })
            .where(eq(recipients.id, target.id));
        }

        await new Promise((r) => setTimeout(r, 60000 + Math.random() * 60000));
      } catch (err) {
        console.error(`Auto-resume failed for recipient ${target.id}:`, err);
        break;
      }
    }

    if (remaining > 0) {
      console.log(`Auto-resume: ${remaining} messages remaining for next batch`);
    } else {
      console.log('Auto-resume completed: all pending messages sent');
    }
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

    const result = await sendMessage(phone, message);

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
