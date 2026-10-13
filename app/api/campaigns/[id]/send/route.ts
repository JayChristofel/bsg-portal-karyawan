import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { campaigns, recipients, messageTemplates } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';
import { getGowaConfig, sendMessageGuarded, getWarmUpState } from '@/lib/whatsapp';

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
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
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
    const warmUp = await getWarmUpState(config.deviceId);
    const origin = req.headers.get('origin') || '';
    const portalLink = `${origin}/`;

    let successCount = 0;
    let failCount = 0;
    let quotaBlocked = false;

    for (const target of targets) {
      if (!target.phone) {
        failCount++;
        continue;
      }

      const message = template
        ? template.body.replace(/\{nama\}/gi, target.label).replace(/\{link\}/gi, portalLink)
        : (target.message || '').replace(/\{nama\}/gi, target.label).replace(/\{link\}/gi, portalLink);

      try {
        const guarded = await sendMessageGuarded(target.phone, message, config.deviceId, config);

        // Quota exhausted: stop the loop rather than burning through the
        // remaining recipients as failures.
        if (!guarded.ok) {
          quotaBlocked = true;
          break;
        }

        const result: any = guarded.result;
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

    // A quota-stopped campaign stays 'scheduled' so it can resume tomorrow;
    // marking it 'sent' would hide the fact that recipients were left behind.
    await db.update(campaigns).set({
      status: quotaBlocked ? 'scheduled' : 'sent',
      ...(quotaBlocked ? {} : { sentAt: new Date() }),
      updatedAt: new Date(),
    }).where(eq(campaigns.id, campaignId));

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      quotaBlocked ? 'send_campaign_quota' : 'send_campaign',
      quotaBlocked
        ? `Kampanye #${campaignId} "${campaign.name}" dihentikan: kuota harian habis ` +
            `(${warmUp.sentToday}/${warmUp.dailyLimit}), ${successCount} terkirim`
        : `Kampanye #${campaignId} "${campaign.name}": ${successCount} berhasil, ${failCount} gagal`,
    );

    return NextResponse.json({
      success: !quotaBlocked,
      quotaBlocked,
      campaignId,
      total: targets.length,
      successCount,
      failCount,
      sentToday: warmUp.sentToday,
      dailyLimit: warmUp.dailyLimit,
    });
  } catch (error: any) {
    console.error('Campaign send error:', error);
    return NextResponse.json({ error: 'Could not send the campaign', detail: error?.message }, { status: 500 });
  }
}
