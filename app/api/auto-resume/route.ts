import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { autoResumeRuns } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

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

    const latest = runs[0] ?? null;

    return NextResponse.json({
      // A run left in "running" by a process that died is surfaced separately
      // so the UI can say "stale" instead of claiming it is still sending.
      latest,
      history: runs,
    });
  } catch (error: any) {
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

    // Imported lazily so the flag lives in the module instance that owns the loop.
    const { requestAutoResumeCancel } = await import('@/lib/auto-resume-control');
    requestAutoResumeCancel();

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'stop_auto_resume',
      'Operator meminta auto-resume berhenti',
    );

    return NextResponse.json({ success: true, message: 'Auto-resume akan berhenti.' });
  } catch (error: any) {
    console.error('Auto-resume POST error:', error);
    return NextResponse.json({ error: 'Could not stop auto-resume' }, { status: 500 });
  }
}