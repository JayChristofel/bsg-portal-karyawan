import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runWarmerTick } from '@/lib/warmer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: without a secret nobody can trigger this
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Scheduled warmer tick (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Sends at most one message per due pair and exits; the schedule provides the
 * repetition. Run this every 5-15 minutes — each pair's own random interval
 * (tens of minutes to hours) decides how often it actually sends.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runWarmerTick();
  return NextResponse.json({ ok: true, ...result });
}
