import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getGowaConfig, saveGowaConfig, listDevices, validateGatewayUrl, GOWA_CONFIG_KEYS, DEFAULT_GOWA_CONFIG } from '@/lib/whatsapp';
import { db } from '@/db';
import { settings } from '@/db/schema';
import { encrypt } from '@/lib/crypto';
import { gatewayTlsMode } from '@/lib/gowa-tls';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getGowaConfig();
    // Never return the gateway password in plaintext — only whether one is set.
    return NextResponse.json({
      config: {
        baseUrl: config.baseUrl,
        deviceId: config.deviceId,
        username: config.username || '',
        hasPassword: Boolean(config.password),
        password: '',
      },
      defaults: {
        baseUrl: DEFAULT_GOWA_CONFIG.baseUrl,
        deviceId: DEFAULT_GOWA_CONFIG.deviceId,
      },
      tlsMode: gatewayTlsMode(),
    });
  } catch (error: any) {
    console.error('WA config GET error:', error);
    return NextResponse.json({ error: 'Could not load the gateway configuration' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (body.action === 'test') {
      try {
        const config = await getGowaConfig();
        const result = await listDevices(config);
        const authOk = result?.code === 'SUCCESS' || result?.code === 'OK';
        return NextResponse.json({ ...result, authOk, tlsMode: gatewayTlsMode() });
      } catch (testErr: any) {
        console.error('WA config TEST error:', testErr?.message, '| cause:', testErr?.cause?.code, testErr?.cause?.message);
        const cause = testErr?.cause?.code || testErr?.cause?.message || '';
        const isTls = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(String(cause));
        return NextResponse.json(
          {
            code: isTls ? 'TLS_ERROR' : 'NETWORK_ERROR',
            error: isTls
              ? 'TLS verification failed for the gateway certificate. Set GOWA_CA_CERT to the gateway CA.'
              : 'Could not reach the gateway.',
            detail: testErr?.message,
            cause: cause || null,
            tlsMode: gatewayTlsMode(),
          },
          { status: 502 },
        );
      }
    }

    const baseUrl = (body.baseUrl || '').trim();
    const deviceId = (body.deviceId || '').trim();
    const username = (body.username || '').trim();
    const password = body.password !== undefined ? String(body.password) : '';

    if (!baseUrl) {
      return NextResponse.json({ error: 'Gateway URL is required.' }, { status: 400 });
    }
    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID is required.' }, { status: 400 });
    }
    if (/[\s/\\]/.test(deviceId)) {
      return NextResponse.json({ error: 'Device ID must not contain spaces, "/" or "\\".' }, { status: 400 });
    }

    // SSRF guard: the gateway URL is a server-side fetch target.
    const validated = validateGatewayUrl(baseUrl);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    await saveGowaConfig({ baseUrl: validated.url, deviceId, username });

    // Simpan password terenkripsi agar tidak disimpan plaintext.
    // Kosongkan field password bila tidak dikirim, agar tidak menimpa nilai lama.
    if (password) {
      await db
        .insert(settings)
        .values({ key: GOWA_CONFIG_KEYS.password, value: encrypt(password) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: encrypt(password), updatedAt: new Date() },
        });
    }

    return NextResponse.json({ version: '2.1', code: 'SUCCESS', message: 'Gateway configuration saved.' });
  } catch (error: any) {
    console.error('WA config POST error:', error);
    return NextResponse.json({ error: 'Could not save the gateway configuration', detail: error?.message || String(error) }, { status: 500 });
  }
}
