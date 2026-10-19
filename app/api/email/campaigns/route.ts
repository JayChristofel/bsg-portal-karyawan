import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailCampaigns, emailRecipients } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest, logAuditThrottled } from '@/lib/audit';
import { readJsonObject, str, parseId } from '@/lib/validate';

// 'sending', 'sent' and 'failed' are set by the send route, never by a PUT.
const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'cancelled']);
const FILTER_STATUSES = new Set(['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled']);

/** undefined = not provided, null = cleared, Date = valid, 'invalid' = reject. */
function parseOptionalDate(value: unknown): Date | null | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rawStatus = req.nextUrl.searchParams.get('status');
    if (rawStatus && !FILTER_STATUSES.has(rawStatus)) {
      return NextResponse.json({ error: 'Invalid status filter.' }, { status: 400 });
    }
    const status = rawStatus;

    const rows = await db
      .select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        status: emailCampaigns.status,
        templateId: emailCampaigns.templateId,
        scheduledAt: emailCampaigns.scheduledAt,
        sentAt: emailCampaigns.sentAt,
        totalRecipients: sql<number>`(SELECT COUNT(*)::int FROM ${emailRecipients} WHERE ${emailRecipients.campaignId} = ${emailCampaigns.id})`,
        sentCount: sql<number>`(SELECT COUNT(*)::int FROM ${emailRecipients} WHERE ${emailRecipients.campaignId} = ${emailCampaigns.id} AND ${emailRecipients.status} IN ('sent','delivered'))`,
        deliveredCount: sql<number>`(SELECT COUNT(*)::int FROM ${emailRecipients} WHERE ${emailRecipients.campaignId} = ${emailCampaigns.id} AND ${emailRecipients.status} = 'delivered')`,
        failCount: sql<number>`(SELECT COUNT(*)::int FROM ${emailRecipients} WHERE ${emailRecipients.campaignId} = ${emailCampaigns.id} AND ${emailRecipients.status} IN ('failed','bounced','complained'))`,
      })
      .from(emailCampaigns)
      .where(status ? eq(emailCampaigns.status, status) : undefined)
      .orderBy(desc(emailCampaigns.createdAt));

    const actor = await getAdminUsername(req);
    if (actor) {
      await logAuditThrottled(req, actor, 'view_email_campaigns', `Melihat ${rows.length} kampanye email`);
    }

    return NextResponse.json({ campaigns: rows });
  } catch (error: unknown) {
    console.error('Email campaigns GET error:', error);
    return NextResponse.json({ error: 'Could not load campaigns' }, { status: 500 });
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
    const subject = str(body.subject, 300).replace(/[\r\n]+/g, ' ');
    const templateId = body.templateId ? parseId(body.templateId) : null;
    const scheduledAt = parseOptionalDate(body.scheduledAt) ?? null;

    if (!name) {
      return NextResponse.json({ error: 'Campaign name is required.' }, { status: 400 });
    }
    if (body.templateId && templateId === null) {
      return NextResponse.json({ error: 'Invalid templateId.' }, { status: 400 });
    }
    if (scheduledAt === 'invalid') {
      return NextResponse.json({ error: 'Invalid scheduledAt.' }, { status: 400 });
    }

    const status = scheduledAt ? 'scheduled' : 'draft';

    const [campaign] = await db
      .insert(emailCampaigns)
      .values({ name, subject, templateId, scheduledAt, status })
      .returning();

    const username = await getAdminUsername(req);
    await logAuditForRequest(req, username ?? 'unknown', 'create_email_campaign', `Kampanye "${name}" (ID: ${campaign.id})`);

    return NextResponse.json({ campaign });
  } catch (error: unknown) {
    console.error('Email campaigns POST error:', error);
    return NextResponse.json({ error: 'Could not create the campaign' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const id = parseId(body.id);
    if (id === null) {
      return NextResponse.json({ error: 'A valid campaign ID is required.' }, { status: 400 });
    }
    const name = body.name !== undefined ? str(body.name, 200) : undefined;
    const subject = body.subject !== undefined ? str(body.subject, 300).replace(/[\r\n]+/g, ' ') : undefined;
    const templateId =
      body.templateId !== undefined ? (body.templateId ? parseId(body.templateId) : null) : undefined;
    const scheduledAt = parseOptionalDate(body.scheduledAt);
    const status = body.status !== undefined ? body.status : undefined;

    if (name !== undefined && !name) {
      return NextResponse.json({ error: 'Campaign name cannot be empty.' }, { status: 400 });
    }
    if (body.templateId && templateId === null) {
      return NextResponse.json({ error: 'Invalid templateId.' }, { status: 400 });
    }
    if (scheduledAt === 'invalid') {
      return NextResponse.json({ error: 'Invalid scheduledAt.' }, { status: 400 });
    }
    if (status !== undefined && (typeof status !== 'string' || !EDITABLE_STATUSES.has(status))) {
      return NextResponse.json(
        { error: `Status must be one of: ${[...EDITABLE_STATUSES].join(', ')}.` },
        { status: 400 },
      );
    }

    const [campaign] = await db
      .update(emailCampaigns)
      .set({
        ...(name !== undefined && { name }),
        ...(subject !== undefined && { subject }),
        ...(templateId !== undefined && { templateId }),
        ...(scheduledAt !== undefined && { scheduledAt }),
        ...(status !== undefined && { status }),
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, id))
      .returning();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(req, username ?? 'unknown', 'update_email_campaign', `Kampanye "${campaign.name}" (ID: ${id})`);

    return NextResponse.json({ campaign });
  } catch (error: unknown) {
    console.error('Email campaigns PUT error:', error);
    return NextResponse.json({ error: 'Could not update the campaign' }, { status: 500 });
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
      return NextResponse.json({ error: 'A valid campaign ID is required.' }, { status: 400 });
    }

    const [current] = await db.select({ status: emailCampaigns.status }).from(emailCampaigns).where(eq(emailCampaigns.id, id));
    if (current?.status === 'sending') {
      return NextResponse.json({ error: 'Campaign is sending; wait for it to finish.' }, { status: 409 });
    }

    const [deleted] = await db
      .delete(emailCampaigns)
      .where(eq(emailCampaigns.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(req, username ?? 'unknown', 'delete_email_campaign', `Kampanye "${deleted.name}" (ID: ${id})`);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Email campaigns DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the campaign' }, { status: 500 });
  }
}