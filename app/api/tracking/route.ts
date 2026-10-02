import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { recipients, recipientStatusHistory, campaigns } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaignId = req.nextUrl.searchParams.get('campaignId');
    const recipientId = req.nextUrl.searchParams.get('recipientId');

    if (recipientId) {
      const [recipient] = await db.select().from(recipients).where(eq(recipients.id, Number(recipientId)));
      if (!recipient) {
        return NextResponse.json({ error: 'Penerima tidak ditemukan.' }, { status: 404 });
      }

      const history = await db
        .select()
        .from(recipientStatusHistory)
        .where(eq(recipientStatusHistory.recipientId, Number(recipientId)))
        .orderBy(desc(recipientStatusHistory.createdAt));

      return NextResponse.json({ recipient, history });
    }

    const campaignFilter = campaignId ? eq(recipients.campaignId, Number(campaignId)) : undefined;

    const rows = await db
      .select({
        id: recipients.id,
        label: recipients.label,
        phone: recipients.phone,
        cabang: recipients.cabang,
        waStatus: recipients.waStatus,
        waSentAt: recipients.waSentAt,
        waMessageId: recipients.waMessageId,
        campaignId: recipients.campaignId,
        campaignName: campaigns.name,
        isSubmitted: sql<boolean>`EXISTS(SELECT 1 FROM submissions s WHERE s.recipient_id = ${recipients.id})`,
        createdAt: recipients.createdAt,
      })
      .from(recipients)
      .leftJoin(campaigns, eq(recipients.campaignId, campaigns.id))
      .where(campaignFilter)
      .orderBy(desc(recipients.createdAt));

    return NextResponse.json({ recipients: rows });
  } catch (error: any) {
    console.error('Tracking GET error:', error);
    return NextResponse.json({ error: 'Gagal memuat data tracking' }, { status: 500 });
  }
}
