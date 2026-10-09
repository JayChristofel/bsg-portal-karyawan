import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getDeviceStatus } from '@/lib/whatsapp';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await getDeviceStatus();

    const actor = await getAdminUsername(req);
    if (actor) {
      const connected = result && (result as { connected?: boolean }).connected;
      void logAuditForRequest(
        req,
        actor,
        'view_gateway_status',
        `Membaca status perangkat WhatsApp (connected: ${connected ? 'ya' : 'tidak'})`,
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('WA status error:', err);
    return NextResponse.json({ code: 'ERROR', message: 'Could not reach the WhatsApp Gateway.' }, { status: 500 });
  }
}
