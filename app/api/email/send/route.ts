import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { to, subject, html, text } = body;

    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'to, subject, and html are required.' }, { status: 400 });
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
    return NextResponse.json({ error: 'Could not send email', detail: error?.message }, { status: 500 });
  }
}