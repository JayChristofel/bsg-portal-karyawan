import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { admins } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, createSessionToken, COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/auth';
import { getClientIp, checkRateLimit } from '@/lib/proxy';

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimitKey = `auth_fail_${clientIp}`;

  // Rate limit: max 5 failed attempts per 5 minutes (300s)
  const limitCheck = checkRateLimit(rateLimitKey, 300, 5);
  if (limitCheck.limited) {
    return NextResponse.json(
      { success: false, error: 'Terlalu banyak percobaan login gagal. Coba lagi nanti.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const username = (body.username || '').trim();
    const password = body.password || '';

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

    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      // Record failed hit for rate limiting
      checkRateLimit(rateLimitKey, 300, 5);
      return NextResponse.json(
        { success: false, error: 'Username atau password salah.' },
        { status: 401 }
      );
    }

    const token = await createSessionToken(admin.username);

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
