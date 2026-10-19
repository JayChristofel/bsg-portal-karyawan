// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const drain = vi.fn(async () => {});
vi.mock('@/lib/auto-resume-drain', () => ({ drainPendingQueue: drain }));

const call = async (auth?: string) => {
  const { GET } = await import('@/app/api/cron/auto-resume/route');
  const { NextRequest } = await import('next/server');
  return GET(new NextRequest('http://x/api/cron/auto-resume', { headers: auth ? { authorization: auth } : {} }));
};

describe('cron auto-resume route', () => {
  beforeEach(() => {
    drain.mockClear();
    process.env.CRON_SECRET = 's3cret-value';
  });

  it('rejects missing or wrong bearer', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    expect(drain).not.toHaveBeenCalled();
  });

  it('fails closed when no secret is configured', async () => {
    delete process.env.CRON_SECRET;
    expect((await call('Bearer ')).status).toBe(401);
    expect((await call('Bearer undefined')).status).toBe(401);
  });

  it('drains with the connection check on when authorized', async () => {
    expect((await call('Bearer s3cret-value')).status).toBe(200);
    expect(drain).toHaveBeenCalledWith({ requireConnected: true });
  });
});
