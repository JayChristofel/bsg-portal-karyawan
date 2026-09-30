import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recipients, webhookLogs } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

// Health check / verification
export async function GET() {
  return NextResponse.json({ status: 'OK', service: 'portal-pegawai-whatsapp-webhook' });
}

// Receive webhook events from GOWA
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { raw: rawBody };
    }

    const event = body.event || body.type || 'unknown';
    const deviceId = body.device_id || body.deviceId || 'portal-pegawai';

    // Store all events in webhook_logs
    await db.insert(webhookLogs).values({
      deviceId,
      event,
      payload: rawBody,
    });

    // ── message.ack → update broadcast status ──────────────────────────
    if (event === 'message.ack' && body.payload) {
      const p = body.payload;
      const messageIds: string[] = Array.isArray(p.ids) ? p.ids : [];
      const receiptType: string = p.receipt_type || '';

      // Map GOWA receipt_type to our wa_status
      // 'delivered' = message reached device (ceklis 2 abu-abu)
      // 'read'      = message was read (ceklis 2 biru)
      let newStatus: string | null = null;
      if (receiptType === 'delivered') newStatus = 'delivered';
      if (receiptType === 'read') newStatus = 'read';

      if (newStatus && messageIds.length > 0) {
        // Only upgrade status, never downgrade (read > delivered > sent)
        const statusPriority: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };
        const newPriority = statusPriority[newStatus] ?? 0;

        const affected = await db
          .select()
          .from(recipients)
          .where(inArray(recipients.waMessageId, messageIds));

        for (const rec of affected) {
          const currentPriority = statusPriority[rec.waStatus ?? 'pending'] ?? 0;
          if (newPriority > currentPriority) {
            await db
              .update(recipients)
              .set({ waStatus: newStatus })
              .where(eq(recipients.id, rec.id));
          }
        }
      }
    }

    return NextResponse.json({ status: 'OK', message: 'Webhook received' });
  } catch (error: any) {
    console.error('Error processing WhatsApp webhook:', error);
    // Still return 200 to prevent GOWA from retrying
    return NextResponse.json({ status: 'ERROR', error: error?.message }, { status: 200 });
  }
}
