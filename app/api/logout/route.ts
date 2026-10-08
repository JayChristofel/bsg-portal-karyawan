import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

/**
 * Logout is POST-only.
 *
 * A GET endpoint can be triggered cross-site by an <img> tag, which would let
 * any third-party page force-logout an admin (CSRF logout).
 */
export async function POST(req: NextRequest) {
  const loginUrl = new URL('/login', req.url);
  const response = NextResponse.redirect(loginUrl, { status: 303 });
  response.cookies.delete(COOKIE_NAME);
  return response;
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Gunakan POST untuk logout.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}