import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { sendMessage } from '@/lib/whatsapp';
import { reconnectDevice, logoutDevice } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = (body.action || '').trim();

    if (action === 'reconnect') {
      const result = await reconnectDevice();
      return NextResponse.json(result);
    }

    if (action === 'logout') {
      const result = await logoutDevice();
      return NextResponse.json(result);
    }

    // Default: send message
    const phone = (body.phone || '').trim();
    const message = (body.message || '').trim();

    if (!phone || !message) {
      return NextResponse.json({ success: false, error: 'phone dan message wajib diisi.' }, { status: 400 });
    }

    const result = await sendMessage(phone, message);
    return NextResponse.json(result);
  } catch (err) {
    console.error('WA action error:', err);
    return NextResponse.json({ code: 'ERROR', message: 'Gagal mengirim ke WhatsApp Gateway.' }, { status: 500 });
  }
}
