import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { warmerPairs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';
import { readJsonObject, parseId, boundedInt } from '@/lib/validate';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid pair id.' }, { status: 400 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const update: Partial<typeof warmerPairs.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
    if (body.intervalMinMinutes !== undefined) update.intervalMinMinutes = boundedInt(body.intervalMinMinutes, 5, 1440, 30);
    if (body.intervalMaxMinutes !== undefined) update.intervalMaxMinutes = boundedInt(body.intervalMaxMinutes, 5, 1440, 180);
    if (body.activeHourStart !== undefined) update.activeHourStart = boundedInt(body.activeHourStart, 0, 23, 8);
    if (body.activeHourEnd !== undefined) update.activeHourEnd = boundedInt(body.activeHourEnd, 1, 24, 21);

    if ((update.activeHourStart ?? 0) >= (update.activeHourEnd ?? 24) && update.activeHourStart !== undefined && update.activeHourEnd !== undefined) {
      return NextResponse.json({ error: 'Active hour start must be before the end.' }, { status: 400 });
    }

    const [pair] = await db.update(warmerPairs).set(update).where(eq(warmerPairs.id, id)).returning();
    if (!pair) {
      return NextResponse.json({ error: 'Pair not found.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'update_warmer_pair',
      `Pair #${id} diperbarui — ${JSON.stringify(update)}`,
    );

    return NextResponse.json({ pair });
  } catch (error: unknown) {
    console.error('Warmer pair PATCH error:', error);
    return NextResponse.json({ error: 'Could not update the warmer pair' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid pair id.' }, { status: 400 });
  }

  try {
    const [deleted] = await db.delete(warmerPairs).where(eq(warmerPairs.id, id)).returning();
    if (!deleted) {
      return NextResponse.json({ error: 'Pair not found.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'delete_warmer_pair',
      `Pair ${deleted.sessionA} <-> ${deleted.sessionB} (ID: ${id})`,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Warmer pair DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the warmer pair' }, { status: 500 });
  }
}
