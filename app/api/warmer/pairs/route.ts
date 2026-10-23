import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { warmerPairs } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';
import { readJsonObject, str, boundedInt } from '@/lib/validate';
import { ensureSessionWebhook } from '@/lib/whatsapp';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pairs = await db.select().from(warmerPairs).orderBy(desc(warmerPairs.createdAt));
    return NextResponse.json({ pairs });
  } catch (error: unknown) {
    console.error('Warmer pairs GET error:', error);
    return NextResponse.json({ error: 'Could not load warmer pairs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const sessionA = str(body.sessionA, 100);
    const sessionB = str(body.sessionB, 100);
    const intervalMinMinutes = boundedInt(body.intervalMinMinutes, 5, 1440, 30);
    const intervalMaxMinutes = boundedInt(body.intervalMaxMinutes, 5, 1440, 180);
    const activeHourStart = boundedInt(body.activeHourStart, 0, 23, 8);
    const activeHourEnd = boundedInt(body.activeHourEnd, 1, 24, 21);

    if (!sessionA || !sessionB) {
      return NextResponse.json({ error: 'Both sessions are required.' }, { status: 400 });
    }
    if (sessionA === sessionB) {
      return NextResponse.json({ error: 'A pair needs two different sessions.' }, { status: 400 });
    }
    if (activeHourStart >= activeHourEnd) {
      return NextResponse.json({ error: 'Active hour start must be before the end.' }, { status: 400 });
    }

    const [pair] = await db
      .insert(warmerPairs)
      .values({
        sessionA,
        sessionB,
        intervalMinMinutes: Math.min(intervalMinMinutes, intervalMaxMinutes),
        intervalMaxMinutes: Math.max(intervalMinMinutes, intervalMaxMinutes),
        activeHourStart,
        activeHourEnd,
      })
      .returning();

    // Best-effort: each session needs its own webhook registered on the gateway
    // so its message.ack events reach us, independent of the single-session
    // webhook the admin UI manages. A failure here shouldn't block pair creation.
    await Promise.all(
      [sessionA, sessionB].map((s) =>
        ensureSessionWebhook(s).catch((err) =>
          console.error(`Warmer: could not register webhook for session "${s}":`, (err as Error).message),
        ),
      ),
    );

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'create_warmer_pair',
      `Pair ${sessionA} <-> ${sessionB} (ID: ${pair.id})`,
    );

    return NextResponse.json({ pair });
  } catch (error: unknown) {
    console.error('Warmer pairs POST error:', error);
    return NextResponse.json({ error: 'Could not create the warmer pair' }, { status: 500 });
  }
}
