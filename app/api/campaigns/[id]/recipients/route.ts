import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { recipients, campaigns } from '@/db/schema';
import { eq, and, inArray, ne, or, isNull, asc } from 'drizzle-orm';
import { readJsonObject, parseId } from '@/lib/validate';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';

const MAX_ASSIGN = 5000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaignId = parseId(rawId);
    if (campaignId === null) {
      return NextResponse.json({ error: 'Invalid campaign id.' }, { status: 400 });
    }
    const body = await readJsonObject(req);
    const rawIds = body?.recipientIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: 'No recipients selected.' }, { status: 400 });
    }
    if (rawIds.length > MAX_ASSIGN) {
      return NextResponse.json({ error: `At most ${MAX_ASSIGN} recipients per request.` }, { status: 400 });
    }
    // Every entry must be a positive integer id; "123" (a string) must not be iterated per character.
    const recipientIds = rawIds.map((v) => parseId(v));
    if (recipientIds.some((v) => v === null)) {
      return NextResponse.json({ error: 'recipientIds must be positive integers.' }, { status: 400 });
    }

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }
    if (campaign.status === 'sending' || campaign.status === 'cancelled') {
      return NextResponse.json({ error: `Campaign is ${campaign.status}.` }, { status: 409 });
    }

    // One statement (all or nothing). Rows currently being sent are left alone.
    const moved = await db
      .update(recipients)
      .set({ campaignId })
      .where(
        and(
          inArray(recipients.id, recipientIds as number[]),
          or(isNull(recipients.waStatus), ne(recipients.waStatus, 'sending')),
        ),
      )
      .returning({ id: recipients.id });

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'assign_recipients',
      `Kampanye #${campaignId}: ${moved.length} penerima ditambahkan`,
    );

    return NextResponse.json({ success: true, count: moved.length });
  } catch (error: unknown) {
    console.error('Campaign recipients POST error:', error);
    return NextResponse.json({ error: 'Could not add recipients to the campaign' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  if (!(await getAdminUsername(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaignId = parseId(rawId);
    if (campaignId === null) {
      return NextResponse.json({ error: 'Invalid campaign id.' }, { status: 400 });
    }
    const [campaign] = await db.select({ name: campaigns.name, status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const rows = await db
      .select({
        id: recipients.id,
        label: recipients.label,
        phone: recipients.phone,
        cabang: recipients.cabang,
        waStatus: recipients.waStatus,
        waSentAt: recipients.waSentAt,
      })
      .from(recipients)
      .where(eq(recipients.campaignId, campaignId))
      .orderBy(asc(recipients.id));

    return NextResponse.json({ campaign, recipients: rows });
  } catch (error: unknown) {
    console.error('Campaign recipients GET error:', error);
    return NextResponse.json({ error: 'Could not load the campaign recipients' }, { status: 500 });
  }
}

/** Takes recipients back out of a campaign. Rows already sent keep their campaign (history). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaignId = parseId(rawId);
    if (campaignId === null) {
      return NextResponse.json({ error: 'Invalid campaign id.' }, { status: 400 });
    }
    const body = await readJsonObject(req);
    const rawIds = body?.recipientIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > MAX_ASSIGN) {
      return NextResponse.json({ error: 'Select between 1 and ' + MAX_ASSIGN + ' recipients.' }, { status: 400 });
    }
    const ids = rawIds.map((v) => parseId(v));
    if (ids.some((v) => v === null)) {
      return NextResponse.json({ error: 'recipientIds must be positive integers.' }, { status: 400 });
    }

    const [campaign] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }
    if (campaign.status === 'sending') {
      return NextResponse.json({ error: 'Campaign is sending.' }, { status: 409 });
    }

    const removed = await db
      .update(recipients)
      .set({ campaignId: null })
      .where(
        and(
          eq(recipients.campaignId, campaignId),
          inArray(recipients.id, ids as number[]),
          or(isNull(recipients.waStatus), inArray(recipients.waStatus, ['pending', 'failed'])),
        ),
      )
      .returning({ id: recipients.id });

    await logAuditForRequest(req, username, 'unassign_recipients', `Kampanye #${campaignId}: ${removed.length} penerima dikeluarkan`);
    return NextResponse.json({ success: true, count: removed.length });
  } catch (error: unknown) {
    console.error('Campaign recipients DELETE error:', error);
    return NextResponse.json({ error: 'Could not remove recipients from the campaign' }, { status: 500 });
  }
}
