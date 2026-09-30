import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getQRCode } from '@/lib/whatsapp';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await getQRCode();
    return NextResponse.json(result);
  } catch (err) {
    console.error('WA QR error:', err);
    return NextResponse.json({ code: 'ERROR', message: 'Gagal mengambil QR Code dari WhatsApp Gateway.' }, { status: 500 });
  }
}
