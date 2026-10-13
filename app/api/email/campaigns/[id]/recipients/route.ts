import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailRecipients, emailCampaigns } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaignId = Number(rawId);

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
      })
      .from(emailRecipients)
      .where(eq(emailRecipients.campaignId, campaignId))
      .orderBy(desc(emailRecipients.createdAt));

    return NextResponse.json({ recipients, campaignName: campaign.name });
  } catch (error: any) {
    console.error('Email campaign recipients GET error:', error);
    return NextResponse.json({ error: 'Could not load recipients' }, { status: 500 });
  }
}