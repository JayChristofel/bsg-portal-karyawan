import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { recipients, campaigns } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaignId = Number(rawId);
    const body = await req.json();
    const recipientIds: number[] = body.recipientIds || [];

    if (!recipientIds.length) {
      return NextResponse.json({ error: 'Tidak ada penerima yang dipilih.' }, { status: 400 });
    }

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) {
      return NextResponse.json({ error: 'Kampanye tidak ditemukan.' }, { status: 404 });
    }

    await db
      .update(recipients)
      .set({ campaignId })
      .where(eq(recipients.id, recipientIds[0]));

    for (let i = 1; i < recipientIds.length; i++) {
      await db.update(recipients).set({ campaignId }).where(eq(recipients.id, recipientIds[i]));
    }

    const username = await getAdminUsername(req);
    await logAudit(username || 'unknown', 'assign_recipients', `Kampanye #${campaignId}: ${recipientIds.length} penerima ditambahkan`);

    return NextResponse.json({ success: true, count: recipientIds.length });
  } catch (error: any) {
    console.error('Campaign recipients POST error:', error);
    return NextResponse.json({ error: 'Gagal menambahkan penerima ke kampanye' }, { status: 500 });
  }
}
