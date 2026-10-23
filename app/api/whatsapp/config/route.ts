import { NextRequest, NextResponse } from 'next/server';
import { asNetError } from '@/lib/utils';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getGatewayConfig, saveGatewayConfig, testGatewayConnection, validateGatewayUrl, GATEWAY_CONFIG_KEYS, DEFAULT_GATEWAY_CONFIG } from '@/lib/whatsapp';
import { db } from '@/db';
import { settings } from '@/db/schema';
import { encrypt } from '@/lib/crypto';
import { gatewayTlsMode } from '@/lib/gateway-tls';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getGatewayConfig();

    const readActor = await getAdminUsername(req);
    if (readActor) {
      void logAuditForRequest(
        req,
        readActor,
        'view_gateway_config',
        `Membaca konfigurasi gateway (${config.baseUrl}, session: ${config.sessionId})`,
      );
    }

    // Never return the gateway API key in plaintext — only whether one is set.
    return NextResponse.json({
      config: {
        baseUrl: config.baseUrl,
        sessionId: config.sessionId,
        hasApiKey: Boolean(config.apiKey),
        apiKey: '',
      },
      defaults: {
        baseUrl: DEFAULT_GATEWAY_CONFIG.baseUrl,
        sessionId: DEFAULT_GATEWAY_CONFIG.sessionId,
      },
      tlsMode: gatewayTlsMode(),
    });
  } catch (error: unknown) {
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
        const config = await getGatewayConfig();
        const result = await testGatewayConnection(config);
        return NextResponse.json({
          authOk: result.authOk,
          status: result.status,
          sessions: result.body,
          tlsMode: gatewayTlsMode(),
        });
      } catch (testErr: unknown) {
        console.error('WA config TEST error:', asNetError(testErr).message, '| cause:', asNetError(testErr).cause?.code, asNetError(testErr).cause?.message);
        const cause = asNetError(testErr).cause?.code || asNetError(testErr).cause?.message || '';
        const isTls = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(String(cause));
        return NextResponse.json(
          {
            code: isTls ? 'TLS_ERROR' : 'NETWORK_ERROR',
            error: isTls
              ? `TLS verification failed for the gateway certificate (${cause}). ` +
                `Trust mode: ${gatewayTlsMode()}. ` +
                (gatewayTlsMode() === 'system'
                  ? 'Set WHATSAPP_GATEWAY_CA_CERT to the gateway CA certificate.'
                  : 'The configured CA does not match the certificate being served — it may have been rotated.')
              : 'Could not reach the gateway.',
            detail: asNetError(testErr).message,
            cause: cause || null,
            tlsMode: gatewayTlsMode(),
          },
          { status: 502 },
        );
      }
    }

    const baseUrl = (body.baseUrl || '').trim();
    const sessionId = (body.sessionId || '').trim();
    const apiKey = body.apiKey !== undefined ? String(body.apiKey) : '';

    if (!baseUrl) {
      return NextResponse.json({ error: 'Gateway URL is required.' }, { status: 400 });
    }
    if (!sessionId) {
      return NextResponse.json({ error: 'Session name is required.' }, { status: 400 });
    }
    if (/[\s/\\]/.test(sessionId)) {
      return NextResponse.json({ error: 'Session name must not contain spaces, "/" or "\\".' }, { status: 400 });
    }

    // SSRF guard: the gateway URL is a server-side fetch target.
    const validated = validateGatewayUrl(baseUrl);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    await saveGatewayConfig({ baseUrl: validated.url, sessionId });

    // Simpan API key terenkripsi agar tidak disimpan plaintext.
    // Kosongkan field apiKey bila tidak dikirim, agar tidak menimpa nilai lama.
    if (apiKey) {
      await db
        .insert(settings)
        .values({ key: GATEWAY_CONFIG_KEYS.apiKey, value: encrypt(apiKey) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: encrypt(apiKey), updatedAt: new Date() },
        });
    }

    const writeActor = await getAdminUsername(req);
    if (writeActor) {
      void logAuditForRequest(
        req,
        writeActor,
        'update_gateway_config',
        `Konfigurasi gateway diubah — url: ${validated.url}, session: ${sessionId}, ` +
          `api key: ${apiKey ? 'diperbarui' : 'tidak berubah'}`,
      );
    }

    return NextResponse.json({ version: '2.1', code: 'SUCCESS', message: 'Gateway configuration saved.' });
  } catch (error: unknown) {
    console.error('WA config POST error:', error);
    return NextResponse.json({ error: 'Could not save the gateway configuration', detail: asNetError(error).message || String(error) }, { status: 500 });
  }
}
