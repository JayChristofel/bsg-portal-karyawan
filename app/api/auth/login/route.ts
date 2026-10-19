import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { admins } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, equalizeVerifyTiming, createSessionToken, COOKIE_NAME, SESSION_TTL_SECONDS, MAX_PASSWORD_LENGTH } from '@/lib/auth';
import { getClientIp, isUnknownIp, checkIpRateLimit, resetRateLimit, recordAuthFailure } from '@/lib/proxy';
import { logAudit } from '@/lib/audit';

const LOGIN_WINDOW_SECONDS = 300;
const LOGIN_MAX_ATTEMPTS = 5;
const MAX_USERNAME_LENGTH = 64;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  // Anything but two strings (null body, numbers, objects) is a client error, not a 500.
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.username !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json(
      { success: false, error: 'Username and password are required.' },
      { status: 400 }
    );
  }

  const username = body.username.trim();
  const password: string = body.password;

  // Bounded before they reach PBKDF2, the rate-limit key or the audit log.
  if (username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { success: false, error: 'Username atau password salah.' },
      { status: 401 }
    );
  }

  const accountKey = `auth_fail_user:${username.toLowerCase()}`;

  // Hard rate limit per source IP.
  if ((await checkIpRateLimit('login', clientIp, LOGIN_WINDOW_SECONDS, LOGIN_MAX_ATTEMPTS)).limited) {
    return NextResponse.json(
      { success: false, error: 'Too many failed login attempts. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required.' },
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
      await equalizeVerifyTiming();

      const delay = await recordAuthFailure(accountKey);
      if (delay > 0) await sleep(delay);

      void logAudit(
        username,
        'login_failed',
        'Percobaan login gagal: username tidak ditemukan',
        clientIp,
      );

      return NextResponse.json(
        { success: false, error: 'Username atau password salah.' },
        { status: 401 }
      );
    }

    if (!(await verifyPassword(password, admin.passwordHash))) {
      const delay = await recordAuthFailure(accountKey);
      if (delay > 0) await sleep(delay);

      void logAudit(
        admin.username,
        'login_failed',
        'Percobaan login gagal: password salah',
        clientIp,
      );

      return NextResponse.json(
        { success: false, error: 'Username atau password salah.' },
        { status: 401 }
      );
    }

    // Successful login: clear the failure budget for this IP and account.
    // An unknown IP shares one bucket with everyone, so a valid login by one
    // person must not wipe the throttle that protects against the others.
    if (!isUnknownIp(clientIp)) await resetRateLimit(`login:${clientIp}`);
    await resetRateLimit(accountKey);

    const token = await createSessionToken(admin.username);
    await logAudit(admin.username, 'login', 'Login successful', clientIp);

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
      { success: false, error: 'A server error occurred while processing the login.' },
      { status: 500 }
    );
  }
}
