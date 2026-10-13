import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { saveEmailConfig, getEmailConfig } from '@/lib/email';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getEmailConfig();
    return NextResponse.json({ config });
  } catch (error: any) {
    console.error('Email config GET error:', error);
    return NextResponse.json({ error: 'Could not load email configuration' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { host, port, secure, username, password, apiKey, fromEmail, fromName } = body;

    await saveEmailConfig({ host, port, secure, username, password, apiKey, fromEmail, fromName });

    const actor = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      actor ?? 'unknown',
      'save_email_config',
      `Konfigurasi SMTP disimpan — host: ${host || '(kosong)'}, port: ${port || '(default)'}`,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Email config POST error:', error);
    return NextResponse.json({ error: 'Could not save email configuration' }, { status: 500 });
  }
}