import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { autoResumeRuns } from '@/db/schema';
import { desc, } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';
import { requestAutoResumeCancel } from '@/lib/auto-resume-control';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const runs = await db
      .select()
      .from(autoResumeRuns)
      .orderBy(desc(autoResumeRuns.startedAt))
      .limit(10);

    // A run left in "running"/"stopping" by a worker that died has a stale
    // heartbeat; flag it so the UI says "stale" instead of claiming it is sending.
    const STALE_MS = 5 * 60_000;
    const withStale = runs.map((r) => ({
      ...r,
      stale:
        (r.status === 'running' || r.status === 'stopping') &&
        !r.finishedAt &&
        Date.now() - new Date(r.lastHeartbeatAt).getTime() > STALE_MS,
    }));

    return NextResponse.json({ latest: withStale[0] ?? null, history: withStale });
  } catch (error: unknown) {
    console.error('Auto-resume GET error:', error);
    return NextResponse.json({ error: 'Could not load auto-resume status' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const action = (req.nextUrl.searchParams.get('action') || '').trim();

    if (action !== 'stop') {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    // The stop request is stored on the run row, so it reaches whichever
    // instance is draining.
    const stopped = await requestAutoResumeCancel();

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'stop_auto_resume',
      'Operator meminta auto-resume berhenti',
    );

    return NextResponse.json({
      success: stopped > 0,
      message: stopped > 0 ? 'Auto-resume akan berhenti.' : 'Tidak ada auto-resume yang sedang berjalan.',
    });
  } catch (error: unknown) {
    console.error('Auto-resume POST error:', error);
    return NextResponse.json({ error: 'Could not stop auto-resume' }, { status: 500 });
  }
}