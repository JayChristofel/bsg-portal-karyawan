import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getDeviceWebhook, setDeviceWebhook } from '@/lib/whatsapp';
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
    const [webhookConfig, recentLogs] = await Promise.all([
      getDeviceWebhook().catch((e) => ({ error: e.message })),
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

    // The gateway may echo the signing secret back; it must not reach the browser.
    const rawConfig = webhookConfig?.results;
    const safeConfig =
      rawConfig && typeof rawConfig === 'object'
        ? Object.fromEntries(
            Object.entries(rawConfig as Record<string, unknown>).map(([k, v]) =>
              /secret/i.test(k) ? [k, v ? '********' : ''] : [k, v],
            ),
          )
        : null;

    return NextResponse.json({
      config: safeConfig,
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
        if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && process.env.GOWA_ALLOW_INSECURE_HTTP === '1')) {
          return NextResponse.json({ error: 'Webhook URL must use https.' }, { status: 400 });
        }
        if (parsed.username || parsed.password) {
          return NextResponse.json({ error: 'Webhook URL must not contain credentials.' }, { status: 400 });
        }
        // The gateway posts events to this URL, so it should be this app's public
        // address; an internal/loopback target would just be an SSRF hop.
        if (process.env.GOWA_ALLOW_PRIVATE_HOSTS !== '1' && isPrivateHostname(parsed.hostname)) {
          return NextResponse.json({ error: 'Webhook URL points to an internal network.' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid webhook URL.' }, { status: 400 });
      }
    }

    // An empty secret/events field means "leave as is": sending '' would erase the secret
    // on the gateway and every later event would then fail signature verification.
    const result = await setDeviceWebhook(webhookUrl, webhookSecret || undefined, webhookEvents || undefined);

    const writeActor = await getAdminUsername(req);
    if (writeActor) {
      await logAuditForRequest(
        req,
        writeActor,
        'update_webhook_config',
        `Konfigurasi webhook diperbarui — url: ${webhookUrl || '(kosong)'}, ` +
          `events: ${webhookEvents || 'default'}, secret: ${webhookSecret ? 'diperbarui' : 'tidak berubah'}`,
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Update webhook error:', error);
    return NextResponse.json({ error: 'Could not update the webhook in GOWA' }, { status: 500 });
  }
}
