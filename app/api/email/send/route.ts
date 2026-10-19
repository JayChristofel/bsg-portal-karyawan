import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { readJsonObject, str, parseId } from '@/lib/validate';
import { db } from '@/db';
import { emailRecipients } from '@/db/schema';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const to = str(body.to, 254);
    const subject = str(body.subject, 300).replace(/[\r\n]+/g, ' ');
    const html = typeof body.html === 'string' ? body.html.slice(0, 500_000) : '';
    const text = typeof body.text === 'string' ? body.text.slice(0, 500_000) : '';

    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'to, subject, and html are required.' }, { status: 400 });
    }
    // A single plain address: no lists, no display-name tricks.
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) {
      return NextResponse.json({ error: 'to must be a single valid email address.' }, { status: 400 });
    }

    // Optional: when the send is on behalf of a stored recipient, claim it first so a
    // double click / second tab / re-run cannot mail the same person twice, and record
    // the outcome so the list reflects it.
    const recipientId = body.recipientId == null ? null : parseId(body.recipientId);
    if (body.recipientId != null && recipientId === null) {
      return NextResponse.json({ error: 'Invalid recipientId.' }, { status: 400 });
    }
    if (recipientId !== null) {
      const claimed = await db
        .update(emailRecipients)
        .set({ status: 'sending' })
        .where(
          and(
            eq(emailRecipients.id, recipientId),
            or(isNull(emailRecipients.status), inArray(emailRecipients.status, ['pending', 'failed'])),
          ),
        )
        .returning({ id: emailRecipients.id });
      if (claimed.length === 0) {
        return NextResponse.json({ error: 'Recipient is not pending (already sent or in progress).' }, { status: 409 });
      }
    }

    const config = await import('@/lib/email').then((mod) => mod.getEmailConfig());

    let result;
    try {
      result = await sendEmail({
        to,
        subject,
        html,
        text: text || '',
        config: {
          ...config,
          fromEmail: config.fromEmail || 'no-reply@portal-pegawai.id',
          fromName: config.fromName || 'Portal Pegawai',
        },
      });
    } catch (err) {
      if (recipientId !== null) {
        await db.update(emailRecipients).set({ status: 'failed' }).where(eq(emailRecipients.id, recipientId));
      }
      throw err;
    }

    if (recipientId !== null) {
      await db
        .update(emailRecipients)
        .set({ status: 'sent', messageId: result.messageId ?? null, sentAt: new Date() })
        .where(eq(emailRecipients.id, recipientId));
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      response: result.response,
    });
  } catch (error: any) {
    console.error('Email send error:', error);
    // Admin-only endpoint used to test SMTP settings, so the transport's reason is
    // shown (truncated) -- without it a bad host/password is impossible to diagnose.
    const reason = String(error?.message ?? '').replace(/\s+/g, ' ').slice(0, 200);
    return NextResponse.json({ error: `Could not send email${reason ? `: ${reason}` : ''}` }, { status: 500 });
  }
}