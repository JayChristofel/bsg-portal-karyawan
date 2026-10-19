import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { readJsonObject, str } from '@/lib/validate';

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

    const config = await import('@/lib/email').then((mod) => mod.getEmailConfig());

    const result = await sendEmail({
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