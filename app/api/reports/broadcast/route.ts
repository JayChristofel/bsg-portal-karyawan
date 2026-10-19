import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { campaigns, recipients, recipientStatusHistory } from '@/db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditThrottled } from '@/lib/audit';
import { parseDateOnly, parseId } from '@/lib/validate';
import { startOfDayAppTz, endOfDayAppTz, APP_TZ } from '@/lib/time';

// A literal, not a bound parameter: Postgres treats `$1` in SELECT and `$2` in GROUP BY
// as different expressions and rejects the query. APP_TZ is a constant, so this is safe.
const TZ_LITERAL = sql.raw(`'${APP_TZ}'`);

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const campaignParam = searchParams.get('campaignId');

  const fromDay = fromParam ? parseDateOnly(fromParam) : null;
  const toDay = toParam ? parseDateOnly(toParam) : null;
  const campaignId = campaignParam ? parseId(campaignParam) : null;
  if ((fromParam && !fromDay) || (toParam && !toDay) || (campaignParam && campaignId === null)) {
    return NextResponse.json({ error: 'Invalid from/to (YYYY-MM-DD) or campaignId.' }, { status: 400 });
  }
  // Day boundaries are WITA days, matching how the dates are shown to the admin.
  const from = fromDay ? startOfDayAppTz(fromDay) : null;
  const to = toDay ? endOfDayAppTz(toDay) : null;

  try {
    const campaignConds = [];
    if (from) campaignConds.push(gte(campaigns.createdAt, from));
    if (to) campaignConds.push(lte(campaigns.createdAt, to));
    if (campaignId) campaignConds.push(eq(campaigns.id, campaignId));
    const campaignWhere = campaignConds.length ? and(...campaignConds) : undefined;

    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        createdBy: campaigns.createdBy,
        createdAt: campaigns.createdAt,
        scheduledAt: campaigns.scheduledAt,
        sentAt: campaigns.sentAt,
        totalRecipients: sql<number>`COUNT(${recipients.id})`,
        pending: sql<number>`COUNT(${recipients.id}) FILTER (WHERE ${recipients.waStatus} IS NULL OR ${recipients.waStatus} IN ('pending','sending'))`,
        failed: sql<number>`COUNT(${recipients.id}) FILTER (WHERE ${recipients.waStatus} = 'failed')`,
        sent: sql<number>`COUNT(${recipients.id}) FILTER (WHERE ${recipients.waStatus} = 'sent')`,
        delivered: sql<number>`COUNT(${recipients.id}) FILTER (WHERE ${recipients.waStatus} = 'delivered')`,
        read: sql<number>`COUNT(${recipients.id}) FILTER (WHERE ${recipients.waStatus} = 'read')`,
        submitted: sql<number>`COUNT(${recipients.id}) FILTER (WHERE EXISTS(SELECT 1 FROM pegawai p WHERE lower(trim(p.name)) = lower(trim(${recipients.label}))))`,
      })
      .from(campaigns)
      .leftJoin(recipients, eq(recipients.campaignId, campaigns.id))
      .where(campaignWhere)
      .groupBy(campaigns.id)
      .orderBy(campaigns.createdAt);

    const timelineConds = [];
    if (from) timelineConds.push(gte(recipientStatusHistory.createdAt, from));
    if (to) timelineConds.push(lte(recipientStatusHistory.createdAt, to));
    if (campaignId) timelineConds.push(eq(recipients.campaignId, campaignId));
    const timelineWhere = timelineConds.length ? and(...timelineConds) : undefined;

    const historyRows = await db
      .select({
        day: sql<string>`to_char(${recipientStatusHistory.createdAt} AT TIME ZONE ${TZ_LITERAL}, 'YYYY-MM-DD')`,
        status: recipientStatusHistory.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(recipientStatusHistory)
      .innerJoin(recipients, eq(recipients.id, recipientStatusHistory.recipientId))
      .where(timelineWhere)
      .groupBy(sql`to_char(${recipientStatusHistory.createdAt} AT TIME ZONE ${TZ_LITERAL}, 'YYYY-MM-DD')`, recipientStatusHistory.status);

    const createdRows = await db
      .select({
        day: sql<string>`to_char(${recipients.createdAt} AT TIME ZONE ${TZ_LITERAL}, 'YYYY-MM-DD')`,
        count: sql<number>`COUNT(*)`,
      })
      .from(recipients)
      .where(and(
        ...(from ? [gte(recipients.createdAt, from)] : []),
        ...(to ? [lte(recipients.createdAt, to)] : []),
        ...(campaignId ? [eq(recipients.campaignId, campaignId)] : []),
      ))
      .groupBy(sql`to_char(${recipients.createdAt} AT TIME ZONE ${TZ_LITERAL}, 'YYYY-MM-DD')`);

    const days = new Map<string, { date: string; created: number; sent: number; delivered: number; read: number }>();
    const ensure = (day: string) => {
      let entry = days.get(day);
      if (!entry) {
        entry = { date: day, created: 0, sent: 0, delivered: 0, read: 0 };
        days.set(day, entry);
      }
      return entry;
    };

    for (const r of historyRows) {
      if (r.status === 'sent') ensure(r.day).sent = Number(r.count);
      else if (r.status === 'delivered') ensure(r.day).delivered = Number(r.count);
      else if (r.status === 'read') ensure(r.day).read = Number(r.count);
    }
    for (const r of createdRows) ensure(r.day).created = Number(r.count);

    const timeline = Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));

    const actor = await getAdminUsername(req);
    if (actor) {
      await logAuditThrottled(
        req,
        actor,
        'view_report',
        `Melihat laporan broadcast (${rows.length} kampanye)`,
      );
    }

    return NextResponse.json({
      summary: {
        totalCampaigns: rows.length,
        totalRecipients: rows.reduce((s, r) => s + Number(r.totalRecipients), 0),
        pending: rows.reduce((s, r) => s + Number(r.pending), 0),
        failed: rows.reduce((s, r) => s + Number(r.failed), 0),
        sent: rows.reduce((s, r) => s + Number(r.sent), 0),
        delivered: rows.reduce((s, r) => s + Number(r.delivered), 0),
        read: rows.reduce((s, r) => s + Number(r.read), 0),
        submitted: rows.reduce((s, r) => s + Number(r.submitted), 0),
      },
      campaigns: rows.map((r) => ({
        ...r,
        totalRecipients: Number(r.totalRecipients),
        pending: Number(r.pending),
        failed: Number(r.failed),
        sent: Number(r.sent),
        delivered: Number(r.delivered),
        read: Number(r.read),
        submitted: Number(r.submitted),
      })),
      timeline,
    });
  } catch (error: unknown) {
    console.error('Report broadcast error:', error);
    return NextResponse.json({ error: 'Could not load the broadcast report' }, { status: 500 });
  }
}
