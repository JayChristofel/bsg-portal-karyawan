import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { campaigns, recipients, messageTemplates } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { logAuditForRequest, logAuditThrottled } from '@/lib/audit';
import { readJsonObject, str, parseId } from '@/lib/validate';

// 'sending' and 'sent' are owned by the send route; an admin may only move a campaign
// between these states, otherwise a PUT could mark an unsent campaign as finished.
const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'cancelled']);

/** undefined = not provided, null = explicitly cleared, Date = valid, 'invalid' = reject. */
function parseOptionalDate(value: unknown): Date | null | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}
import { getAdminUsername } from '@/lib/auth-helper';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        templateId: campaigns.templateId,
        templateName: messageTemplates.name,
        scheduledAt: campaigns.scheduledAt,
        sentAt: campaigns.sentAt,
        createdBy: campaigns.createdBy,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
        totalRecipients: sql<number>`(SELECT COUNT(*) FROM ${recipients} WHERE ${recipients.campaignId} = ${campaigns.id})`,
        sentCount: sql<number>`(SELECT COUNT(*) FROM ${recipients} WHERE ${recipients.campaignId} = ${campaigns.id} AND ${recipients.waStatus} != 'pending')`,
        readCount: sql<number>`(SELECT COUNT(*) FROM ${recipients} WHERE ${recipients.campaignId} = ${campaigns.id} AND ${recipients.waStatus} = 'read')`,
      })
      .from(campaigns)
      .leftJoin(messageTemplates, eq(campaigns.templateId, messageTemplates.id))
      .orderBy(desc(campaigns.createdAt));

    const listActor = await getAdminUsername(req);
    if (listActor) {
      await logAuditThrottled(
        req,
        listActor,
        'view_campaigns',
        `Melihat daftar kampanye (${rows.length} baris)`,
      );
    }

    return NextResponse.json({ campaigns: rows });
  } catch (error: any) {
    console.error('Campaigns GET error:', error);
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
      .insert(campaigns)
      .values({ name, templateId, scheduledAt, status })
      .returning();

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'create_campaign',
      `Kampanye "${name}" (ID: ${campaign.id}, status: ${status})`,
    );

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('Campaigns POST error:', error);
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
      .update(campaigns)
      .set({
        ...(name !== undefined && { name }),
        ...(templateId !== undefined && { templateId }),
        ...(scheduledAt !== undefined && { scheduledAt }),
        ...(status !== undefined && { status }),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id))
      .returning();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'update_campaign',
      `Kampanye "${campaign.name}" (ID: ${id})`,
    );

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('Campaigns PUT error:', error);
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

    const [current] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, id));
    if (current?.status === 'sending') {
      return NextResponse.json({ error: 'Campaign is sending; wait for it to finish.' }, { status: 409 });
    }

    const [deleted] = await db
      .delete(campaigns)
      .where(eq(campaigns.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'delete_campaign',
      `Kampanye "${deleted.name}" (ID: ${id})`,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Campaigns DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the campaign' }, { status: 500 });
  }
}
