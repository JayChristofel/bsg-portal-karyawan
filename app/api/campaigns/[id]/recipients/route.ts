import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { recipients, campaigns } from '@/db/schema';
import { eq, and, inArray, ne, or, isNull } from 'drizzle-orm';
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
