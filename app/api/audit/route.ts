import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 50, 200);
    const adminFilter = req.nextUrl.searchParams.get('admin');

    const query = db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    const logs = adminFilter
      ? await query.where(eq(auditLog.adminUsername, adminFilter))
      : await query;

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Audit GET error:', error);
    return NextResponse.json({ error: 'Could not load the audit log' }, { status: 500 });
  }
}
