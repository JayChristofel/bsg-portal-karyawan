import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { campaigns, recipients, messageTemplates } from '@/db/schema';
import { eq, and, or, isNull, asc, lt, sql } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';
import { getGowaConfig, sendMessageGuarded, getWarmUpState } from '@/lib/whatsapp';
import {
  claimRecipient,
  markRecipientSent,
  markRecipientFailed,
  releaseRecipient,
  sweepStaleSending,
  parseSendResult,
  renderMessage,
  portalLinkFrom,
} from '@/lib/recipient-queue';

export const maxDuration = 300;

// One request sends a bounded slice with a short random pause between messages,
// so a long campaign is not fired as a single rapid burst and the request stays
// inside the function time limit. The admin simply sends again for the rest.
const MAX_PER_REQUEST = 25;
const PAUSE_MIN_MS = 2_000;
const PAUSE_JITTER_MS = 3_000;
// A campaign stuck in 'sending' longer than this belongs to a dead request.
const SENDING_STALE_MS = 10 * 60_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!/^\d+$/.test(rawId)) {
    return NextResponse.json({ error: 'Invalid campaign id.' }, { status: 400 });
  }
  const campaignId = Number(rawId);

  try {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }
    if (campaign.status === 'cancelled') {
      return NextResponse.json({ error: 'Campaign is cancelled.' }, { status: 409 });
    }

    // Take the campaign atomically: a second click or tab while one request is
    // still sending gets 409 instead of starting a second loop.
    const staleBefore = new Date(Date.now() - SENDING_STALE_MS);
    const taken = await db
      .update(campaigns)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, campaignId),
          or(
            isNull(campaigns.status),
            sql`${campaigns.status} <> 'sending'`,
            lt(campaigns.updatedAt, staleBefore),
          ),
        ),
      )
      .returning({ id: campaigns.id });
    if (taken.length === 0) {
      return NextResponse.json({ error: 'Campaign is already sending.' }, { status: 409 });
    }

    await sweepStaleSending();

    const [template] = campaign.templateId
      ? await db.select().from(messageTemplates).where(eq(messageTemplates.id, campaign.templateId))
      : [null];

    // Only rows still waiting: anything sent/delivered/read, in flight, or
    // failed is not re-sent by pressing the button again.
    const pendingWhere = and(
      eq(recipients.campaignId, campaignId),
      or(isNull(recipients.waStatus), eq(recipients.waStatus, 'pending')),
    );
    const queue = await db.select().from(recipients).where(pendingWhere).orderBy(asc(recipients.id));

    if (queue.length === 0) {
      await db
        .update(campaigns)
        .set({ status: campaign.status ?? 'draft', updatedAt: new Date() })
        .where(eq(campaigns.id, campaignId));
      return NextResponse.json({ error: 'No recipients left to send.' }, { status: 400 });
    }

    const targets = queue.slice(0, MAX_PER_REQUEST);

    const config = await getGowaConfig();
    const link = portalLinkFrom(req.headers.get('origin'));

    let successCount = 0;
    let failCount = 0;
    let quotaBlocked = false;

    for (const [i, target] of targets.entries()) {
      if (!target.phone) {
        failCount++;
        continue;
      }

      if (!(await claimRecipient(target.id))) continue; // someone else is sending it

      const message = renderMessage(template ? template.body : (target.message ?? ''), {
        nama: target.label,
        link,
      });

      try {
        const guarded = await sendMessageGuarded(target.phone, message, config.deviceId, config);

        // Quota exhausted: stop the loop rather than burning through the
        // remaining recipients as failures.
        if (!guarded.ok) {
          await releaseRecipient(target.id);
          quotaBlocked = true;
          break;
        }

        const { messageId, isSuccess } = parseSendResult(guarded.result);
        if (isSuccess) {
          await markRecipientSent(target.id, messageId, message);
          successCount++;
        } else {
          await markRecipientFailed(target.id);
          failCount++;
        }
      } catch (err) {
        // Outcome unknown: park it as failed for a human, never auto-retry.
        console.error(`Campaign #${campaignId} send failed for recipient ${target.id}:`, (err as Error).message);
        await markRecipientFailed(target.id);
        failCount++;
      }

      await db.update(campaigns).set({ updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, PAUSE_MIN_MS + Math.random() * PAUSE_JITTER_MS));
      }
    }

    const [{ remaining }] = await db
      .select({ remaining: sql<number>`COUNT(*)::int` })
      .from(recipients)
      .where(pendingWhere);

    // 'sent' only when nothing is left waiting; otherwise it stays 'scheduled'
    // so the leftover recipients are not hidden behind a finished campaign.
    const finished = !quotaBlocked && remaining === 0;
    await db
      .update(campaigns)
      .set({
        status: finished ? 'sent' : 'scheduled',
        ...(finished ? { sentAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    const warmUp = await getWarmUpState(config.deviceId);
    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      quotaBlocked ? 'send_campaign_quota' : 'send_campaign',
      quotaBlocked
        ? `Kampanye #${campaignId} "${campaign.name}" dihentikan: kuota harian habis ` +
            `(${warmUp.sentToday}/${warmUp.dailyLimit}), ${successCount} terkirim`
        : `Kampanye #${campaignId} "${campaign.name}": ${successCount} berhasil, ${failCount} gagal, ${remaining} tersisa`,
    );

    return NextResponse.json({
      success: !quotaBlocked,
      quotaBlocked,
      campaignId,
      total: targets.length,
      successCount,
      failCount,
      remaining,
      sentToday: warmUp.sentToday,
      dailyLimit: warmUp.dailyLimit,
    });
  } catch (error: any) {
    console.error('Campaign send error:', error);
    // Release the campaign so a crashed request does not leave it stuck on 'sending'.
    await db
      .update(campaigns)
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'sending')))
      .catch(() => {});
    return NextResponse.json({ error: 'Could not send the campaign' }, { status: 500 });
  }
}
