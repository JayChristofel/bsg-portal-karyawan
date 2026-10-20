// @vitest-environment node
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Stress test + success benchmark against a REAL Postgres. Each scenario states its pass
 * criteria as assertions, so a green run means the thresholds below were met.
 *
 * Skipped unless TEST_DATABASE_URL is set. It TRUNCATES tables: never point it at real data.
 *
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/portal_test npm run bench
 *   STRESS_SCALE=5 ...   # 5x the volume
 *
 * Numbers come from a local database with an instant fake gateway, so they show how the
 * code and SQL behave under contention, not what Supabase + Vercel + the real gateway
 * will deliver. Compare runs against each other rather than against production.
 */
const URL = process.env.TEST_DATABASE_URL;
const run = URL ? describe : describe.skip;
const SCALE = Math.max(1, Number(process.env.STRESS_SCALE) || 1);

// Pass criteria.
const READ_P95_MS = 1500;
const FULL_WALK_MS = 20_000;
const MIN_SEND_PER_SEC = 50;

const sentToGateway = new Map<string, number>();
let messageSeq = 0;

vi.mock('@/lib/gowa-tls', async () => {
  const actual = await vi.importActual<typeof import('@/lib/gowa-tls')>('@/lib/gowa-tls');
  return {
    ...actual,
    gatewayFetch: async (_url: string, init: RequestInit = {}) => {
      const phone = (JSON.parse(String(init.body ?? '{}')) as { phone?: string }).phone ?? '?';
      sentToGateway.set(phone, (sentToGateway.get(phone) ?? 0) + 1);
      // A little latency so workers genuinely interleave instead of finishing in one tick.
      await new Promise((r) => setTimeout(r, 2));
      return new Response(
        JSON.stringify({ code: 'SUCCESS', results: { message_id: `m-${++messageSeq}` } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  };
});

let db: typeof import('@/db').db;
let sql: typeof import('drizzle-orm').sql;
let cookie = '';
const report: Array<Record<string, string | number>> = [];

const rowsOf = <T>(r: unknown) => r as unknown as T[];
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};
const pool = async <T>(n: number, workers: number, fn: (i: number) => Promise<T>) => {
  const out: T[] = new Array(n);
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let i = next++; i < n; i = next++) out[i] = await fn(i);
    }),
  );
  return out;
};
const authed = (path: string) =>
  new NextRequest(`http://localhost${path}`, { headers: { cookie } });

beforeAll(async () => {
  if (!URL) return;
  process.env.DATABASE_URL = URL;
  process.env.ENCRYPTION_KEY = 's'.repeat(40);
  process.env.JWT_SECRET = 'j'.repeat(48);
  process.env.WHATSAPP_API_URL = 'https://gateway.example';
  process.env.WHATSAPP_DEVICE_ID = 'dev-stress';
  process.env.WHATSAPP_WEBHOOK_SECRET = 'w'.repeat(32);
  process.env.TRUST_PROXY_HEADERS = '1';
  process.env.GOWA_ALLOWED_HOSTS = '';
  ({ db } = await import('@/db'));
  ({ sql } = await import('drizzle-orm'));
  const { createSessionToken, COOKIE_NAME } = await import('@/lib/auth');
  cookie = `${COOKIE_NAME}=${await createSessionToken('tester')}`;
  await db.execute(sql`
    TRUNCATE pegawai, recipients, campaigns, recipient_status_history, audit_log, admins,
             rate_limits, send_counters, warmup_numbers, webhook_logs, settings RESTART IDENTITY`);
  await db.execute(sql`INSERT INTO admins (username, password_hash) VALUES ('tester', 'x$y')`);
});

afterAll(() => {
  if (report.length) console.table(report);
});

const N = 2000 * SCALE;
const LIMIT = 1500 * SCALE;

run('1. mass send: many workers, one number, capped quota', () => {
  it(`sends ${N} recipients with 25 workers: no duplicates, quota exact, nothing stuck`, async () => {
    const { sendMessageGuarded } = await import('@/lib/whatsapp');
    const q = await import('@/lib/recipient-queue');
    await db.execute(sql`INSERT INTO warmup_numbers (number_id, daily_limit_override) VALUES ('dev-stress', ${LIMIT})`);
    await db.execute(sql`
      INSERT INTO recipients (label, phone, wa_status)
      SELECT 'R' || g, '0812' || lpad(g::text, 8, '0'), 'pending' FROM generate_series(1, ${N}) g`);

    const cfg = { baseUrl: 'https://gateway.example', deviceId: 'dev-stress', username: 'u', password: 'p' };
    const t0 = performance.now();
    const outcome = { sent: 0, quota: 0, failed: 0 };
    await pool(N, 25, async (i) => {
      const id = i + 1;
      if (!(await q.claimRecipient(id))) return;
      try {
        const res = await sendMessageGuarded(`0812${String(id).padStart(8, '0')}`, 'hi', 'dev-stress', cfg);
        if (res.ok) {
          await q.markRecipientSent(id, q.parseSendResult(res.result).messageId);
          outcome.sent++;
        } else {
          await q.releaseRecipient(id);
          outcome.quota++;
        }
      } catch {
        await q.markRecipientFailed(id);
        outcome.failed++;
      }
    });
    const secs = (performance.now() - t0) / 1000;

    const dup = [...sentToGateway.values()].filter((c) => c > 1).length;
    const states = rowsOf<{ wa_status: string; n: number }>(
      await db.execute(sql`SELECT wa_status, COUNT(*)::int AS n FROM recipients GROUP BY 1`),
    );
    const count = (s: string) => states.find((r) => r.wa_status === s)?.n ?? 0;
    const used = rowsOf<{ sent: number }>(await db.execute(sql`SELECT sent FROM send_counters WHERE number_id = 'dev-stress'`));

    report.push({
      scenario: 'mass send',
      volume: N,
      'per sec': Math.round(outcome.sent / secs),
      sent: outcome.sent,
      'quota-blocked': outcome.quota,
      failed: outcome.failed,
      duplicates: dup,
    });

    expect(dup).toBe(0); // no recipient reached the gateway twice
    expect(outcome.sent).toBe(LIMIT); // quota is exact: never over, never under
    expect(sentToGateway.size).toBe(LIMIT);
    expect(used[0].sent).toBe(LIMIT);
    expect(count('sent')).toBe(LIMIT);
    expect(count('pending')).toBe(N - LIMIT); // blocked ones returned to the queue
    expect(count('sending')).toBe(0); // nothing stuck in flight
    expect(outcome.failed).toBe(0);
    expect(outcome.sent / secs).toBeGreaterThan(MIN_SEND_PER_SEC);
  }, 120_000);
});

run('2. webhook ack storm: duplicates and out-of-order receipts', () => {
  it('never moves a status backwards and never answers 5xx', async () => {
    const { POST } = await import('@/app/api/webhook/whatsapp/route');
    const ids = rowsOf<{ id: number; wa_message_id: string }>(
      await db.execute(sql`SELECT id, wa_message_id FROM recipients WHERE wa_status = 'sent' ORDER BY id LIMIT ${400 * SCALE}`),
    );

    const post = (ip: string, messageId: string, receipt: 'delivered' | 'read') => {
      const body = JSON.stringify({ event: 'message.ack', payload: { ids: [messageId], receipt_type: receipt } });
      const sig = crypto.createHmac('sha256', process.env.WHATSAPP_WEBHOOK_SECRET as string).update(body).digest('hex');
      return POST(
        new NextRequest('http://localhost/api/webhook/whatsapp', {
          method: 'POST',
          headers: { 'x-webhook-signature': sig, 'x-real-ip': ip },
          body,
        }),
      );
    };

    // Per message: read, delivered, read, delivered fired at once (worst-case ordering),
    // spread over many IPs so the per-IP webhook rate limit is not what is being tested.
    const jobs = ids.flatMap((r, i) =>
      (['read', 'delivered', 'read', 'delivered'] as const).map((rc) => () => post(`10.1.${i % 200}.${i % 250}`, r.wa_message_id, rc)),
    );
    const t0 = performance.now();
    const res = await pool(jobs.length, 40, (i) => jobs[i]());
    const secs = (performance.now() - t0) / 1000;
    const bad = res.filter((r) => r.status >= 500).length;

    const finals = rowsOf<{ wa_status: string; n: number }>(
      await db.execute(sql`SELECT wa_status, COUNT(*)::int AS n FROM recipients WHERE id IN (${sql.join(ids.map((r) => sql`${r.id}`), sql`, `)}) GROUP BY 1`),
    );
    report.push({
      scenario: 'webhook acks',
      volume: jobs.length,
      'per sec': Math.round(jobs.length / secs),
      '5xx': bad,
      'not read': finals.filter((f) => f.wa_status !== 'read').reduce((s, f) => s + f.n, 0),
    });

    expect(bad).toBe(0);
    expect(finals).toEqual([{ wa_status: 'read', n: ids.length }]); // read always wins
  }, 120_000);
});

run('3. public form flood', () => {
  it('accepts normal traffic from many IPs, and throttles one hammering IP at exactly the limit', async () => {
    const { POST } = await import('@/app/api/submit/route');
    const submit = (ip: string, n: number) =>
      POST(
        new NextRequest('http://localhost/api/submit', {
          method: 'POST',
          headers: { 'x-real-ip': ip, 'content-type': 'application/json', 'user-agent': 'stress/1.0' },
          body: JSON.stringify({ name: `Pegawai ${n}`, nip: `${n}`, jabatan_sk: 'Staf', jabatan_sekarang: 'Staf', cabang: 'Manado' }),
        }),
      );

    const normal = 300 * SCALE;
    const t0 = performance.now();
    // 3 submissions per IP, under the 5/min limit.
    const ok = await pool(normal, 40, (i) => submit(`172.16.${Math.floor(i / 3) % 250}.${Math.floor(i / 750) + 1}`, i));
    const secs = (performance.now() - t0) / 1000;
    const hammer = await Promise.all(Array.from({ length: 60 }, (_, i) => submit('203.0.113.9', 100_000 + i)));
    const passed = hammer.filter((r) => r.status === 200).length;
    const limited = hammer.filter((r) => r.status === 429).length;
    const stored = rowsOf<{ n: number }>(await db.execute(sql`SELECT COUNT(*)::int AS n FROM pegawai`))[0].n;

    report.push({
      scenario: 'public form',
      volume: normal + 60,
      'per sec': Math.round(normal / secs),
      'normal ok': ok.filter((r) => r.status === 200).length,
      'hammer passed': passed,
      'hammer 429': limited,
    });

    expect(ok.every((r) => r.status === 200)).toBe(true); // legitimate users are never blocked
    expect(passed).toBe(5); // the cap holds exactly under concurrency
    expect(limited).toBe(55);
    expect(stored).toBe(normal + 5); // every accepted submission stored once, rejected ones not at all
  }, 120_000);
});

run('4. admin reads at volume', () => {
  it(`walks ${20_000 * SCALE} recipients page by page and answers dashboards fast`, async () => {
    const rows = 20_000 * SCALE;
    await db.execute(sql`TRUNCATE recipients, campaigns, recipient_status_history RESTART IDENTITY`);
    await db.execute(sql`
      INSERT INTO campaigns (name, status) SELECT 'Camp ' || g, 'sent' FROM generate_series(1, 20) g`);
    await db.execute(sql`
      INSERT INTO recipients (label, phone, wa_status, campaign_id)
      SELECT 'Pegawai ' || g, '0813' || lpad(g::text, 8, '0'),
             (ARRAY['pending','sent','delivered','read','failed'])[1 + g % 5], 1 + g % 20
      FROM generate_series(1, ${rows}) g`);
    await db.execute(sql`
      INSERT INTO recipient_status_history (recipient_id, status)
      SELECT id, wa_status FROM recipients WHERE wa_status IN ('sent','delivered','read')`);

    // Same loop as the client helper fetchAllRows: follow nextBefore until null.
    const { GET: listRecipients } = await import('@/app/api/recipients/route');
    const seen = new Set<number>();
    let before: number | null = null;
    let pages = 0;
    const t0 = performance.now();
    do {
      const res: Response = await listRecipients(authed(`/api/recipients?limit=1000${before ? `&before=${before}` : ''}`));
      expect(res.status).toBe(200);
      const page = (await res.json()) as { rows: Array<{ id: number }>; nextBefore: number | null };
      for (const r of page.rows) seen.add(r.id);
      before = page.nextBefore;
      pages++;
    } while (before !== null);
    const walkMs = performance.now() - t0;

    const { GET: reportRoute } = await import('@/app/api/reports/broadcast/route');
    const { GET: campaignsRoute } = await import('@/app/api/campaigns/route');
    const timed = async (name: string, fn: () => Promise<Response>) => {
      const ms: number[] = [];
      await pool(40, 10, async () => {
        const t = performance.now();
        const res = await fn();
        ms.push(performance.now() - t);
        expect(res.status).toBe(200);
      });
      report.push({ scenario: `read ${name}`, volume: 40, 'p50 ms': Math.round(pct(ms, 50)), 'p95 ms': Math.round(pct(ms, 95)) });
      return pct(ms, 95);
    };
    const reportP95 = await timed('/api/reports/broadcast', () => reportRoute(authed('/api/reports/broadcast')));
    const campaignsP95 = await timed('/api/campaigns', () => campaignsRoute(authed('/api/campaigns')));

    const summary = (await (await reportRoute(authed('/api/reports/broadcast'))).json()) as { summary: { totalRecipients: number; failed: number } };
    report.push({ scenario: 'recipient walk', volume: rows, pages, 'total ms': Math.round(walkMs) });

    expect(seen.size).toBe(rows); // every row exactly once: no gaps, no repeats
    expect(walkMs).toBeLessThan(FULL_WALK_MS);
    expect(reportP95).toBeLessThan(READ_P95_MS);
    expect(campaignsP95).toBeLessThan(READ_P95_MS);
    expect(summary.summary.totalRecipients).toBe(rows);
    expect(summary.summary.failed).toBe(rows / 5); // counts agree with the data
  }, 300_000);
});
