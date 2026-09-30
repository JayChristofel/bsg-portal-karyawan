import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';

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

    // Store in webhook_logs table
    await db.insert(webhookLogs).values({
      deviceId,
      event,
      payload: rawBody,
    });

    return NextResponse.json({ status: 'OK', message: 'Webhook received' });
  } catch (error: any) {
    console.error('Error processing WhatsApp webhook:', error);
    // Still return 200 to prevent GOWA from continually retrying on unhandled errors
    return NextResponse.json({ status: 'ERROR', error: error?.message }, { status: 200 });
  }
}
