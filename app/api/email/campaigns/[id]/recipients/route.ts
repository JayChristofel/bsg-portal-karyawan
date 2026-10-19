import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailRecipients, emailCampaigns, emailLogs } from '@/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { parseId } from '@/lib/validate';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const recipients = await db
      .select({
        id: emailRecipients.id,
        name: emailRecipients.name,
        email: emailRecipients.email,
        cabang: emailRecipients.cabang,
        status: emailRecipients.status,
        sentAt: emailRecipients.sentAt,
      })
      .from(emailRecipients)
      .where(eq(emailRecipients.campaignId, campaignId))
      .orderBy(desc(emailRecipients.createdAt));

    // Delivery events recorded by the provider webhook (delivered/opened/bounced...), per recipient.
    const logs = await db
      .select({
        recipientId: emailLogs.recipientId,
        event: emailLogs.event,
        detail: emailLogs.detail,
        createdAt: emailLogs.createdAt,
      })
      .from(emailLogs)
      .where(eq(emailLogs.campaignId, campaignId))
      .orderBy(asc(emailLogs.createdAt))
      .limit(5000);
    const events: Record<number, { event: string; detail: string | null; createdAt: Date }[]> = {};
    for (const l of logs) {
      if (l.recipientId === null) continue;
      const list = events[l.recipientId] ?? [];
      list.push({ event: l.event, detail: l.detail, createdAt: l.createdAt });
      events[l.recipientId] = list;
    }

    return NextResponse.json({
      recipients: recipients.map((r) => ({ ...r, events: events[r.id] ?? [] })),
      campaign: { name: campaign.name, status: campaign.status },
      campaignName: campaign.name,
    });
  } catch (error: unknown) {
    console.error('Email campaign recipients GET error:', error);
    return NextResponse.json({ error: 'Could not load recipients' }, { status: 500 });
  }
}