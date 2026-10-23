import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { listSessions } from '@/lib/whatsapp';

/** Sessions visible to the configured gateway API key, for the pair picker. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessions = await listSessions();
    return NextResponse.json({
      sessions: sessions.map((s) => ({ name: s.name, status: s.status, phone: s.phone ?? null })),
    });
  } catch (error: unknown) {
    console.error('Warmer sessions GET error:', error);
    return NextResponse.json({ error: 'Could not reach the gateway' }, { status: 502 });
  }
}
