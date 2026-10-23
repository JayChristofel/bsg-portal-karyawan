import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getManagedWebhook, setManagedWebhook } from '@/lib/whatsapp';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';
import { isPrivateHostname } from '@/lib/net-guard';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [webhook, recentLogs] = await Promise.all([
      getManagedWebhook().catch((e) => ({ error: (e as Error).message })),
      db
        .select()
        .from(webhookLogs)
        .orderBy(desc(webhookLogs.createdAt))
        .limit(20)
        .catch(() => []),
    ]);

    const readActor = await getAdminUsername(req);
    if (readActor) {
      void logAuditForRequest(
        req,
        readActor,
        'view_webhook_config',
        `Membaca konfigurasi webhook perangkat dan ${recentLogs.length} log terakhir`,
      );
    }

    const safeWebhook =
      webhook && 'url' in webhook
        ? {
            webhook_url: webhook.url,
            // The gateway never echoes the signing secret back; it must not reach the browser.
            webhook_secret: '',
            webhook_events: (webhook.events ?? []).join(','),
          }
        : null;

    return NextResponse.json({
      config: safeWebhook,
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
  } catch (error: unknown) {
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
    const webhookEvents = (body.webhook_events || '')
      .split(',')
      .map((e: string) => e.trim())
      .filter(Boolean);

    if (!webhookUrl) {
      return NextResponse.json({ error: 'Webhook URL is required.' }, { status: 400 });
    }

    // The gateway will POST inbound events here; keep it a well-formed
    // absolute http(s) URL so it cannot be pointed at a third party host.
    try {
      const parsed = new URL(webhookUrl);
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && process.env.WHATSAPP_GATEWAY_ALLOW_INSECURE_HTTP === '1')) {
        return NextResponse.json({ error: 'Webhook URL must use https.' }, { status: 400 });
      }
      if (parsed.username || parsed.password) {
        return NextResponse.json({ error: 'Webhook URL must not contain credentials.' }, { status: 400 });
      }
      // The gateway posts events to this URL, so it should be this app's public
      // address; an internal/loopback target would just be an SSRF hop.
      if (process.env.WHATSAPP_GATEWAY_ALLOW_PRIVATE_HOSTS !== '1' && isPrivateHostname(parsed.hostname)) {
        return NextResponse.json({ error: 'Webhook URL points to an internal network.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid webhook URL.' }, { status: 400 });
    }

    // OpenWA requires a secret of at least 16 chars when one is set.
    if (webhookSecret && webhookSecret.length < 16) {
      return NextResponse.json({ error: 'Webhook secret must be at least 16 characters.' }, { status: 400 });
    }

    const result = await setManagedWebhook(webhookUrl, webhookSecret || undefined, webhookEvents);

    const writeActor = await getAdminUsername(req);
    if (writeActor) {
      await logAuditForRequest(
        req,
        writeActor,
        'update_webhook_config',
        `Konfigurasi webhook diperbarui — url: ${webhookUrl}, ` +
          `events: ${webhookEvents.join(', ') || 'message.ack'}, secret: ${webhookSecret ? 'diperbarui' : 'tidak berubah'}`,
      );
    }

    return NextResponse.json({ code: 'SUCCESS', result });
  } catch (error: unknown) {
    console.error('Update webhook error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Could not update the webhook on the gateway' },
      { status: 500 },
    );
  }
}
