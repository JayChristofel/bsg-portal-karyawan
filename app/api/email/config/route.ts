import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { settings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { saveEmailConfig, getEmailConfig } from '@/lib/email';

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
    const {
      host,
      port,
      secure,
      username,
      password,
      apiKey,
      fromEmail,
      fromName,
    } = body;

    await saveEmailConfig({
      host,
      port,
      secure,
      username,
      password,
      apiKey,
      fromEmail,
      fromName,
    });

    const actor = await getAdminUsername(req);
    // Log audit tanpa await (fire-and-forget)
    (async () => {
      const { db } = await import('@/db');
      const { sql } = await import('drizzle-orm');
      const ip = req.ip || 'unknown';
      // Don't use await here - just fire and forget
      db.execute(sql`INSERT INTO audit_log (admin_username, action, detail, ip_address) VALUES (${actor}, 'save_email_config', ${`Konfigurasi SMTP disimpan — host: ${host || '(kosong)'}, port: ${port || '(default)'}`}, ${ip})`).catch(() => {});
    })();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Email config POST error:', error);
    return NextResponse.json({ error: 'Could not save email configuration' }, { status: 500 });
  }
}