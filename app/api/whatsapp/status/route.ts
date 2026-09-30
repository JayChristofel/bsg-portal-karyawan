import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getDeviceStatus } from '@/lib/whatsapp';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await getDeviceStatus();
    return NextResponse.json(result);
  } catch (err) {
    console.error('WA status error:', err);
    return NextResponse.json({ code: 'ERROR', message: 'Gagal menghubungi WhatsApp Gateway.' }, { status: 500 });
  }
}
