import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { admins, auditLog } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const adminId = Number(id);
    if (!adminId) {
      return NextResponse.json({ error: 'Invalid admin ID.' }, { status: 400 });
    }

    const [admin] = await db
      .select({ id: admins.id, username: admins.username, createdAt: admins.createdAt })
      .from(admins)
      .where(eq(admins.id, adminId));
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }

    const requested = Number(req.nextUrl.searchParams.get('limit')) || 100;
    const limit = Math.min(Math.max(requested, 1), 200);

    // Audit rows are written with the plain username, so match it case
    // insensitively — usernames are not case unique in Postgres.
    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        detail: auditLog.detail,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(sql`lower(${auditLog.adminUsername}) = lower(${admin.username})`)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    void logAuditForRequest(
      req,
      username,
      'view_admin_activity',
      `Membuka riwayat aktivitas admin "${admin.username}" (${rows.length} baris)`,
    );

    return NextResponse.json({ admin, activity: rows });
  } catch (error: any) {
    console.error('Admin activity GET error:', error);
    return NextResponse.json({ error: 'Could not load the admin activity' }, { status: 500 });
  }
}