import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

/**
 * Logout is POST-only.
 *
 * A GET endpoint can be triggered cross-site by an <img> tag, which would let
 * any third-party page force-logout an admin (CSRF logout).
 */
export async function POST(req: NextRequest) {
  const actor = await getAdminUsername(req);
  if (actor) {
    void logAuditForRequest(req, actor, 'logout', 'Logout dari panel admin');
  }

  const loginUrl = new URL('/login', req.url);
  const response = NextResponse.redirect(loginUrl, { status: 303 });
  response.cookies.delete(COOKIE_NAME);
  return response;
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST for logout.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}