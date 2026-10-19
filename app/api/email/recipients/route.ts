import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailRecipients } from '@/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
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
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
    console.error('Email recipients DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the recipient' }, { status: 500 });
  }
}