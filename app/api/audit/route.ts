import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { and, asc, count, desc, eq, gte, lte, like, ilike, or, type SQL } from 'drizzle-orm';
import { logAuditThrottled } from '@/lib/audit';
import { parseDateOnly } from '@/lib/validate';
import { startOfDayAppTz, endOfDayAppTz } from '@/lib/time';
import { getAdminUsername } from '@/lib/auth-helper';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE = 100_000;

// DISTINCT over the whole table on every request is the dominant cost of this
// endpoint; the dropdown options change rarely, so keep them for a short while.
const FACET_TTL_MS = 60_000;
let facetCache: { at: number; admins: string[]; actions: string[] } | null = null;

/** Escapes LIKE wildcards so a search for "100%" or "a_b" matches literally. */
const escapeLike = (v: string) => v.replace(/[\\%_]/g, '\\$&');

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const actor = await getAdminUsername(req);

  try {
    const params = req.nextUrl.searchParams;

    const page = Math.min(MAX_PAGE, Math.max(1, Math.trunc(Number(params.get('page'))) || 1));
    const pageSize = Math.min(
      Math.max(1, Math.trunc(Number(params.get('pageSize'))) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    const adminFilter = params.get('admin');
    const actionFilter = params.get('action');
    const search = params.get('search')?.trim();
    const rawFrom = params.get('from');
    const rawTo = params.get('to');
    const from = rawFrom ? parseDateOnly(rawFrom) : null;
    const to = rawTo ? parseDateOnly(rawTo) : null;
    if ((rawFrom && !from) || (rawTo && !to)) {
      return NextResponse.json({ error: 'from/to must be a valid date (YYYY-MM-DD).' }, { status: 400 });
    }

    const filters: SQL[] = [];

    if (adminFilter && adminFilter !== 'all') {
      filters.push(eq(auditLog.adminUsername, adminFilter));
    }
    if (actionFilter && actionFilter !== 'all') {
      filters.push(eq(auditLog.action, actionFilter));
    }
    if (from) {
      filters.push(gte(auditLog.createdAt, startOfDayAppTz(from)));
    }
    if (to) {
      filters.push(lte(auditLog.createdAt, endOfDayAppTz(to)));
    }
    if (search) {
      const q = `%${escapeLike(search.slice(0, 100))}%`;
      filters.push(
        or(
          ilike(auditLog.detail, q),
          ilike(auditLog.adminUsername, q),
          ilike(auditLog.action, q),
          ilike(auditLog.ipAddress, q),
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

    const facetsFresh = facetCache !== null && Date.now() - facetCache.at < FACET_TTL_MS;

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
      facetsFresh
        ? Promise.resolve([] as Array<{ value: string }>)
        : db.selectDistinct({ value: auditLog.adminUsername }).from(auditLog).orderBy(auditLog.adminUsername),
      facetsFresh
        ? Promise.resolve([] as Array<{ value: string }>)
        : db.selectDistinct({ value: auditLog.action }).from(auditLog).orderBy(auditLog.action),
      db
        .select({ destructive: count() })
        .from(auditLog)
        .where(where ? and(where, like(auditLog.action, 'delete%')) : like(auditLog.action, 'delete%')),
    ]);

    if (!facetsFresh) {
      facetCache = {
        at: Date.now(),
        admins: adminRows.map((r) => r.value),
        actions: actionRows.map((r) => r.value),
      };
    }
    const facets = facetCache as NonNullable<typeof facetCache>;

    // Viewing the audit log must not itself flood the audit log.
    if (actor) {
      await logAuditThrottled(req, actor, 'view_audit_log', 'Membuka log audit');
    }

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      destructive,
      facets: { admins: facets.admins, actions: facets.actions },
    });
  } catch (error: any) {
    console.error('Audit GET error:', error);
    return NextResponse.json({ error: 'Could not load the audit log' }, { status: 500 });
  }
}