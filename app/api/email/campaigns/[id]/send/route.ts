import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailCampaigns, emailTemplates, emailRecipients } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';
import { sendBulkEmails } from '@/lib/email';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const [template] = campaign.templateId
      ? await db.select().from(emailTemplates).where(eq(emailTemplates.id, campaign.templateId))
      : [null];

    const targets = await db
      .select()
      .from(emailRecipients)
      .where(and(eq(emailRecipients.campaignId, campaignId), ne(emailRecipients.status, 'sent')));

    if (targets.length === 0) {
      return NextResponse.json({ error: 'No recipients left to send.' }, { status: 400 });
    }

    await db.update(emailCampaigns).set({ status: 'sending', updatedAt: new Date() }).where(eq(emailCampaigns.id, campaignId));

    const config = await import('@/lib/email').then((mod) => mod.getEmailConfig());

    const origin = req.headers.get('origin') || '';
    const portalLink = `${origin}/`;

    let successCount = 0;
    let failCount = 0;

    for (const target of targets) {
      const headerName = target.name || '';
      const headerCabang = target.cabang || '';
      const headerEmail = target.email;

      let messageHtml = template?.htmlBody || '';
      let messageText = template?.textBody || '';

      messageHtml = messageHtml
        .replace('{{name}}', headerName)
        .replace('{{cabang}}', headerCabang)
        .replace('{{email}}', headerEmail);

      messageText = messageText
        .replace('{{name}}', headerName)
        .replace('{{cabang}}', headerCabang)
        .replace('{{email}}', headerEmail);

      try {
        await sendBulkEmails({
          recipients: [{ email: headerEmail, name: headerName, cabang: headerCabang }],
          subject: campaign.subject || '',
          html: messageHtml,
          text: messageText,
          config: {
            ...config,
            fromEmail: config.fromEmail || 'no-reply@portal-pegawai.id',
            fromName: config.fromName || 'Portal Pegawai',
          },
          onProgress: () => {},
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    await db.update(emailCampaigns).set({
      status: 'sent',
      sentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(emailCampaigns.id, campaignId));

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'send_campaign',
      `Kampanye #${campaignId} "${campaign.name}": ${successCount} berhasil, ${failCount} gagal`,
    );

    return NextResponse.json({
      success: true,
      campaignId,
      total: targets.length,
      successCount,
      failCount,
    });
  } catch (error: any) {
    console.error('Email campaign send error:', error);
    return NextResponse.json({ error: 'Could not send the campaign', detail: error?.message }, { status: 500 });
  }
}