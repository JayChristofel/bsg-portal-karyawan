import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { drainPendingQueue } from '@/lib/auto-resume-drain';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: without a secret nobody can trigger this
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Scheduled drain of the auto-resume queue (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`). Each call sends what fits in one
 * invocation and exits; the schedule provides the repetition.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await drainPendingQueue({ requireConnected: true });
  return NextResponse.json({ ok: true });
}
