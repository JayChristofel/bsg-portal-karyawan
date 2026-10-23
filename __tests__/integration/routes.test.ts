// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Executes the real route handlers against a real Postgres, so every SQL statement
 * in them runs at least once. Mocked tests cannot catch things like a bound parameter
 * in GROUP BY, or a Date handed to raw SQL. Skipped without TEST_DATABASE_URL.
 */
const URL = process.env.TEST_DATABASE_URL;
const run = URL ? describe : describe.skip;

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
      return new Response(JSON.stringify({ messageId: 'wa-1', timestamp: Date.now() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
});

let cookie = '';
let db: typeof import('@/db').db;
let sql: typeof import('drizzle-orm').sql;

const req = (path: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: init.method ?? 'GET',
    headers: { cookie, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

beforeAll(async () => {
  if (!URL) return;
  process.env.DATABASE_URL = URL;
  process.env.ENCRYPTION_KEY = 'k'.repeat(40);
  process.env.JWT_SECRET = 'j'.repeat(48);
  process.env.WHATSAPP_API_URL = 'https://gateway.example';
  process.env.WHATSAPP_DEVICE_ID = 'dev-it';
  ({ db } = await import('@/db'));
  ({ sql } = await import('drizzle-orm'));
  const { createSessionToken, COOKIE_NAME } = await import('@/lib/auth');
  cookie = `${COOKIE_NAME}=${await createSessionToken('tester')}`;
});

beforeEach(async () => {
  if (!URL) return;
  await db.execute(sql`
    TRUNCATE pegawai, recipients, campaigns, message_templates, recipient_status_history,
             audit_log, admins, rate_limits, send_counters, warmup_numbers, settings,
             email_recipients, email_campaigns, email_templates, email_logs RESTART IDENTITY`);
  await db.execute(sql`INSERT INTO admins (username, password_hash) VALUES ('tester', 'x$y')`);
  await db.execute(sql`INSERT INTO warmup_numbers (number_id, daily_limit_override) VALUES ('dev-it', 100)`);
});

run('read routes execute their SQL', () => {
  it('GET /api/reports/broadcast (grouped by WITA day, with filters)', async () => {
    const { GET } = await import('@/app/api/reports/broadcast/route');
    await db.execute(sql`INSERT INTO campaigns (name, status) VALUES ('C1', 'sent')`);
    await db.execute(sql`INSERT INTO recipients (label, phone, wa_status, campaign_id) VALUES ('A', '1', 'sent', 1), ('B', '2', 'read', 1)`);
    await db.execute(sql`INSERT INTO recipient_status_history (recipient_id, status) VALUES (1, 'sent'), (2, 'read')`);

    const res = await GET(req('/api/reports/broadcast'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalRecipients).toBe(2);
    expect(body.timeline.length).toBeGreaterThan(0);

    expect((await GET(req('/api/reports/broadcast?from=2020-01-01&to=2099-12-31&campaignId=1'))).status).toBe(200);
    expect((await GET(req('/api/reports/broadcast?from=2026-02-30'))).status).toBe(400);
    expect((await GET(req('/api/reports/broadcast?campaignId=abc'))).status).toBe(400);
  });

  it('GET /api/audit handles filters, wildcard-safe search, and rejects bad dates', async () => {
    const { GET } = await import('@/app/api/audit/route');
    await db.execute(sql`INSERT INTO audit_log (admin_username, action, detail) VALUES ('tester', 'login', '100% done'), ('tester', 'login', 'plain')`);

    const all = await (await GET(req('/api/audit'))).json();
    expect(all.total).toBeGreaterThanOrEqual(2);

    const pct = await (await GET(req('/api/audit?search=100%25'))).json();
    expect(pct.logs.every((l: { detail: string }) => l.detail.includes('100%'))).toBe(true);

    expect((await GET(req('/api/audit?from=2020-01-01&to=2099-01-01&admin=tester&action=login&sort=ip&dir=asc'))).status).toBe(200);
    expect((await GET(req('/api/audit?from=nope'))).status).toBe(400);
  });

  it('list endpoints page by keyset cursor without gaps or repeats', async () => {
    const { db: appDb } = await import('@/db');
    const { pegawai } = await import('@/db/schema');
    for (const n of ['A', 'B', 'C']) {
      await appDb.insert(pegawai).values({ name: n, nip: n, jabatanSk: 'x', jabatanSekarang: 'y', cabang: 'Manado' });
    }
    const peg = await import('@/app/api/pegawai/route');
    const seen: string[] = [];
    let before: number | null = null;
    let pages = 0;
    do {
      const res: Response = await peg.GET(req(`/api/pegawai?limit=2${before ? `&before=${before}` : ''}`));
      const page = await res.json();
      seen.push(...page.rows.map((r: { name: string }) => r.name));
      before = page.nextBefore;
      pages++;
    } while (before !== null);
    expect(seen).toEqual(['C', 'B', 'A']);
    expect(pages).toBe(2);
  });

  it('GET /api/export (csv + xlsx), /api/export.csv, /api/pegawai, /api/recipients, /api/tracking', async () => {
    await db.execute(sql`INSERT INTO recipients (label, phone, wa_status) VALUES ('Budi', '+62 812-3456-7890', 'pending'), ('=cmd', '081234567891', 'sent')`);
    const { db: appDb } = await import('@/db');
    const { pegawai } = await import('@/db/schema');
    await appDb.insert(pegawai).values({ name: 'Budi', nip: '123', jabatanSk: 'A', jabatanSekarang: 'B', cabang: 'Manado' });

    const exp = await import('@/app/api/export/route');
    const csv = await (await exp.GET(req('/api/export?format=csv'))).text();
    expect(csv).toContain('6281234567890'); // phone exported as plain digits
    expect(csv).toContain(`"'=cmd"`); // formula neutralised
    expect((await exp.GET(req('/api/export?format=xlsx'))).status).toBe(200);
    expect((await exp.GET(req('/api/export?campaignId=zzz'))).status).toBe(400);

    const csv2 = await import('@/app/api/export.csv/route');
    const emp = await (await csv2.GET(req('/api/export.csv'))).text();
    expect(emp).toContain('Manado');

    const peg = await import('@/app/api/pegawai/route');
    const { rows: list, nextBefore } = await (await peg.GET(req('/api/pegawai'))).json();
    expect(nextBefore).toBeNull();
    expect(list[0].nip).toBe('123'); // decrypted on read

    const rec = await import('@/app/api/recipients/route');
    const { rows: recs } = await (await rec.GET(req('/api/recipients'))).json();
    expect(recs.find((r: { label: string }) => r.label === 'Budi').isSubmitted).toBe(true);

    const trk = await import('@/app/api/tracking/route');
    expect((await trk.GET(req('/api/tracking'))).status).toBe(200);
  });

  it('GET list routes for campaigns / templates / email / admins activity', async () => {
    await db.execute(sql`INSERT INTO campaigns (name) VALUES ('C')`);
    await db.execute(sql`INSERT INTO email_campaigns (name, subject) VALUES ('E', 'S')`);
    for (const [mod, path] of [
      ['@/app/api/campaigns/route', '/api/campaigns'],
      ['@/app/api/templates/route', '/api/templates'],
      ['@/app/api/email/campaigns/route', '/api/email/campaigns'],
      ['@/app/api/email/templates/route', '/api/email/templates'],
      ['@/app/api/email/recipients/route', '/api/email/recipients'],
      ['@/app/api/admins/route', '/api/admins'],
      ['@/app/api/warmup/route', '/api/warmup'],
      ['@/app/api/auto-resume/route', '/api/auto-resume'],
      ['@/app/api/broadcast-session/route', '/api/broadcast-session?channel=whatsapp'],
    ] as const) {
      const { GET } = await import(mod);
      const res = await GET(req(path));
      expect([path, res.status]).toEqual([path, 200]);
    }
    const { GET } = await import('@/app/api/admins/[id]/activity/route');
    expect((await GET(req('/x'), { params: Promise.resolve({ id: '1' }) })).status).toBe(200);
  });
});

run('write routes keep their guarantees', () => {
  it('POST /api/admins: reserved + duplicate names are refused, no 500', async () => {
    const { POST } = await import('@/app/api/admins/route');
    const ok = await POST(req('/api/admins', { method: 'POST', body: { username: 'second', password: 'long-enough-pw' } }));
    expect(ok.status).toBe(200);
    expect((await POST(req('/api/admins', { method: 'POST', body: { username: 'second', password: 'long-enough-pw' } }))).status).toBe(409);
    expect((await POST(req('/api/admins', { method: 'POST', body: { username: 'public', password: 'long-enough-pw' } }))).status).toBe(400);
    expect((await POST(req('/api/admins', { method: 'POST', body: { username: 5, password: null } }))).status).toBe(400);
  });

  it('POST /api/whatsapp/send: claims the recipient, marks it sent, refuses a second send', async () => {
    const { POST } = await import('@/app/api/whatsapp/send/route');
    await db.execute(sql`INSERT INTO recipients (label, phone, wa_status) VALUES ('A', '081234567890', 'pending')`);
    const body = { recipientId: 1, phone: '081234567890', message: 'hello' };

    const first = await POST(req('/api/whatsapp/send', { method: 'POST', body }));
    expect(first.status).toBe(200);
    const row = (await db.execute(sql`SELECT wa_status, wa_message_id FROM recipients WHERE id = 1`)) as unknown as Array<{ wa_status: string; wa_message_id: string }>;
    expect(row[0]).toMatchObject({ wa_status: 'sent', wa_message_id: 'wa-1' });

    const again = await POST(req('/api/whatsapp/send', { method: 'POST', body }));
    expect(again.status).toBe(409);

    const hist = (await db.execute(sql`SELECT status FROM recipient_status_history WHERE recipient_id = 1`)) as unknown as Array<{ status: string }>;
    expect(hist.map((h) => h.status)).toContain('sent');
  });

  it('concurrent POST /api/whatsapp/send for one recipient sends exactly once', async () => {
    const { POST } = await import('@/app/api/whatsapp/send/route');
    await db.execute(sql`INSERT INTO recipients (label, phone, wa_status) VALUES ('A', '081234567890', 'pending')`);
    const body = { recipientId: 1, phone: '081234567890', message: 'hello' };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => POST(req('/api/whatsapp/send', { method: 'POST', body }))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
  });

  it('POST /api/campaigns/[id]/send sends pending recipients once and reports remaining', async () => {
    const { POST } = await import('@/app/api/campaigns/[id]/send/route');
    await db.execute(sql`INSERT INTO message_templates (name, body) VALUES ('T', 'Halo {nama}')`);
    await db.execute(sql`INSERT INTO campaigns (name, status, template_id) VALUES ('C', 'scheduled', 1)`);
    await db.execute(sql`INSERT INTO recipients (label, phone, campaign_id, wa_status) VALUES ('A', '081234567890', 1, 'pending'), ('B', '081234567891', 1, 'sent')`);

    const res = await POST(req('/api/campaigns/1/send', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ successCount: 1, failCount: 0, remaining: 0 });

    const camp = (await db.execute(sql`SELECT status FROM campaigns WHERE id = 1`)) as unknown as Array<{ status: string }>;
    expect(camp[0].status).toBe('sent');

    // Nothing pending is left, so pressing the button again must not message anyone.
    const again = await POST(req('/api/campaigns/1/send', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) });
    expect(again.status).toBe(400);
  }, 30_000);
});

run('campaign recipient management', () => {
  const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

  it('WhatsApp: assign, list, and unassign only unsent members; counts follow real statuses', async () => {
    await db.execute(sql`INSERT INTO campaigns (name, status) VALUES ('C1', 'draft')`);
    await db.execute(sql`INSERT INTO recipients (label, phone, wa_status) VALUES
      ('A', '081234567891', 'pending'), ('B', '081234567892', 'pending'), ('C', '081234567893', 'pending')`);
    const route = await import('@/app/api/campaigns/[id]/recipients/route');

    const add = await route.POST(req('/x', { method: 'POST', body: { recipientIds: [1, 2, 3] } }), ctx(1));
    expect((await add.json()).count).toBe(3);

    await db.execute(sql`UPDATE recipients SET wa_status = 'read' WHERE id = 1`);
    await db.execute(sql`UPDATE recipients SET wa_status = 'failed' WHERE id = 2`);

    const list = await (await route.GET(req('/x'), ctx(1))).json();
    expect(list.recipients.map((r: { label: string }) => r.label)).toEqual(['A', 'B', 'C']);
    expect(list.campaign.status).toBe('draft');

    // The read one keeps its campaign (history); pending/failed can leave.
    const del = await route.DELETE(req('/x', { method: 'DELETE', body: { recipientIds: [1, 2, 3] } }), ctx(1));
    expect((await del.json()).count).toBe(2);

    const camp = await import('@/app/api/campaigns/route');
    const { campaigns } = await (await camp.GET(req('/api/campaigns'))).json();
    expect(campaigns[0]).toMatchObject({ totalRecipients: 1, sentCount: 1, failedCount: 0, readCount: 1 });
  });

  it('WhatsApp: refuses to change a campaign that is sending', async () => {
    await db.execute(sql`INSERT INTO campaigns (name, status) VALUES ('C1', 'sending')`);
    const route = await import('@/app/api/campaigns/[id]/recipients/route');
    const res = await route.DELETE(req('/x', { method: 'DELETE', body: { recipientIds: [1] } }), ctx(1));
    expect(res.status).toBe(409);
  });

  it('email: PATCH assigns only unsent rows, GET shows delivery events', async () => {
    await db.execute(sql`INSERT INTO email_campaigns (name, subject, status) VALUES ('E1', 's', 'draft')`);
    await db.execute(sql`INSERT INTO email_recipients (name, email, status) VALUES
      ('A', 'a@x.id', 'pending'), ('B', 'b@x.id', 'sent')`);
    const rec = await import('@/app/api/email/recipients/route');

    const moved = await rec.PATCH(req('/x', { method: 'PATCH', body: { ids: [1, 2], campaignId: 1 } }));
    expect((await moved.json()).count).toBe(1); // 'sent' row is left alone

    await db.execute(sql`INSERT INTO email_logs (campaign_id, recipient_id, event) VALUES (1, 1, 'delivered')`);
    const per = await import('@/app/api/email/campaigns/[id]/recipients/route');
    const data = await (await per.GET(req('/x'), ctx(1))).json();
    expect(data.recipients).toHaveLength(1);
    expect(data.recipients[0].events[0].event).toBe('delivered');

    const out = await rec.PATCH(req('/x', { method: 'PATCH', body: { ids: [1], campaignId: null, fromCampaignId: 1 } }));
    expect((await out.json()).count).toBe(1);

    const bad = await rec.PATCH(req('/x', { method: 'PATCH', body: { ids: [1], campaignId: 'abc' } }));
    expect(bad.status).toBe(400);
  });
});
