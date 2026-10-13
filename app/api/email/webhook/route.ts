import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailLogs, emailRecipients, emailCampaigns } from '@/db/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { verifyWebhookSignature } from '@/lib/email';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { event, recipientId, campaignId, messageId, detail } = body;

    if (!event || !recipientId) {
      return NextResponse.json({ error: 'event and recipientId are required.' }, { status: 400 });
    }

    const signature = req.headers.get('x-signature') || '';
    verifyWebhookSignature(JSON.stringify(body), signature);

    const newStatus = event === 'bounced' || event === 'complained' ? 'failed'
      : event === 'sent' ? 'sent'
      : 'delivered';

    await db.update(emailRecipients).set({
      status: newStatus,
      messageId: messageId ?? undefined,
      sentAt: event === 'sent' ? new Date() : undefined,
    }).where(eq(emailRecipients.id, recipientId));

    if (event === 'sent') {
      await db.update(emailCampaigns)
        .set({ sentCount: sql`${emailCampaigns.sentCount} + 1` })
        .where(eq(emailCampaigns.id, campaignId));
    }

    await db.insert(emailLogs).values({
      campaignId: campaignId ?? undefined,
      recipientId,
      event,
      detail: detail ?? undefined,
    });

    const actor = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      actor ?? 'unknown',
      'email_webhook',
      `Event "${event}" untuk recipient #${recipientId}`,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Email webhook error:', error);
    return NextResponse.json({ error: 'Could not process webhook' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaignId = req.nextUrl.searchParams.get('campaignId');
    const logs = await db.select().from(emailLogs)
      .where(campaignId ? eq(emailLogs.campaignId, Number(campaignId)) : undefined)
      .orderBy(desc(emailLogs.createdAt))
      .limit(50);

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Email logs GET error:', error);
    return NextResponse.json({ error: 'Could not load logs' }, { status: 500 });
  }
}