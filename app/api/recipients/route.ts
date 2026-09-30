import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/db';
import { recipients, events, pegawai } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';

async function checkAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return Boolean(session);
}

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ success: false, error: 'Belum login.' }, { status: 401 });
  }

  try {
    const [allRecipients, allEvents, allSubmissions] = await Promise.all([
      db.select().from(recipients).orderBy(desc(recipients.createdAt)),
      db.select().from(events),
      db.select().from(pegawai),
    ]);

    // Group events and submissions by token
    const openMap = new Map<string, string>();
    const startMap = new Map<string, string>();
    const submitMap = new Map<string, string>();

    for (const ev of allEvents) {
      const timeStr = ev.createdAt ? new Date(ev.createdAt).toLocaleString('id-ID') : '-';
      if (ev.eventType === 'open' && !openMap.has(ev.token)) {
        openMap.set(ev.token, timeStr);
      } else if (ev.eventType === 'start' && !startMap.has(ev.token)) {
        startMap.set(ev.token, timeStr);
      }
    }

    for (const sub of allSubmissions) {
      if (sub.token && !submitMap.has(sub.token)) {
        const timeStr = sub.createdAt ? new Date(sub.createdAt).toLocaleString('id-ID') : '-';
        submitMap.set(sub.token, timeStr);
      }
    }

    const data = allRecipients.map((r) => {
      const hasSubmitted = submitMap.has(r.token);
      const hasStarted = startMap.has(r.token);
      const hasOpened = openMap.has(r.token);

      let status = 'Belum Buka';
      if (hasSubmitted) status = 'Selesai Submit';
      else if (hasStarted) status = 'Mulai Isi Form';
      else if (hasOpened) status = 'Link Dibuka';

      return {
        id: r.id,
        token: r.token,
        label: r.label,
        phone: r.phone || null,
        waSentAt: r.waSentAt ? new Date(r.waSentAt).toLocaleString('id-ID') : null,
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString('id-ID') : '-',
        status,
        openedAt: openMap.get(r.token) || null,
        startedAt: startMap.get(r.token) || null,
        submittedAt: submitMap.get(r.token) || null,
      };
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Fetch campaign error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data kampanye dari database.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ success: false, error: 'Belum login.' }, { status: 401 });
  }

  try {
    const body = await req.json();

    let items: { label: string; phone?: string }[] = [];

    if (Array.isArray(body.items)) {
      items = body.items
        .map((it: { label?: string; phone?: string }) => ({
          label: (it.label || '').trim().slice(0, 200),
          phone: (it.phone || '').trim().slice(0, 30),
        }))
        .filter((it: { label: string }) => Boolean(it.label));
    } else if (Array.isArray(body.labels)) {
      items = body.labels
        .map((l: string) => ({
          label: (l || '').trim().slice(0, 200),
          phone: '',
        }))
        .filter((it: { label: string }) => Boolean(it.label));
    }

    if (items.length === 0 || items.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Jumlah data tidak valid (1 - 500 baris).' },
        { status: 400 }
      );
    }

    const payload = items.map((it) => ({
      token: crypto.randomBytes(9).toString('base64url'),
      label: it.label,
      phone: it.phone || null,
    }));

    const created = await db.insert(recipients).values(payload).returning();
    return NextResponse.json({ success: true, recipients: created });
  } catch (error: any) {
    console.error('Create recipients error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat penerima di database.' },
      { status: 500 }
    );
  }
}
