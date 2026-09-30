import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { getClientIp, getUserAgent, checkRateLimit } from '@/lib/proxy';

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const userAgent = getUserAgent(req);

  // Rate limit: max 20 requests per 60s per IP
  const rateLimit = checkRateLimit(`track_${clientIp}`, 60, 20);
  if (rateLimit.limited) {
    return NextResponse.json(
      { success: false, error: 'Terlalu banyak permintaan.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const token = (body.token || '').trim().slice(0, 64);
    const eventType = body.type;

    if (!token || !['open', 'start'].includes(eventType)) {
      return NextResponse.json(
        { success: false, error: 'Data tracking tidak valid.' },
        { status: 400 }
      );
    }

    await db.insert(events).values({
      token,
      eventType,
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Track error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mencatat event.' },
      { status: 500 }
    );
  }
}
