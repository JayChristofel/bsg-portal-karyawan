import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { requestQr, getGatewayConfig } from '@/lib/whatsapp';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';
import { readJsonObject, str } from '@/lib/validate';

/**
 * Requests a pairing QR for an arbitrary session name (not just the single
 * default session `/api/whatsapp/qr` manages). `requestQr` already creates the
 * session on the gateway if it doesn't exist yet, so this doubles as "create
 * session" for the warmer's multi-session picker.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await readJsonObject(req);
  const name = body ? str(body.name, 100) : '';
  if (!name || /[\s/]/.test(name)) {
    return NextResponse.json({ error: 'Session name is required and must not contain spaces or slashes.' }, { status: 400 });
  }

  try {
    const defaultConfig = await getGatewayConfig();
    const result = await requestQr({ ...defaultConfig, sessionId: name });

    const actor = await getAdminUsername(req);
    if (actor) {
      void logAuditForRequest(req, actor, 'request_warmer_session_qr', `Session "${name}"`);
    }

    if (result.ok) {
      return NextResponse.json({ code: 'SUCCESS', qrLink: result.qrLink, qrDuration: result.qrDuration });
    }
    if (result.reason === 'already-logged-in') {
      return NextResponse.json(
        { code: 'ALREADY_LOGGED_IN', alreadyConnected: true, message: result.message },
        { status: 409 },
      );
    }
    return NextResponse.json({ code: result.code, error: result.message }, { status: 502 });
  } catch (err) {
    console.error('Warmer session QR error:', err);
    return NextResponse.json({ error: 'Unexpected error while requesting the QR code.' }, { status: 500 });
  }
}
