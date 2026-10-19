import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let counts: Record<string, number> = {};
let dbDown = false;
const executed: string[] = [];

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
  ),
}));

vi.mock('@/db', () => ({
  db: {
    execute: (q: { strings?: readonly string[]; values?: unknown[] }) => {
      if (dbDown) return Promise.reject(new Error('db down'));
      const text = (q.strings ?? []).join('?');
      executed.push(text);
      if (text.includes('INSERT INTO rate_limits')) {
        const key = String(q.values?.[0]);
        counts[key] = (counts[key] ?? 0) + 1;
        return Promise.resolve([{ count: counts[key] }]);
      }
      if (text.includes('DELETE FROM rate_limits WHERE key')) {
        delete counts[String(q.values?.[0])];
      }
      return Promise.resolve([]);
    },
  },
}));

const proxy = await import('@/lib/proxy');

const req = (headers: Record<string, string>) => new Request('http://x/', { headers });

beforeEach(() => {
  counts = {};
  dbDown = false;
  executed.length = 0;
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe('getClientIp', () => {
  it('returns the unknown sentinel when no proxy is trusted', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUST_PROXY_HEADERS', '');
    expect(proxy.getClientIp(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe('0.0.0.0');
  });

  it('on Vercel prefers Vercel headers and ignores a forged cf-connecting-ip', () => {
    vi.stubEnv('VERCEL', '1');
    const ip = proxy.getClientIp(
      req({ 'cf-connecting-ip': '6.6.6.6', 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '9.9.9.9' }),
    );
    expect(ip).toBe('203.0.113.7');
    expect(proxy.getClientIp(req({ 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('off Vercel with TRUST_PROXY_HEADERS honours cf-connecting-ip first', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUST_PROXY_HEADERS', '1');
    expect(proxy.getClientIp(req({ 'cf-connecting-ip': '198.51.100.2', 'x-forwarded-for': '9.9.9.9' }))).toBe('198.51.100.2');
  });

  it('rejects malformed addresses (header injection attempts)', () => {
    vi.stubEnv('VERCEL', '1');
    expect(proxy.getClientIp(req({ 'x-real-ip': '1.2.3.4; DROP TABLE' }))).toBe('0.0.0.0');
  });

  it('takes the rightmost x-forwarded-for entry', () => {
    vi.stubEnv('VERCEL', '1');
    expect(proxy.getClientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('2.2.2.2');
  });
});

describe('checkRateLimit', () => {
  it('allows up to the max, then limits', async () => {
    for (let i = 1; i <= 3; i++) {
      expect((await proxy.checkRateLimit('k', 60, 3)).limited).toBe(false);
    }
    const over = await proxy.checkRateLimit('k', 60, 3);
    expect(over).toEqual({ limited: true, remaining: 0 });
  });

  it('keeps buckets independent per key', async () => {
    await proxy.checkRateLimit('a', 60, 1);
    expect((await proxy.checkRateLimit('a', 60, 1)).limited).toBe(true);
    expect((await proxy.checkRateLimit('b', 60, 1)).limited).toBe(false);
  });

  it('fails open when the database is unreachable', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbDown = true;
    expect((await proxy.checkRateLimit('k', 60, 1)).limited).toBe(false);
    spy.mockRestore();
  });
});

describe('checkIpRateLimit', () => {
  it('gives the shared unknown-IP bucket a much higher ceiling', async () => {
    for (let i = 0; i < 5; i++) await proxy.checkIpRateLimit('login', '0.0.0.0', 300, 5);
    expect((await proxy.checkIpRateLimit('login', '0.0.0.0', 300, 5)).limited).toBe(false);
    for (let i = 0; i < 5; i++) await proxy.checkIpRateLimit('login', '1.2.3.4', 300, 5);
    expect((await proxy.checkIpRateLimit('login', '1.2.3.4', 300, 5)).limited).toBe(true);
  });
});

describe('recordAuthFailure', () => {
  it('is free for 5 failures, then backs off exponentially up to the cap', async () => {
    const delays: number[] = [];
    for (let i = 0; i < 12; i++) delays.push(await proxy.recordAuthFailure('acct'));
    expect(delays.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(delays[5]).toBe(1000);
    expect(delays[6]).toBe(2000);
    expect(delays[7]).toBe(4000);
    expect(Math.max(...delays)).toBe(15000);
  });

  it('is not erased by an unrelated limiter using a short window', async () => {
    for (let i = 0; i < 6; i++) await proxy.recordAuthFailure('acct2');
    await proxy.checkRateLimit('submit:1.1.1.1', 60, 5);
    expect(await proxy.recordAuthFailure('acct2')).toBe(2000);
  });
});
