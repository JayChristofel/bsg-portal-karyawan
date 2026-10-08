import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { campaigns, recipients, messageTemplates } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';
import { getGowaConfig, sendMessage } from '@/lib/whatsapp';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaignId = Number(rawId);

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) {
      return NextResponse.json({ error: 'Kampanye tidak ditemukan.' }, { status: 404 });
    }

    const [template] = campaign.templateId
      ? await db.select().from(messageTemplates).where(eq(messageTemplates.id, campaign.templateId))
      : [null];

    const targets = await db
      .select()
      .from(recipients)
      .where(and(eq(recipients.campaignId, campaignId), ne(recipients.waStatus, 'read')));

    if (targets.length === 0) {
      return NextResponse.json({ error: 'No recipients left to send.' }, { status: 400 });
    }

    await db.update(campaigns).set({ status: 'sending', updatedAt: new Date() }).where(eq(campaigns.id, campaignId));

    const config = await getGowaConfig();
    const origin = req.headers.get('origin') || '';
    const portalLink = `${origin}/`;

    let successCount = 0;
    let failCount = 0;

    for (const target of targets) {
      if (!target.phone) {
        failCount++;
        continue;
      }

      const message = template
        ? template.body.replace(/\{nama\}/gi, target.label).replace(/\{link\}/gi, portalLink)
        : (target.message || '').replace(/\{nama\}/gi, target.label).replace(/\{link\}/gi, portalLink);

      try {
        const result = await sendMessage(target.phone, message, config);
        const messageId = result?.results?.message_id || result?.results?.id || result?.message_id || null;
        const isSuccess = result?.code === 'SUCCESS' || result?.code === 'OK' || Boolean(messageId);

        if (isSuccess) {
          successCount++;
          await db.update(recipients).set({
            waMessageId: messageId,
            waStatus: 'sent',
            waSentAt: new Date(),
            message,
          }).where(eq(recipients.id, target.id));
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    await db.update(campaigns).set({
      status: 'sent',
      sentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(campaigns.id, campaignId));

    const username = await getAdminUsername(req);
    await logAudit(username || 'unknown', 'send_campaign', `Kampanye #${campaignId} "${campaign.name}": ${successCount} berhasil, ${failCount} gagal`);

    return NextResponse.json({
      success: true,
      campaignId,
      total: targets.length,
      successCount,
      failCount,
    });
  } catch (error: any) {
    console.error('Campaign send error:', error);
    return NextResponse.json({ error: 'Could not send the campaign', detail: error?.message }, { status: 500 });
  }
}
