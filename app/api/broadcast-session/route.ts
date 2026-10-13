import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { broadcastSessions } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

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
      const isOnBreak = session.isOnBreak === 'true';
      const isOutsideTimeWindow = session.isOutsideTimeWindow === 'true';
      const breakEndTime = session.breakEndTime ? new Date(session.breakEndTime).getTime() : null;

      if (isOnBreak && breakEndTime && Date.now() > breakEndTime) {
        const nextBatch = (session.currentBatch ?? 1) + 1;
        await db
          .update(broadcastSessions)
          .set({
            isOnBreak: 'false',
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
  } catch (error: any) {
    console.error('Broadcast session GET error:', error);
    return NextResponse.json({ error: 'Could not load session' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { channel, totalTargets, totalSent, batchSent, currentBatch, totalBatches, isOnBreak, breakEndTime, isOutsideTimeWindow } = body;

    if (!channel) {
      return NextResponse.json({ error: 'channel is required' }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(broadcastSessions)
      .where(eq(broadcastSessions.channel, channel))
      .limit(1);

    if (existing[0]) {
      const [updated] = await db
        .update(broadcastSessions)
        .set({
          totalTargets,
          totalSent,
          batchSent,
          currentBatch,
          totalBatches,
          isOnBreak: String(isOnBreak),
          breakEndTime: breakEndTime ? new Date(breakEndTime) : null,
          isOutsideTimeWindow: String(isOutsideTimeWindow),
          updatedAt: new Date(),
        })
        .where(eq(broadcastSessions.id, existing[0].id))
        .returning();

      return NextResponse.json({ session: updated });
    }

    const [created] = await db
      .insert(broadcastSessions)
      .values({
        channel,
        totalTargets,
        totalSent,
        batchSent,
        currentBatch,
        totalBatches,
        isOnBreak: String(isOnBreak),
        breakEndTime: breakEndTime ? new Date(breakEndTime) : null,
        isOutsideTimeWindow: String(isOutsideTimeWindow),
      })
      .returning();

    return NextResponse.json({ session: created });
  } catch (error: any) {
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

    await db
      .delete(broadcastSessions)
      .where(eq(broadcastSessions.channel, channel));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Broadcast session DELETE error:', error);
    return NextResponse.json({ error: 'Could not reset session' }, { status: 500 });
  }
}