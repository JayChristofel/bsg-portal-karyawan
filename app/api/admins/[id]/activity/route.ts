import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { admins, auditLog } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logAuditThrottled } from '@/lib/audit';
import { parseId } from '@/lib/validate';

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
    const adminId = parseId(id);
    if (adminId === null) {
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

    // Audit rows carry the exact username. Usernames are unique case-sensitively, so an
    // exact match is correct (a case-insensitive one would merge "Admin" and "admin")
    // and it can use the admin_username index.
    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        detail: auditLog.detail,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.adminUsername, admin.username))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    await logAuditThrottled(
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