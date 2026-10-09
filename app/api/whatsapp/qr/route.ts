import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { requestQr } from '@/lib/whatsapp';
import { gatewayTlsMode } from '@/lib/gowa-tls';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await requestQr();

    const actor = await getAdminUsername(req);
    if (actor) {
      void logAuditForRequest(req, actor, 'request_qr', 'Meminta kode QR pairing baru');
    }

    if (result.ok) {
      return NextResponse.json({
        code: 'SUCCESS',
        // The image is served through /api/whatsapp/qr/image so the browser
        // never needs to reach the gateway (which requires Basic Auth).
        qrLink: `/api/whatsapp/qr/image?src=${encodeURIComponent(result.qrLink)}`,
        qrDuration: result.qrDuration,
        tlsMode: gatewayTlsMode(),
      });
    }

    if (result.reason === 'already-logged-in') {
      // Not an error: the gateway is healthy and the device is paired.
      return NextResponse.json(
        {
          code: 'ALREADY_LOGGED_IN',
          alreadyConnected: true,
          message: result.message,
          tlsMode: gatewayTlsMode(),
        },
        { status: 409 },
      );
    }

    if (result.reason === 'transport-error') {
      return NextResponse.json(
        { code: result.code, error: result.message, tlsMode: gatewayTlsMode() },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { code: result.code, error: result.message, tlsMode: gatewayTlsMode() },
      { status: 502 },
    );
  } catch (err) {
    console.error('WA QR error:', err);
    return NextResponse.json(
      { code: 'ERROR', error: 'Unexpected error while fetching the QR code from the WhatsApp Gateway.' },
      { status: 500 },
    );
  }
}