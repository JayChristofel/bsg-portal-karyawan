import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { saveEmailConfig, getEmailConfig, validateSmtpHost } from '@/lib/email';
import { readJsonObject, str, boundedInt } from '@/lib/validate';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { password, apiKey, ...config } = await getEmailConfig();
    // Secrets never leave the server; the form only learns whether one is stored.
    return NextResponse.json({
      config: { ...config, password: '', apiKey: '', hasPassword: Boolean(password), hasApiKey: Boolean(apiKey) },
    });
  } catch (error: unknown) {
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
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const host = str(body.host, 253);
    const hostCheck = validateSmtpHost(host);
    if (!hostCheck.ok) {
      return NextResponse.json({ error: hostCheck.error }, { status: 400 });
    }
    const fromEmail = str(body.fromEmail, 254);
    if (fromEmail && !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(fromEmail)) {
      return NextResponse.json({ error: 'From email tidak valid.' }, { status: 400 });
    }
    const port = body.port === undefined ? undefined : boundedInt(body.port, 1, 65535, 587);

    await saveEmailConfig({
      host,
      port,
      secure: typeof body.secure === 'boolean' ? body.secure : undefined,
      username: str(body.username, 254),
      password: typeof body.password === 'string' ? body.password.slice(0, 512) : undefined,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey.slice(0, 512) : undefined,
      fromEmail,
      fromName: str(body.fromName, 100),
    });

    const actor = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      actor ?? 'unknown',
      'save_email_config',
      `Konfigurasi SMTP disimpan — host: ${host || '(kosong)'}, port: ${port || '(default)'}`,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Email config POST error:', error);
    return NextResponse.json({ error: 'Could not save email configuration' }, { status: 500 });
  }
}