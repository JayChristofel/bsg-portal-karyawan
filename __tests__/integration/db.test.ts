// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Concurrency tests against a REAL Postgres. The unit tests mock the database, which
 * cannot show whether "atomic" claims really are: that is decided by the SQL.
 *
 * Skipped unless TEST_DATABASE_URL points at a database that already has the
 * migrations in drizzle/ applied. Never point it at real data -- it truncates tables.
 *
 *   TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/portal_test npm test
 */
const URL = process.env.TEST_DATABASE_URL;
const run = URL ? describe : describe.skip;

// The gateway is the only thing faked: every send "succeeds" instantly.
vi.mock('@/lib/gateway-tls', async () => {
  const actual = await vi.importActual<typeof import('@/lib/gateway-tls')>('@/lib/gateway-tls');
  return {
    ...actual,
    gatewayFetch: async (url: string) => {
      // Session-name lookup: report it as already existing so no create call is needed.
      if (url.includes('/sessions?name=')) {
        return new Response(JSON.stringify([{ id: 'it-session-uuid', name: 'dev-it', status: 'ready' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ messageId: 'm-1', timestamp: Date.now() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
});

let db: typeof import('@/db').db;
let sql: typeof import('drizzle-orm').sql;

beforeAll(async () => {
  if (!URL) return;
  process.env.DATABASE_URL = URL;
  process.env.ENCRYPTION_KEY = 'e'.repeat(40);
  process.env.WHATSAPP_GATEWAY_ALLOWED_HOSTS = '';
  ({ db } = await import('@/db'));
  ({ sql } = await import('drizzle-orm'));
});

afterAll(async () => {
  if (db) await db.execute(sql`SELECT 1`); // let in-flight statements settle
});

beforeEach(async () => {
  if (!URL) return;
  await db.execute(
    sql`TRUNCATE send_counters, warmup_numbers, recipients, rate_limits, auto_resume_runs, webhook_logs RESTART IDENTITY`,
  );
});

const GATEWAY = { baseUrl: 'https://gateway.example', sessionId: 'dev-it', apiKey: 'k' };

run('warm-up quota under concurrency', () => {
  it('never lets more sends through than the daily limit', async () => {
    const { sendMessageGuarded } = await import('@/lib/whatsapp');
    await db.execute(
      sql`INSERT INTO warmup_numbers (number_id, daily_limit_override) VALUES ('dev-it', 5)`,
    );

    const results = await Promise.all(
      Array.from({ length: 40 }, () => sendMessageGuarded('081234567890', 'hi', 'dev-it', GATEWAY)),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok)).toHaveLength(35);

    const rows = (await db.execute(sql`SELECT sent FROM send_counters WHERE number_id = 'dev-it'`)) as unknown as Array<{ sent: number }>;
    expect(rows).toHaveLength(1); // one row per (number, day): the primary key holds
    expect(rows[0].sent).toBe(5);
  });
});

run('recipient claiming', () => {
  it('lets exactly one of many concurrent senders take a pending recipient', async () => {
    const { claimRecipient } = await import('@/lib/recipient-queue');
    await db.execute(sql`INSERT INTO recipients (label, phone, wa_status) VALUES ('A', '081234567890', 'pending')`);

    const claims = await Promise.all(Array.from({ length: 25 }, () => claimRecipient(1)));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('does not hand out a recipient that is already sent or in flight', async () => {
    const { claimRecipient } = await import('@/lib/recipient-queue');
    await db.execute(sql`
      INSERT INTO recipients (label, phone, wa_status) VALUES
        ('sent', '1', 'sent'), ('sending', '2', 'sending'), ('read', '3', 'read')`);
    expect(await claimRecipient(1)).toBe(false);
    expect(await claimRecipient(2)).toBe(false);
    expect(await claimRecipient(3)).toBe(false);
    expect(await claimRecipient(1, ['pending', 'failed'])).toBe(false);
  });

  it('allows an explicit retry of a failed recipient only when asked', async () => {
    const { claimRecipient } = await import('@/lib/recipient-queue');
    await db.execute(sql`INSERT INTO recipients (label, phone, wa_status) VALUES ('F', '1', 'failed')`);
    expect(await claimRecipient(1)).toBe(false);
    expect(await claimRecipient(1, ['pending', 'failed'])).toBe(true);
  });

  it('replays a receipt that arrived before the message id was stored', async () => {
    const { claimRecipient, markRecipientSent } = await import('@/lib/recipient-queue');
    await db.execute(sql`INSERT INTO recipients (label, phone, wa_status) VALUES ('E', '1', 'pending')`);
    await db.execute(sql`INSERT INTO webhook_logs (event, payload) VALUES
      ('message.ack', ${JSON.stringify({ event: 'message.ack', payload: { ids: ['early-1'], receipt_type: 'delivered' } })}),
      ('message.ack', ${JSON.stringify({ event: 'message.ack', payload: { ids: ['early-1'], receipt_type: 'read' } })}),
      ('message.ack', ${JSON.stringify({ event: 'message.ack', payload: { ids: ['other'], receipt_type: 'read' } })})`);
    await claimRecipient(1);
    await markRecipientSent(1, 'early-1');
    const rows = (await db.execute(sql`SELECT wa_status FROM recipients WHERE id = 1`)) as unknown as { wa_status: string }[];
    expect(rows[0].wa_status).toBe('read');
  });
});

run('rate limiter', () => {
  it('counts concurrent hits exactly: only `max` pass', async () => {
    const { checkRateLimit } = await import('@/lib/proxy');
    const out = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit('it:k', 60, 3)));
    expect(out.filter((o) => !o.limited)).toHaveLength(3);
  });

  it('opens a fresh window once the old one has expired', async () => {
    const { checkRateLimit } = await import('@/lib/proxy');
    await checkRateLimit('it:w', 60, 1);
    expect((await checkRateLimit('it:w', 60, 1)).limited).toBe(true);
    await db.execute(sql`UPDATE rate_limits SET window_start = NOW() - INTERVAL '2 minutes' WHERE key = 'it:w'`);
    expect((await checkRateLimit('it:w', 60, 1)).limited).toBe(false);
  });
});

run('auto-resume single flight', () => {
  it('starts exactly one run when many try at once', async () => {
    const { tryStartRun } = await import('@/lib/auto-resume-control');
    const ids = await Promise.all(Array.from({ length: 10 }, () => tryStartRun(5)));
    expect(ids.filter((id) => id !== null)).toHaveLength(1);
  });

  it('ignores a run whose worker died (stale heartbeat) and cancel reaches the live one', async () => {
    const { tryStartRun, requestAutoResumeCancel, isCancelRequested } = await import('@/lib/auto-resume-control');
    const first = await tryStartRun(1);
    expect(first).not.toBeNull();
    expect(await tryStartRun(1)).toBeNull(); // blocked by the live run

    expect(await requestAutoResumeCancel()).toBe(1);
    expect(await isCancelRequested(first!)).toBe(true);

    await db.execute(sql`UPDATE auto_resume_runs SET last_heartbeat_at = NOW() - INTERVAL '10 minutes'`);
    expect(await tryStartRun(1)).not.toBeNull(); // dead run no longer blocks
  });
});
