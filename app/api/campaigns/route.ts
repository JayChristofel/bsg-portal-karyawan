import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { campaigns, recipients, messageTemplates } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
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

    return NextResponse.json({ campaigns: rows });
  } catch (error: any) {
    console.error('Campaigns GET error:', error);
    return NextResponse.json({ error: 'Gagal memuat kampanye' }, { status: 500 });
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
    const templateId = body.templateId ? Number(body.templateId) : null;
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    if (!name) {
      return NextResponse.json({ error: 'Nama kampanye wajib diisi.' }, { status: 400 });
    }

    const status = scheduledAt ? 'scheduled' : 'draft';

    const [campaign] = await db
      .insert(campaigns)
      .values({ name, templateId, scheduledAt, status })
      .returning();

    const username = await getAdminUsername(req);
    await logAudit(username || 'unknown', 'create_campaign', `Kampanye "${name}" (ID: ${campaign.id}, status: ${status})`);

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('Campaigns POST error:', error);
    return NextResponse.json({ error: 'Gagal membuat kampanye' }, { status: 500 });
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
    const templateId = body.templateId !== undefined ? (body.templateId ? Number(body.templateId) : null) : undefined;
    const scheduledAt = body.scheduledAt !== undefined ? (body.scheduledAt ? new Date(body.scheduledAt) : null) : undefined;
    const status = body.status !== undefined ? body.status : undefined;

    if (!id) {
      return NextResponse.json({ error: 'ID kampanye wajib diisi.' }, { status: 400 });
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
      return NextResponse.json({ error: 'Kampanye tidak ditemukan.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAudit(username || 'unknown', 'update_campaign', `Kampanye "${campaign.name}" (ID: ${id})`);

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('Campaigns PUT error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui kampanye' }, { status: 500 });
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
      return NextResponse.json({ error: 'ID kampanye wajib diisi.' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(campaigns)
      .where(eq(campaigns.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Kampanye tidak ditemukan.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAudit(username || 'unknown', 'delete_campaign', `Kampanye "${deleted.name}" (ID: ${id})`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Campaigns DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menghapus kampanye' }, { status: 500 });
  }
}
