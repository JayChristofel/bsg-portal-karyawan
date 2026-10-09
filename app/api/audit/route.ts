import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { and, asc, count, desc, eq, gte, lte, like, or, type SQL } from 'drizzle-orm';
import { logAuditForRequest } from '@/lib/audit';
import { getAdminUsername } from '@/lib/auth-helper';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const actor = await getAdminUsername(req);

  try {
    const params = req.nextUrl.searchParams;

    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(params.get('pageSize')) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    const adminFilter = params.get('admin');
    const actionFilter = params.get('action');
    const search = params.get('search')?.trim();
    const from = params.get('from');
    const to = params.get('to');

    const filters: SQL[] = [];

    if (adminFilter && adminFilter !== 'all') {
      filters.push(eq(auditLog.adminUsername, adminFilter));
    }
    if (actionFilter && actionFilter !== 'all') {
      filters.push(eq(auditLog.action, actionFilter));
    }
    if (from) {
      filters.push(gte(auditLog.createdAt, new Date(`${from}T00:00:00`)));
    }
    if (to) {
      filters.push(lte(auditLog.createdAt, new Date(`${to}T23:59:59.999`)));
    }
    if (search) {
      const q = `%${search}%`;
      filters.push(
        or(
          like(auditLog.detail, q),
          like(auditLog.adminUsername, q),
          like(auditLog.action, q),
          like(auditLog.ipAddress, q),
        ) as SQL,
      );
    }

    const sortKey = params.get('sort') ?? 'created';
    const sortDir = params.get('dir') === 'asc' ? 'asc' : 'desc';
    const sortColumn =
      sortKey === 'action'
        ? auditLog.action
        : sortKey === 'admin'
          ? auditLog.adminUsername
          : sortKey === 'ip'
            ? auditLog.ipAddress
            : auditLog.createdAt;
    // Always append the primary key so paging stays stable across ties.
    const orderBy =
      sortDir === 'asc'
        ? [asc(sortColumn), asc(auditLog.id)]
        : [desc(sortColumn), desc(auditLog.id)];

    const where = filters.length ? and(...filters) : undefined;

    const [logs, [{ total }], adminRows, actionRows, [{ destructive }]] = await Promise.all([
      db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: count() }).from(auditLog).where(where),
      // Facets are computed over the whole table, not just the current page,
      // so the filter dropdowns keep offering options that are not on screen.
      db
        .selectDistinct({ value: auditLog.adminUsername })
        .from(auditLog)
        .orderBy(auditLog.adminUsername),
      db.selectDistinct({ value: auditLog.action }).from(auditLog).orderBy(auditLog.action),
      db
        .select({ destructive: count() })
        .from(auditLog)
        .where(where ? and(where, like(auditLog.action, 'delete%')) : like(auditLog.action, 'delete%')),
    ]);

    if (actor) {
      void logAuditForRequest(
        req,
        actor,
        'view_audit_log',
        `Halaman ${page}, filter: admin=${adminFilter ?? 'all'}, action=${actionFilter ?? 'all'}`,
      );
    }

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      destructive,
      facets: {
        admins: adminRows.map((r) => r.value),
        actions: actionRows.map((r) => r.value),
      },
    });
  } catch (error: any) {
    console.error('Audit GET error:', error);
    return NextResponse.json({ error: 'Could not load the audit log' }, { status: 500 });
  }
}