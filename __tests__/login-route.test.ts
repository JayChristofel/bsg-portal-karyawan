// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

let adminRow: { username: string; passwordHash: string } | undefined;
let limited = false;
const failures: string[] = [];
const resets: string[] = [];

vi.mock('@/db', () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.limit = () => Promise.resolve(adminRow ? [adminRow] : []);
      return chain;
    },
  },
}));
vi.mock('@/db/schema', () => ({ admins: { username: 'username' } }));
vi.mock('drizzle-orm', () => ({ eq: (a: unknown, b: unknown) => ({ a, b }) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/proxy', () => ({
  getClientIp: () => '203.0.113.9',
  isUnknownIp: () => false,
  checkIpRateLimit: async () => ({ limited, remaining: 0 }),
  recordAuthFailure: async (key: string) => {
    failures.push(key);
    return 0;
  },
  resetRateLimit: async (key: string) => {
    resets.push(key);
  },
}));

let hash: string;
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.JWT_SECRET = 'j'.repeat(48);
  const auth = await import('@/lib/auth');
  hash = await auth.hashPassword('correct horse battery');
  ({ POST } = await import('@/app/api/auth/login/route'));
});

beforeEach(() => {
  adminRow = { username: 'admin', passwordHash: hash };
  limited = false;
  failures.length = 0;
  resets.length = 0;
});

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

describe('POST /api/auth/login', () => {
  it('logs in with the right credentials and sets an httpOnly session cookie', async () => {
    const res = await call({ username: 'admin', password: 'correct horse battery' });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/httponly/i);
    expect(cookie).toMatch(/samesite=lax/i);
    expect(resets).toContain('auth_fail_user:admin');
  });

  it('rejects a wrong password with 401 and records the failure', async () => {
    const res = await call({ username: 'admin', password: 'nope-nope-nope' });
    expect(res.status).toBe(401);
    expect(failures).toEqual(['auth_fail_user:admin']);
  });

  it('answers an unknown user exactly like a wrong password', async () => {
    adminRow = undefined;
    const res = await call({ username: 'ghost', password: 'whatever-password' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'Username atau password salah.' });
    expect(failures).toEqual(['auth_fail_user:ghost']);
  });

  it.each([
    ['null body', 'null'],
    ['invalid json', '{nope'],
    ['numeric fields', { username: 5, password: 6 }],
    ['object password', { username: 'admin', password: { $ne: '' } }],
    ['missing password', { username: 'admin' }],
  ])('returns 400, not 500, for %s', async (_name, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
  });

  it('refuses absurdly long input before hashing or storing it', async () => {
    const res = await call({ username: 'a'.repeat(500), password: 'x'.repeat(100_000) });
    expect(res.status).toBe(401);
    expect(failures).toHaveLength(0);
  });

  it('returns 429 when the IP is rate limited, without checking credentials', async () => {
    limited = true;
    const res = await call({ username: 'admin', password: 'correct horse battery' });
    expect(res.status).toBe(429);
    expect(resets).toHaveLength(0);
  });
});
