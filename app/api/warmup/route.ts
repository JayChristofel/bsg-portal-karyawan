import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getGatewayConfig, getWarmUpState } from '@/lib/whatsapp';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getGatewayConfig();
    const state = await getWarmUpState(config.sessionId);
    return NextResponse.json({ state });
  } catch (error: unknown) {
    console.error('Warm-up GET error:', error);
    return NextResponse.json({ error: 'Could not load warm-up state' }, { status: 500 });
  }
}