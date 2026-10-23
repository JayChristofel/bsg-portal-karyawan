import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Warm-up quota tests.
 *
 * The library reaches the database through dynamic `import('@/db')` and builds
 * its WHERE clauses with `drizzle-orm`, so the mock discriminates queries by
 * clause shape: the warmup_numbers lookup uses a bare `eq(...)` while the
 * send_counters lookup is the only one wrapped in `and(...)`. Discriminating on
 * clause shape keeps the mock independent of Drizzle table identity, which does
 * not survive module re-instantiation.
 */

let pairedAt = new Date();
let pairedAtOverride: Date | null = null;
let limitOverride: number | null = null;
let storedSent = 0;
let queryResult: { rows: unknown[]; rowCount: number };
// When true the warmup_numbers lookup reports 'not found', which is the path
// that should trigger registration of an unseen number.
let numbersRowMissing = false;
const insertedNumbers: Array<Record<string, unknown>> = [];
const executed: string[] = [];

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ kind: 'eq', a, b }),
  and: (...args: unknown[]) => ({ kind: 'and', args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
  ),
}));

vi.mock('@/db', () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = (clause: unknown) => {
        chain.__clause = clause;
        return chain;
      };
      chain.limit = () => {
        const isCounters = (chain.__clause as { kind?: string } | undefined)?.kind === 'and';
        if (isCounters) return Promise.resolve([{ sent: storedSent }]);
        if (numbersRowMissing) return Promise.resolve([]);
        return Promise.resolve([
          {
            numberId: 'device-1',
            label: null,
            pairedAt: pairedAtOverride ?? pairedAt,
            dailyLimitOverride: limitOverride,
          },
        ]);
      };
      return chain;
    },
    insert: () => {
      const chain: Record<string, unknown> = {};
      chain.values = (v: Record<string, unknown>) => {
        insertedNumbers.push(v);
        if (!pairedAtOverride) pairedAt = new Date();
        return chain;
      };
      chain.onConflictDoNothing = () => chain;
      chain.onConflictDoUpdate = () => chain;
      chain.returning = () =>
        Promise.resolve([
          {
            numberId: 'device-1',
            label: null,
            pairedAt: pairedAtOverride ?? pairedAt,
            dailyLimitOverride: limitOverride,
          },
        ]);
      return chain;
    },
    execute: (q: { strings?: readonly string[] }) => {
      executed.push((q?.strings ?? []).join('?'));
      return Promise.resolve(queryResult);
    },
  },
}));

// Deterministic gateway failure: no DNS/network involved.
let gatewayShouldThrow = false;
vi.mock('@/lib/gateway-tls', async () => {
  const actual = await vi.importActual<typeof import('@/lib/gateway-tls')>('@/lib/gateway-tls');
  return {
    ...actual,
    gatewayFetch: (...args: Parameters<typeof actual.gatewayFetch>) =>
      gatewayShouldThrow ? Promise.reject(new Error('gateway down')) : actual.gatewayFetch(...args),
  };
});

const lib = await import('@/lib/whatsapp');

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

beforeEach(() => {
  pairedAt = new Date();
  pairedAtOverride = null;
  limitOverride = null;
  storedSent = 0;
  queryResult = { rows: [], rowCount: 0 };
  insertedNumbers.length = 0;
  executed.length = 0;
  numbersRowMissing = false;
});

describe('warm-up ladder', () => {
  it('gives a brand-new number the smallest quota', async () => {
    const state = await lib.getWarmUpState('device-1');

    expect(state.ageDays).toBe(0);
    expect(state.dailyLimit).toBe(15);
    expect(state.sentToday).toBe(0);
    expect(state.remainingToday).toBe(15);
  });

  it('raises the quota as the number ages', async () => {
    pairedAtOverride = daysAgo(1);
    expect((await lib.getWarmUpState('device-1')).dailyLimit).toBe(15);

    pairedAtOverride = daysAgo(3);
    expect((await lib.getWarmUpState('device-1')).dailyLimit).toBe(40);

    pairedAtOverride = daysAgo(10);
    expect((await lib.getWarmUpState('device-1')).dailyLimit).toBe(100);

    pairedAtOverride = daysAgo(30);
    expect((await lib.getWarmUpState('device-1')).dailyLimit).toBe(250);
  });

  it('never regresses the quota as the number ages', async () => {
    const limits: number[] = [];
    for (const age of [0, 1, 2, 3, 5, 8, 14, 20, 60]) {
      pairedAtOverride = daysAgo(age);
      limits.push((await lib.getWarmUpState('device-1')).dailyLimit);
    }

    for (let i = 1; i < limits.length; i++) {
      expect(limits[i]).toBeGreaterThanOrEqual(limits[i - 1]);
    }
  });

  it('reports remaining headroom after partial usage', async () => {
    pairedAtOverride = daysAgo(30);
    storedSent = 60;

    const state = await lib.getWarmUpState('device-1');
    expect(state.sentToday).toBe(60);
    expect(state.remainingToday).toBe(190);
  });

  it('clamps remaining headroom at zero when over-limit usage is recorded', async () => {
    limitOverride = 10;
    storedSent = 25;

    const state = await lib.getWarmUpState('device-1');
    expect(state.remainingToday).toBe(0);
  });

  it('honours a manual limit override', async () => {
    limitOverride = 3;
    expect((await lib.getWarmUpState('device-1')).dailyLimit).toBe(3);
  });

  it('registers an unseen number when no row exists yet', async () => {
    numbersRowMissing = true;
    const state = await lib.getWarmUpState('brand-new-number');

    expect(insertedNumbers.map((n) => n.numberId)).toContain('brand-new-number');
    expect(state.dailyLimit).toBe(15);
  });

  it('reports when the quota next steps up', async () => {
    pairedAtOverride = daysAgo(1);
    expect((await lib.getWarmUpState('device-1')).nextLimitIn).toBe(1);

    pairedAtOverride = daysAgo(30);
    expect((await lib.getWarmUpState('device-1')).nextLimitIn).toBeNull();
  });
});

describe('daily limit check', () => {
  it('allows sending while headroom remains', async () => {
    pairedAtOverride = daysAgo(30);
    storedSent = 10;

    const check = await lib.checkDailyLimit('device-1');
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(240);
  });

  it('blocks once the quota is spent', async () => {
    limitOverride = 10;
    storedSent = 10;

    const check = await lib.checkDailyLimit('device-1');
    expect(check.allowed).toBe(false);
    expect(check.remaining).toBe(0);
  });
});

describe('quota guard', () => {
  it('refuses to send when no headroom remains', async () => {
    limitOverride = 5;
    storedSent = 5;

    const result = await lib.sendMessageGuarded('081234567890', 'hello', 'device-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('quota');
      expect(result.state.sentToday).toBe(5);
      expect(result.state.dailyLimit).toBe(5);
    }
  });

  it('does not reach the gateway when the quota is exhausted', async () => {
    limitOverride = 1;
    storedSent = 1;

    // A blocked send must not perform any network call; pointing the gateway at
    // an unroutable host proves it by not throwing a transport error.
    process.env.WHATSAPP_API_URL = 'https://gateway.invalid';
    const result = await lib.sendMessageGuarded('081234567890', 'hello', 'device-1', {
      baseUrl: 'https://gateway.invalid',
      sessionId: 'device-1',
    });

    expect(result.ok).toBe(false);
  });

  it('reports a quota error rather than a generic failure', async () => {
    limitOverride = 2;
    storedSent = 2;

    const result = await lib.sendMessageGuarded('081234567890', 'hello', 'device-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state.remainingToday).toBe(0);
    }
  });

  it('gives the claimed unit back when the gateway call throws', async () => {
    limitOverride = 5;
    storedSent = 0;
    queryResult = { rows: [{ sent: 1 }], rowCount: 1 };
    gatewayShouldThrow = true;

    await expect(
      lib.sendMessageGuarded('081234567890', 'hello', 'device-1', {
        baseUrl: 'https://gateway.invalid',
        sessionId: 'device-1',
      }),
    ).rejects.toThrow('gateway down');
    gatewayShouldThrow = false;

    const claims = executed.filter((q) => q.includes('sent = sent + 1'));
    const refunds = executed.filter((q) => q.includes('sent = sent - 1'));
    expect(claims).toHaveLength(1);
    expect(refunds).toHaveLength(1);
  });
});

describe('phone validation', () => {
  it('normalises Indonesian numbers and rejects junk before claiming quota', async () => {
    expect(lib.normalizeWaPhone('0812-3456-7890')).toBe('6281234567890');
    expect(lib.normalizeWaPhone('+62 812 3456 7890')).toBe('6281234567890');
    expect(lib.normalizeWaPhone('81234567890')).toBe('6281234567890');
    expect(lib.normalizeWaPhone('123456@g.us')).toBeNull();
    expect(lib.normalizeWaPhone('abc')).toBeNull();
    expect(lib.normalizeWaPhone('081')).toBeNull();

    limitOverride = 5;
    queryResult = { rows: [{ sent: 1 }], rowCount: 1 };
    await expect(lib.sendMessageGuarded('not-a-number', 'hi', 'device-1')).rejects.toThrow('Invalid phone');
    expect(executed.filter((q) => q.includes('sent = sent + 1'))).toHaveLength(0);
  });
});
