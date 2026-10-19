import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailRecipients, emailCampaigns } from '@/db/schema';
import { and, eq, desc, sql, inArray, or, isNull } from 'drizzle-orm';
import { readJsonObject, str, parseId } from '@/lib/validate';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rawCampaignId = req.nextUrl.searchParams.get('campaignId');
    const campaignId = rawCampaignId ? parseId(rawCampaignId) : null;
    if (rawCampaignId && campaignId === null) {
      return NextResponse.json({ error: 'Invalid campaignId.' }, { status: 400 });
    }

    const rows = await db
      .select()
      .from(emailRecipients)
      .where(campaignId !== null ? eq(emailRecipients.campaignId, campaignId) : undefined)
      .orderBy(desc(emailRecipients.createdAt));

    return NextResponse.json({ recipients: rows });
  } catch (error: unknown) {
    console.error('Email recipients GET error:', error);
    return NextResponse.json({ error: 'Could not load recipients' }, { status: 500 });
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
    const name = str(body.name, 200);
    const email = str(body.email, 254).toLowerCase();
    const cabang = str(body.cabang, 200) || null;
    const campaignId = body.campaignId ? parseId(body.campaignId) : null;

    if (!name || !email) {
      return NextResponse.json({ error: 'name and email are required.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Email tidak valid.' }, { status: 400 });
    }
    if (body.campaignId && campaignId === null) {
      return NextResponse.json({ error: 'Invalid campaignId.' }, { status: 400 });
    }

    // The same address twice in one campaign would be mailed twice.
    const [dup] = await db
      .select({ id: emailRecipients.id })
      .from(emailRecipients)
      .where(
        and(
          sql`lower(${emailRecipients.email}) = ${email}`,
          campaignId !== null ? eq(emailRecipients.campaignId, campaignId) : sql`${emailRecipients.campaignId} IS NULL`,
        ),
      )
      .limit(1);
    if (dup) {
      return NextResponse.json({ error: 'Email sudah terdaftar di kampanye ini.' }, { status: 409 });
    }

    const [recipient] = await db
      .insert(emailRecipients)
      .values({ name, email, cabang, campaignId, status: 'pending' })
      .returning();

    const actor = await getAdminUsername(req);
    await logAuditForRequest(req, actor ?? 'unknown', 'create_email_recipient', `Penerima email #${recipient.id} ditambahkan`);

    return NextResponse.json({ recipient });
  } catch (error: unknown) {
    console.error('Email recipients POST error:', error);
    return NextResponse.json({ error: 'Could not create the recipient' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = parseId(req.nextUrl.searchParams.get('id'));
    if (id === null) {
      return NextResponse.json({ error: 'A valid recipient ID is required.' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(emailRecipients)
      .where(eq(emailRecipients.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Recipient not found.' }, { status: 404 });
    }

    const actor = await getAdminUsername(req);
    await logAuditForRequest(req, actor ?? 'unknown', 'delete_email_recipient', `Penerima email #${id} dihapus`);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Email recipients DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the recipient' }, { status: 500 });
  }
}
/**
 * Assigns recipients to an email campaign, or takes them out (campaignId: null).
 * Only rows that have not been sent are moved, and only into/out of a campaign that
 * is not mid-send, so a campaign's history is never rewritten.
 */
export async function PATCH(req: NextRequest) {
  const actor = await getAdminUsername(req);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    const rawIds = body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > 5000) {
      return NextResponse.json({ error: 'Select between 1 and 5000 recipients.' }, { status: 400 });
    }
    const ids = rawIds.map((v) => parseId(v));
    if (ids.some((v) => v === null)) {
      return NextResponse.json({ error: 'ids must be positive integers.' }, { status: 400 });
    }
    const target = body?.campaignId === null ? null : parseId(body?.campaignId);
    if (body?.campaignId !== null && target === null) {
      return NextResponse.json({ error: 'campaignId must be a campaign id or null.' }, { status: 400 });
    }
    const from = parseId(body?.fromCampaignId);

    for (const cid of [target, from]) {
      if (cid === null) continue;
      const [c] = await db.select({ status: emailCampaigns.status }).from(emailCampaigns).where(eq(emailCampaigns.id, cid));
      if (!c) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
      if (c.status === 'sending') return NextResponse.json({ error: 'Campaign is sending.' }, { status: 409 });
    }

    const moved = await db
      .update(emailRecipients)
      .set({ campaignId: target })
      .where(
        and(
          inArray(emailRecipients.id, ids as number[]),
          or(isNull(emailRecipients.status), inArray(emailRecipients.status, ['pending', 'failed'])),
          from === null ? undefined : eq(emailRecipients.campaignId, from),
        ),
      )
      .returning({ id: emailRecipients.id });

    await logAuditForRequest(
      req,
      actor,
      target === null ? 'unassign_email_recipients' : 'assign_email_recipients',
      target === null
        ? `${moved.length} penerima email dikeluarkan dari kampanye #${from ?? '-'}`
        : `Kampanye email #${target}: ${moved.length} penerima ditambahkan`,
    );
    return NextResponse.json({ success: true, count: moved.length });
  } catch (error: unknown) {
    console.error('Email recipients PATCH error:', error);
    return NextResponse.json({ error: 'Could not update the recipients' }, { status: 500 });
  }
}
