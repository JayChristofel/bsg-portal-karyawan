import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Warmer tick tests. The library reaches the database through `@/db` and
 * drizzle-orm's query builders, so both are mocked: the mock records what
 * `.update(...).set(...)` was called with rather than running real SQL.
 */

let currentHour = 10; // inside the default 8-21 active window
let sendResult: { ok: true; result: unknown } | { ok: false; reason: 'quota'; state: unknown } = {
  ok: true,
  result: { messageId: 'm-1' },
};
let sessionBReady = true;
const updates: Array<Record<string, unknown>> = [];

const BASE_PAIR = {
  id: 1,
  sessionA: 'num-a',
  sessionB: 'num-b',
  intervalMinMinutes: 30,
  intervalMaxMinutes: 180,
  activeHourStart: 8,
  activeHourEnd: 21,
  enabled: true,
  nextTurn: 'a' as const,
  lastMessageAt: null,
  nextDueAt: new Date(Date.now() - 1000), // already due
  messagesSent: 0,
  lastError: null,
};

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ kind: 'eq', a, b }),
  and: (...args: unknown[]) => ({ kind: 'and', args }),
  lte: (a: unknown, b: unknown) => ({ kind: 'lte', a, b }),
}));

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ ...BASE_PAIR }]),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Promise.resolve([]) };
      },
    }),
  },
}));

vi.mock('@/db/schema', () => ({ warmerPairs: {} }));

vi.mock('@/lib/time', () => ({
  hourInAppTz: () => currentHour,
}));

vi.mock('@/lib/audit', () => ({
  logAudit: () => Promise.resolve(),
}));

vi.mock('@/lib/whatsapp', () => ({
  getGatewayConfig: () => Promise.resolve({ baseUrl: 'https://gateway.example', sessionId: 'unused', apiKey: 'k' }),
  getSessionStatus: (cfg: { sessionId: string }) =>
    Promise.resolve(
      cfg.sessionId === 'num-b' && !sessionBReady
        ? { status: 'disconnected', phone: null }
        : { status: 'ready', phone: '628123456789' },
    ),
  sendMessageGuarded: () => Promise.resolve(sendResult),
}));

const { runWarmerTick } = await import('@/lib/warmer');

beforeEach(() => {
  updates.length = 0;
  currentHour = 10;
  sendResult = { ok: true, result: { messageId: 'm-1' } };
  sessionBReady = true;
});

describe('runWarmerTick', () => {
  it('sends from A to B, flips the turn, and schedules a future retry', async () => {
    const { ran } = await runWarmerTick();
    expect(ran).toBe(1);
    expect(updates).toHaveLength(1);
    const update = updates[0];
    expect(update.nextTurn).toBe('b');
    expect(update.messagesSent).toBe(1);
    expect(update.lastError).toBeNull();
    expect((update.nextDueAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('does not flip the turn when the daily quota is exhausted', async () => {
    sendResult = { ok: false, reason: 'quota', state: {} };
    await runWarmerTick();
    expect(updates).toHaveLength(1);
    expect(updates[0].nextTurn).toBeUndefined(); // turn is left as-is, not written
    expect(updates[0].lastError).toMatch(/kuota/i);
  });

  it('backs off with an error when the receiving session is not connected', async () => {
    sessionBReady = false;
    await runWarmerTick();
    expect(updates).toHaveLength(1);
    expect(updates[0].lastError).toMatch(/not connected/i);
  });

  it('skips a pair outside its active-hour window without touching the row', async () => {
    currentHour = 23; // outside 8-21
    const { ran } = await runWarmerTick();
    expect(ran).toBe(1); // still counted as "due" by the query, just a no-op tick
    expect(updates).toHaveLength(0);
  });
});
