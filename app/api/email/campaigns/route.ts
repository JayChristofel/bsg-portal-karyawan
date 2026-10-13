import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailCampaigns, emailRecipients } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const status = req.nextUrl.searchParams.get('status');

    const rows = await db
      .select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        status: emailCampaigns.status,
        templateId: emailCampaigns.templateId,
        scheduledAt: emailCampaigns.scheduledAt,
        sentAt: emailCampaigns.sentAt,
        totalRecipients: sql<number>`(SELECT COUNT(*) FROM ${emailRecipients} WHERE ${emailRecipients.campaignId} = ${emailCampaigns.id})`,
        sentCount: sql<number>`(SELECT COUNT(*) FROM ${emailRecipients} WHERE ${emailRecipients.campaignId} = ${emailCampaigns.id} AND ${emailRecipients.status} != 'pending')`,
        failCount: sql<number>`(SELECT COUNT(*) FROM ${emailRecipients} WHERE ${emailRecipients.campaignId} = ${emailCampaigns.id} AND ${emailRecipients.status} = 'failed')`,
      })
      .from(emailCampaigns)
      .where(status ? eq(emailCampaigns.status, status) : undefined)
      .orderBy(desc(emailCampaigns.createdAt));

    const actor = await getAdminUsername(req);
    if (actor) {
      void logAuditForRequest(req, actor, 'view_email_campaigns', `Melihat ${rows.length} kampanye email`);
    }

    return NextResponse.json({ campaigns: rows });
  } catch (error: any) {
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
    const body = await req.json();
    const name = (body.name || '').trim();
    const subject = (body.subject || '').trim();
    const templateId = body.templateId ? Number(body.templateId) : null;
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    if (!name) {
      return NextResponse.json({ error: 'Campaign name is required.' }, { status: 400 });
    }

    const status = scheduledAt ? 'scheduled' : 'draft';

    const [campaign] = await db
      .insert(emailCampaigns)
      .values({ name, subject, templateId, scheduledAt, status })
      .returning();

    const username = await getAdminUsername(req);
    await logAuditForRequest(req, username ?? 'unknown', 'create_email_campaign', `Kampanye "${name}" (ID: ${campaign.id})`);

    return NextResponse.json({ campaign });
  } catch (error: any) {
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
    const body = await req.json();
    const id = Number(body.id);
    const name = body.name !== undefined ? (body.name || '').trim() : undefined;
    const subject = body.subject !== undefined ? (body.subject || '').trim() : undefined;
    const templateId = body.templateId !== undefined ? (body.templateId ? Number(body.templateId) : null) : undefined;
    const scheduledAt = body.scheduledAt !== undefined ? (body.scheduledAt ? new Date(body.scheduledAt) : null) : undefined;
    const status = body.status !== undefined ? body.status : undefined;

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required.' }, { status: 400 });
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
  } catch (error: any) {
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
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required.' }, { status: 400 });
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
  } catch (error: any) {
    console.error('Email campaigns DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the campaign' }, { status: 500 });
  }
}