import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recipients, webhookLogs, recipientStatusHistory } from '@/db/schema';
import { and, inArray, isNull, or } from 'drizzle-orm';
import { verifyWebhookSignature } from '@/lib/whatsapp';
import { logAudit } from '@/lib/audit';
import { getClientIp, checkIpRateLimit } from '@/lib/proxy';

// Cap inbound webhook body so a spoofed sender cannot bloat the database.
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
// Cap the number of message ids accepted in a single ack event.
const MAX_ACK_IDS = 100;

// Health check / verification
export async function GET() {
  return NextResponse.json({ status: 'OK', service: 'portal-pegawai-whatsapp-webhook' });
}

// Receive webhook events from GOWA
export async function POST(req: NextRequest) {
  try {
    // Throttle before doing any work: unauthenticated callers must not be able to
    // flood the audit log or burn CPU on signature checks.
    const ip = getClientIp(req);
    if ((await checkIpRateLimit('wa-webhook', ip, 60, 600)).limited) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const rawBody = await req.text();

    if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // Authenticate the sender. Without this, anyone who learns the URL can forge
    // delivery/read receipts and flood the webhook_logs table.
    const signature =
      req.headers.get('x-webhook-signature') ||
      req.headers.get('x-hub-signature-256') ||
      req.headers.get('x-gowa-signature');

    if (!verifyWebhookSignature(rawBody, signature)) {
      // A forged signature is a security event. The audit write is fire-and-
      // forget and never blocks the 401, but a sender could still flood the
      // table — the rate limiting that guards this endpoint covers it.
      void logAudit(
        'webhook',
        'webhook_invalid_signature',
        `Signature tidak valid (body ${rawBody.length} byte)`,
        ip,
      );
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { raw: rawBody };
    }

    const event = body.event || body.type || 'unknown';
    const deviceId = String(body.device_id || body.deviceId || 'portal-pegawai').slice(0, 100);

    // Store all events in webhook_logs
    await db.insert(webhookLogs).values({
      deviceId,
      event: String(event).slice(0, 100),
      payload: rawBody,
    });

    // ── message.ack → update broadcast status ──────────────────────────
    if (event === 'message.ack' && body.payload) {
      const p = body.payload;
      const messageIds: string[] = Array.isArray(p.ids)
        ? p.ids.slice(0, MAX_ACK_IDS).map((id: unknown) => String(id))
        : [];
      const receiptType: string = p.receipt_type || '';

      // Map GOWA receipt_type to our wa_status
      // 'delivered' = message reached device (ceklis 2 abu-abu)
      // 'read'      = message was read (ceklis 2 biru)
      let newStatus: string | null = null;
      if (receiptType === 'delivered') newStatus = 'delivered';
      if (receiptType === 'read') newStatus = 'read';

      if (newStatus && messageIds.length > 0) {
        // Status only moves forward (sent < delivered < read). The guard lives in the
        // UPDATE itself so two acks arriving together cannot move it backwards, and a
        // late ack still upgrades a row we parked as 'failed' after a timeout (the
        // message evidently did go out).
        const upgradeFrom =
          newStatus === 'read'
            ? ['pending', 'sending', 'failed', 'sent', 'delivered']
            : ['pending', 'sending', 'failed', 'sent'];

        const upgraded = await db
          .update(recipients)
          .set({ waStatus: newStatus })
          .where(
            and(
              inArray(recipients.waMessageId, messageIds),
              or(isNull(recipients.waStatus), inArray(recipients.waStatus, upgradeFrom)),
            ),
          )
          .returning({ id: recipients.id, messageId: recipients.waMessageId });

        for (const rec of upgraded) {
          await db.insert(recipientStatusHistory).values({
            recipientId: rec.id,
            status: newStatus,
            messageId: rec.messageId,
          });
        }
      }
    }

    return NextResponse.json({ status: 'OK', message: 'Webhook received' });
  } catch (error: any) {
    // Do not leak internal error messages to an unauthenticated caller.
    console.error('Error processing WhatsApp webhook:', error?.message);
    // 5xx so GOWA retries; replying 200 here would silently drop the event.
    return NextResponse.json({ status: 'ERROR' }, { status: 500 });
  }
}
