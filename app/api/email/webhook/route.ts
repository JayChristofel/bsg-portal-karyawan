import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailLogs, emailRecipients } from '@/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { verifyWebhookSignature } from '@/lib/email';
import { logAudit } from '@/lib/audit';
import { getClientIp, checkIpRateLimit } from '@/lib/proxy';
import { parseId } from '@/lib/validate';

const MAX_BODY_BYTES = 64 * 1024;

// Recipient status can only move forward; bounce/complaint are terminal.
const RANK: Record<string, number> = { pending: 0, sending: 0, failed: 1, sent: 2, delivered: 3, bounced: 4, complained: 4 };

// Provider events that change a recipient's status. `opened`/`clicked` are only logged.
const STATUS_FOR_EVENT: Record<string, string> = {
  sent: 'sent',
  delivered: 'delivered',
  bounced: 'bounced',
  complained: 'complained',
};
const LOGGED_EVENTS = new Set([...Object.keys(STATUS_FOR_EVENT), 'opened', 'clicked']);

/**
 * Inbound delivery events from the email provider. Called by the provider, so it
 * carries no admin cookie: the sender is authenticated by an HMAC signature over
 * the raw body instead.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if ((await checkIpRateLimit('email-webhook', ip, 60, 300)).limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const signature = req.headers.get('x-signature') || req.headers.get('x-webhook-signature');
  if (!verifyWebhookSignature(rawBody, signature)) {
    void logAudit('webhook', 'email_webhook_invalid_signature', `Signature tidak valid (body ${rawBody.length} byte)`, ip);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 });
  }

  const event = typeof body.event === 'string' ? body.event.toLowerCase() : '';
  const recipientId = parseId(body.recipientId);
  const campaignId = body.campaignId === undefined || body.campaignId === null ? null : parseId(body.campaignId);
  if (!LOGGED_EVENTS.has(event) || recipientId === null || (body.campaignId != null && campaignId === null)) {
    return NextResponse.json({ error: 'Valid event and recipientId are required.' }, { status: 400 });
  }
  const messageId = typeof body.messageId === 'string' ? body.messageId.slice(0, 255) : null;
  const detail = typeof body.detail === 'string' ? body.detail.slice(0, 500) : null;

  try {
    const newStatus = STATUS_FOR_EVENT[event];
    if (newStatus) {
      const [current] = await db
        .select({ status: emailRecipients.status })
        .from(emailRecipients)
        .where(eq(emailRecipients.id, recipientId));
      if (!current) {
        return NextResponse.json({ error: 'Unknown recipient.' }, { status: 404 });
      }
      if ((RANK[newStatus] ?? 0) > (RANK[current.status ?? 'pending'] ?? 0)) {
        // Optimistic: only applies if nobody moved the status since we read it.
        await db
          .update(emailRecipients)
          .set({
            status: newStatus,
            ...(messageId ? { messageId } : {}),
            ...(newStatus === 'sent' ? { sentAt: new Date() } : {}),
          })
          .where(
            and(
              eq(emailRecipients.id, recipientId),
              current.status === null
                ? eq(emailRecipients.id, recipientId)
                : eq(emailRecipients.status, current.status),
            ),
          );
      }
    }

    await db.insert(emailLogs).values({
      campaignId: campaignId ?? undefined,
      recipientId,
      event,
      detail: detail ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // 5xx so the provider retries instead of the event being lost.
    console.error('Email webhook error:', error?.message);
    return NextResponse.json({ error: 'Could not process webhook' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rawCampaignId = req.nextUrl.searchParams.get('campaignId');
    const campaignId = rawCampaignId === null ? null : parseId(rawCampaignId);
    if (rawCampaignId !== null && campaignId === null) {
      return NextResponse.json({ error: 'Invalid campaignId.' }, { status: 400 });
    }
    const logs = await db.select().from(emailLogs)
      .where(campaignId !== null ? eq(emailLogs.campaignId, campaignId) : undefined)
      .orderBy(desc(emailLogs.createdAt))
      .limit(50);

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Email logs GET error:', error);
    return NextResponse.json({ error: 'Could not load logs' }, { status: 500 });
  }
}
