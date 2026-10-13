import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailLogs, emailRecipients, emailCampaigns } from '@/db/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { verifyWebhookSignature } from '@/lib/email';

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

    // Verify webhook signature
    const signature = req.headers.get('x-signature') || '';
    const isValid = verifyWebhookSignature(JSON.stringify(body), signature);

    // Update recipient status
    await db.update(emailRecipients).set({
      status: event === 'delivered' ? 'delivered' : event === 'opened' ? 'delivered' : event === 'clicked' ? 'delivered' : event === 'bounced' ? 'failed' : event === 'complained' ? 'failed' : 'delivered',
      messageId,
      sentAt: event === 'sent' ? new Date() : undefined,
    }).where(eq(emailRecipients.id, recipientId));

    // Log the event
    const [log] = await db
      .insert(emailLogs)
      .values({ campaignId, recipientId, event, detail })
      .returning();

    // Update campaign sent count
    if (event === 'sent') {
      await db.update(emailCampaigns).set({ sentCount: sql`${emailCampaigns.sentCount} + 1` }).where(eq(emailCampaigns.id, campaignId));
    }

    return NextResponse.json({ success: true, logged: log ? true : false });
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
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId') ? Number(searchParams.get('campaignId')) : undefined;

    let query = db.select().from(emailLogs);

    if (campaignId !== undefined) {
      query = query.where(eq(emailLogs.campaignId, campaignId));
    }

    const logs = await query.orderBy(desc(emailLogs.createdAt)).limit(50);
    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Email logs GET error:', error);
    return NextResponse.json({ error: 'Could not load logs' }, { status: 500 });
  }
}