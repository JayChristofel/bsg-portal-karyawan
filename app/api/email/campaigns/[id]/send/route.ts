import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailCampaigns, emailTemplates, emailRecipients } from '@/db/schema';
import { eq, and, or, isNull, inArray, lt, sql } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';
import { sendBulkEmails, getEmailConfig } from '@/lib/email';

export const maxDuration = 300;

// Bounded slice per request keeps the call inside the function time limit; the
// admin presses send again for whatever is left (reported as `remaining`).
const MAX_PER_REQUEST = 200;
// A campaign stuck on 'sending' longer than this belongs to a dead request.
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
    const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }
    if (campaign.status === 'cancelled') {
      return NextResponse.json({ error: 'Campaign is cancelled.' }, { status: 409 });
    }

    const config = await getEmailConfig();
    if (!config.host) {
      return NextResponse.json({ error: 'SMTP belum dikonfigurasi.' }, { status: 400 });
    }

    // Take the campaign atomically so a second click/tab cannot start a second loop.
    const staleBefore = new Date(Date.now() - SENDING_STALE_MS);
    const taken = await db
      .update(emailCampaigns)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(
        and(
          eq(emailCampaigns.id, campaignId),
          or(
            isNull(emailCampaigns.status),
            sql`${emailCampaigns.status} <> 'sending'`,
            lt(emailCampaigns.updatedAt, staleBefore),
          ),
        ),
      )
      .returning({ id: emailCampaigns.id });
    if (taken.length === 0) {
      return NextResponse.json({ error: 'Campaign is already sending.' }, { status: 409 });
    }

    const [template] = campaign.templateId
      ? await db.select().from(emailTemplates).where(eq(emailTemplates.id, campaign.templateId))
      : [null];

    if (!template) {
      await db
        .update(emailCampaigns)
        .set({ status: campaign.status ?? 'draft', updatedAt: new Date() })
        .where(eq(emailCampaigns.id, campaignId));
      return NextResponse.json({ error: 'Campaign has no template.' }, { status: 400 });
    }

    // Claim a bounded slice in one statement: rows move to 'sending' so no other
    // request can pick them up. 'sent'/'delivered'/'bounced' are never re-sent.
    const claimable = or(
      isNull(emailRecipients.status),
      inArray(emailRecipients.status, ['pending', 'failed']),
    );
    const claimedIds = (
      await db
        .select({ id: emailRecipients.id })
        .from(emailRecipients)
        .where(and(eq(emailRecipients.campaignId, campaignId), claimable))
        .orderBy(emailRecipients.id)
        .limit(MAX_PER_REQUEST)
    ).map((r) => r.id);

    const targets = claimedIds.length
      ? await db
          .update(emailRecipients)
          .set({ status: 'sending' })
          .where(and(inArray(emailRecipients.id, claimedIds), claimable))
          .returning()
      : [];

    if (targets.length === 0) {
      await db
        .update(emailCampaigns)
        .set({ status: campaign.status ?? 'draft', updatedAt: new Date() })
        .where(eq(emailCampaigns.id, campaignId));
      return NextResponse.json({ error: 'No recipients left to send.' }, { status: 400 });
    }

    let successCount = 0;
    let failCount = 0;
    const firstErrors: string[] = [];

    try {
      await sendBulkEmails({
        recipients: targets.map((t) => ({
          id: t.id,
          email: t.email,
          name: t.name,
          cabang: t.cabang ?? '',
        })),
        subject: campaign.subject || template.subject || '',
        html: template.htmlBody,
        text: template.textBody || '',
        config: {
          ...config,
          fromEmail: config.fromEmail || 'no-reply@portal-pegawai.id',
          fromName: config.fromName || 'Portal Pegawai',
        },
        // Persist each outcome as it happens so a crash keeps the progress made.
        onResult: async (result, rec) => {
          if (rec.id === undefined) return;
          if (result.ok) {
            successCount++;
            await db
              .update(emailRecipients)
              .set({ status: 'sent', messageId: result.messageId ?? null, sentAt: new Date() })
              .where(eq(emailRecipients.id, rec.id));
          } else {
            failCount++;
            if (firstErrors.length < 3) firstErrors.push(result.error ?? 'unknown');
            await db
              .update(emailRecipients)
              .set({ status: 'failed' })
              .where(eq(emailRecipients.id, rec.id));
          }
          await db
            .update(emailCampaigns)
            .set({ updatedAt: new Date() })
            .where(eq(emailCampaigns.id, campaignId));
        },
      });
    } finally {
      // Anything still 'sending' (transport never opened, crash) goes back to
      // 'pending' so it is not stranded; finished rows were already updated.
      await db
        .update(emailRecipients)
        .set({ status: 'pending' })
        .where(
          and(eq(emailRecipients.campaignId, campaignId), eq(emailRecipients.status, 'sending')),
        );
    }

    const [counts] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        sent: sql<number>`COUNT(*) FILTER (WHERE ${emailRecipients.status} IN ('sent','delivered'))::int`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${emailRecipients.status} IN ('failed','bounced','complained'))::int`,
        remaining: sql<number>`COUNT(*) FILTER (WHERE ${emailRecipients.status} IS NULL OR ${emailRecipients.status} = 'pending')::int`,
      })
      .from(emailRecipients)
      .where(eq(emailRecipients.campaignId, campaignId));

    const finished = counts.remaining === 0;
    const status = !finished ? 'scheduled' : counts.sent > 0 ? 'sent' : 'failed';
    await db
      .update(emailCampaigns)
      .set({
        status,
        totalRecipients: counts.total,
        sentCount: counts.sent,
        failCount: counts.failed,
        ...(finished && counts.sent > 0 ? { sentAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, campaignId));

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'send_email_campaign',
      `Kampanye email #${campaignId} "${campaign.name}": ${successCount} berhasil, ${failCount} gagal, ${counts.remaining} tersisa`,
    );

    return NextResponse.json({
      success: failCount === 0,
      campaignId,
      status,
      total: targets.length,
      successCount,
      failCount,
      remaining: counts.remaining,
      ...(failCount > 0 ? { sampleErrors: firstErrors } : {}),
    });
  } catch (error: any) {
    console.error('Email campaign send error:', error);
    // Do not strand the campaign (or its claimed rows) on 'sending'.
    await db
      .update(emailRecipients)
      .set({ status: 'pending' })
      .where(and(eq(emailRecipients.campaignId, campaignId), eq(emailRecipients.status, 'sending')))
      .catch(() => {});
    await db
      .update(emailCampaigns)
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.status, 'sending')))
      .catch(() => {});
    return NextResponse.json({ error: 'Could not send the campaign' }, { status: 500 });
  }
}
