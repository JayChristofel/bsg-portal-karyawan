import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getDeviceWebhook, setDeviceWebhook } from '@/lib/whatsapp';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [webhookConfig, recentLogs] = await Promise.all([
      getDeviceWebhook().catch((e) => ({ error: e.message })),
      db
        .select()
        .from(webhookLogs)
        .orderBy(desc(webhookLogs.createdAt))
        .limit(20)
        .catch(() => []),
    ]);

    return NextResponse.json({
      config: webhookConfig?.results || null,
      logs: recentLogs.map((l) => ({
        id: l.id,
        deviceId: l.deviceId,
        event: l.event,
        payload: (() => {
          try {
            return JSON.parse(l.payload);
          } catch {
            return l.payload;
          }
        })(),
        createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString('id-ID') : '-',
      })),
    });
  } catch (error: any) {
    console.error('Fetch webhook info error:', error);
    return NextResponse.json({ error: 'Could not load the webhook configuration' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const webhookUrl = (body.webhook_url || '').trim();
    const webhookSecret = (body.webhook_secret || '').trim();
    const webhookEvents = (body.webhook_events || '').trim();

    // The gateway will POST inbound events here; keep it a well-formed
    // absolute http(s) URL so it cannot be pointed at a third party host.
    if (webhookUrl) {
      try {
        const parsed = new URL(webhookUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return NextResponse.json({ error: 'Webhook URL must use http or https.' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid webhook URL.' }, { status: 400 });
      }
    }

    const result = await setDeviceWebhook(webhookUrl, webhookSecret, webhookEvents);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Update webhook error:', error);
    return NextResponse.json({ error: 'Could not update the webhook in GOWA' }, { status: 500 });
  }
}
