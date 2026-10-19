import { NextRequest, NextResponse } from 'next/server';
import { readJsonObject, boundedInt } from '@/lib/validate';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { broadcastSessions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const channel = req.nextUrl.searchParams.get('channel') || 'whatsapp';

    const sessions = await db
      .select()
      .from(broadcastSessions)
      .where(eq(broadcastSessions.channel, channel))
      .orderBy(desc(broadcastSessions.updatedAt))
      .limit(1);

    const session = sessions[0] ?? null;

    if (session) {
      const isOnBreak = session.isOnBreak ?? false;
      const isOutsideTimeWindow = session.isOutsideTimeWindow ?? false;
      const breakEndTime = session.breakEndTime ? new Date(session.breakEndTime).getTime() : null;

      if (isOnBreak && breakEndTime && Date.now() > breakEndTime) {
        const nextBatch = (session.currentBatch ?? 1) + 1;
        await db
          .update(broadcastSessions)
          .set({
            isOnBreak: false,
            breakEndTime: null,
            batchSent: 0,
            currentBatch: nextBatch,
            updatedAt: new Date(),
          })
          .where(eq(broadcastSessions.id, session.id));

        return NextResponse.json({
          session: {
            ...session,
            isOnBreak: false,
            breakEndTime: null,
            batchSent: 0,
            currentBatch: nextBatch,
            isOutsideTimeWindow,
          },
        });
      }

      return NextResponse.json({
        session: {
          ...session,
          isOnBreak,
          breakEndTime,
          isOutsideTimeWindow,
        },
      });
    }

    return NextResponse.json({ session: null });
  } catch (error: unknown) {
    console.error('Broadcast session GET error:', error);
    return NextResponse.json({ error: 'Could not load session' }, { status: 500 });
  }
}

const CHANNELS = new Set(['whatsapp', 'email']);

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
    const channel = typeof body.channel === 'string' ? body.channel : '';
    if (!CHANNELS.has(channel)) {
      return NextResponse.json({ error: 'channel must be "whatsapp" or "email".' }, { status: 400 });
    }

    const MAX = 1_000_000;
    const values = {
      totalTargets: boundedInt(body.totalTargets, 0, MAX, 0),
      totalSent: boundedInt(body.totalSent, 0, MAX, 0),
      batchSent: boundedInt(body.batchSent, 0, MAX, 0),
      currentBatch: boundedInt(body.currentBatch, 1, MAX, 1),
      totalBatches: boundedInt(body.totalBatches, 1, MAX, 1),
      isOnBreak: Boolean(body.isOnBreak),
      breakEndTime:
        typeof body.breakEndTime === 'string' && !Number.isNaN(new Date(body.breakEndTime).getTime())
          ? new Date(body.breakEndTime)
          : null,
      isOutsideTimeWindow: Boolean(body.isOutsideTimeWindow),
    };

    // Update every row of the channel (not just the first): there is no unique index
    // on channel, so a concurrent first save may have left two rows, and updating all
    // of them keeps GET consistent whichever one it picks.
    const updated = await db
      .update(broadcastSessions)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(broadcastSessions.channel, channel))
      .returning();

    if (updated.length > 0) {
      return NextResponse.json({ session: updated[updated.length - 1] });
    }

    const [created] = await db
      .insert(broadcastSessions)
      .values({ channel, ...values })
      .returning();

    return NextResponse.json({ session: created });
  } catch (error: unknown) {
    console.error('Broadcast session POST error:', error);
    return NextResponse.json({ error: 'Could not save session' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const channel = req.nextUrl.searchParams.get('channel') || 'whatsapp';
    if (!CHANNELS.has(channel)) {
      return NextResponse.json({ error: 'channel must be "whatsapp" or "email".' }, { status: 400 });
    }

    await db
      .delete(broadcastSessions)
      .where(eq(broadcastSessions.channel, channel));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Broadcast session DELETE error:', error);
    return NextResponse.json({ error: 'Could not reset session' }, { status: 500 });
  }
}