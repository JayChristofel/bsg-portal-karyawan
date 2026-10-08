import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { admins } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, equalizeVerifyTiming, createSessionToken, COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/auth';
import { getClientIp, checkRateLimit, resetRateLimit, recordAuthFailure } from '@/lib/proxy';
import { logAudit } from '@/lib/audit';

const LOGIN_WINDOW_SECONDS = 300;
const LOGIN_MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Body harus berupa JSON yang valid.' },
      { status: 400 }
    );
  }

  const username = (body.username || '').trim();
  const password = body.password || '';

  const ipKey = `auth_fail_ip_${clientIp}`;
  const accountKey = `auth_fail_user_${username.toLowerCase()}`;

  // Hard rate limit per source IP.
  if (checkRateLimit(ipKey, LOGIN_WINDOW_SECONDS, LOGIN_MAX_ATTEMPTS).limited) {
    return NextResponse.json(
      { success: false, error: 'Terlalu banyak percobaan login gagal. Coba lagi nanti.' },
      { status: 429 }
    );
  }

  try {
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.username, username))
      .limit(1);

    if (!admin) {
      // Spend equivalent CPU so timing does not disclose valid usernames.
      equalizeVerifyTiming();

      const delay = recordAuthFailure(accountKey);
      if (delay > 0) await sleep(delay);

      return NextResponse.json(
        { success: false, error: 'Username atau password salah.' },
        { status: 401 }
      );
    }

    if (!verifyPassword(password, admin.passwordHash)) {
      const delay = recordAuthFailure(accountKey);
      if (delay > 0) await sleep(delay);

      return NextResponse.json(
        { success: false, error: 'Username atau password salah.' },
        { status: 401 }
      );
    }

    // Successful login: clear the failure budget for this IP and account.
    resetRateLimit(ipKey);
    resetRateLimit(accountKey);

    const token = await createSessionToken(admin.username);
    await logAudit(admin.username, 'login', 'Login berhasil', clientIp);

    const response = NextResponse.json({ success: true, redirect: '/admin' });
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan pada server saat memproses login.' },
      { status: 500 }
    );
  }
}
