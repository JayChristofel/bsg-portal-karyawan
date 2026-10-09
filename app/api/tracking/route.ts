import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';
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
        return NextResponse.json({ error: 'Recipient not found.' }, { status: 404 });
      }

      const history = await db
        .select()
        .from(recipientStatusHistory)
        .where(eq(recipientStatusHistory.recipientId, Number(recipientId)))
        .orderBy(desc(recipientStatusHistory.createdAt));

      if (username) {
        void logAuditForRequest(
          req,
          username,
          'view_delivery_history',
          `Timeline penerima "${recipient.label}" (ID: ${recipientId})`,
        );
      }

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
        isSubmitted: sql<boolean>`EXISTS(SELECT 1 FROM pegawai p WHERE lower(trim(p.name)) = lower(trim(${recipients.label})))`,
        createdAt: recipients.createdAt,
      })
      .from(recipients)
      .leftJoin(campaigns, eq(recipients.campaignId, campaigns.id))
      .where(campaignFilter)
      .orderBy(desc(recipients.createdAt));

    if (username) {
      void logAuditForRequest(
        req,
        username,
        'view_tracking',
        `Daftar status pengiriman (${rows.length} baris)`,
      );
    }

    return NextResponse.json({ recipients: rows });
  } catch (error: any) {
    console.error('Tracking GET error:', error);
    return NextResponse.json({ error: 'Could not load tracking data' }, { status: 500 });
  }
}
