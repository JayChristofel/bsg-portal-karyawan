import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recipients, pegawai } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { sendMessage } from '@/lib/whatsapp';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

async function checkAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return Boolean(session);
}

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const [recList, pegList] = await Promise.all([
      db.select().from(recipients).orderBy(desc(recipients.createdAt)),
      db.select({ name: pegawai.name, createdAt: pegawai.createdAt, cabang: pegawai.cabang }).from(pegawai),
    ]);

    // Build map of submitted employees by lowercase name
    const submittedMap = new Map<string, { createdAt: Date; cabang: string }>();
    for (const p of pegList) {
      const key = p.name.trim().toLowerCase();
      if (!submittedMap.has(key)) {
        submittedMap.set(key, { createdAt: p.createdAt, cabang: p.cabang });
      }
    }

    const rowsWithSubmission = recList.map((r) => {
      const subInfo = submittedMap.get(r.label.trim().toLowerCase());
      const isSubmitted = Boolean(subInfo);
      return {
        ...r,
        cabang: r.cabang || subInfo?.cabang || null,
        isSubmitted,
        formSubmittedAt: subInfo ? subInfo.createdAt.toISOString() : null,
      };
    });

    const listActor = await getAdminUsername(req);
    if (listActor) {
      void logAuditForRequest(
        req,
        listActor,
        'view_recipients',
        `Melihat daftar penerima (${recList.length} baris)`,
      );
    };

    return NextResponse.json(rowsWithSubmission);
  } catch (error: any) {
    console.error('Fetch recipients error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not read data from the database.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Action 1: Pull from existing data pegawai
    if (body.action === 'pull_from_pegawai') {
      const [allPegawai, existingRecipients] = await Promise.all([
        db.select().from(pegawai),
        db.select({ label: recipients.label }).from(recipients),
      ]);

      const existingNames = new Set(existingRecipients.map((r) => r.label.trim().toLowerCase()));

      const toInsert = allPegawai
        .filter((p) => !existingNames.has(p.name.trim().toLowerCase()))
        .map((p) => ({
          label: p.name.trim(),
          phone: null,
          cabang: p.cabang || null,
          waStatus: 'pending',
        }));

      const actor = await getAdminUsername(req);
      if (toInsert.length === 0) {
        return NextResponse.json({
          success: true,
          count: 0,
          message: 'All employee records are already in the broadcast list.',
        });
      }

      const created = await db.insert(recipients).values(toInsert).returning();

      if (actor) {
        void logAuditForRequest(
          req,
          actor,
          'import_recipients',
          `Tarik dari data pegawai: ${created.length} penerima ditambahkan ke daftar broadcast`,
        );
      }

      return NextResponse.json({
        success: true,
        count: created.length,
        message: `Berhasil menambahkan ${created.length} pegawai ke daftar broadcast.`,
      });
    }

    // Action 2: Batch import (from Excel/CSV or multi-line text)
    if (Array.isArray(body.items)) {
      const items = body.items
        .map((it: { label?: string; phone?: string; cabang?: string }) => ({
          label: (it.label || '').trim().slice(0, 200),
          phone: (it.phone || '').trim().slice(0, 30) || null,
          cabang: (it.cabang || '').trim().slice(0, 100) || null,
          waStatus: 'pending',
        }))
        .filter((it: { label: string }) => Boolean(it.label));

      if (items.length === 0 || items.length > 2000) {
        return NextResponse.json(
          { success: false, error: 'Invalid record count (1 - 2000 rows).' },
          { status: 400 }
        );
      }

      const normalizePhone = (p: string | null) => p?.replace(/\D/g, '').replace(/^0/, '62') || null;

      const existingPhones = new Set(
        (await db.select({ phone: recipients.phone }).from(recipients))
          .map((r) => normalizePhone(r.phone))
          .filter(Boolean)
      );

      const seen = new Set<string>();
      const unique: typeof items = [];
      const duplicates: string[] = [];

      for (const item of items) {
        const key = normalizePhone(item.phone);
        if (!key) { unique.push(item); continue; }
        if (seen.has(key) || existingPhones.has(key)) {
          duplicates.push(item.phone!);
          continue;
        }
        seen.add(key);
        unique.push(item);
      }

      if (unique.length === 0) {
        return NextResponse.json({
          success: true,
          count: 0,
          duplicates,
          message: 'All numbers are already registered; no new records.',
        });
      }

      const created = await db.insert(recipients).values(unique).returning();

      const actor = await getAdminUsername(req);
      if (actor) {
        const dupNote = duplicates.length
          ? `, ${duplicates.length} nomor duplikat dilewati`
          : '';
        void logAuditForRequest(
          req,
          actor,
          'import_recipients',
          `Import batch: ${created.length} penerima ditambahkan${dupNote}`,
        );
      }

      return NextResponse.json({
        success: true,
        count: created.length,
        duplicates,
        recipients: created,
      });
    }

    // Action 3: Single create + send
    const label = (body.label || '').trim();
    const phone = (body.phone || '').trim();
    const message = (body.message || '').trim();
    const cabang = (body.cabang || '').trim() || null;

    if (!label || !phone || !message) {
      return NextResponse.json(
        { success: false, error: 'label, phone, and message are required.' },
        { status: 400 }
      );
    }

    // Insert as pending first
    const [newRecipient] = await db
      .insert(recipients)
      .values({ label, phone, message, cabang, waStatus: 'pending' })
      .returning();

    // Send via GOWA
    const waResult = await sendMessage(phone, message);
    const messageId =
      waResult?.results?.message_id ||
      waResult?.results?.id ||
      waResult?.message_id ||
      null;

    const sent = waResult?.code === 'SUCCESS' || waResult?.code === 'OK' || Boolean(messageId);

    if (sent) {
      const { eq } = await import('drizzle-orm');
      await db
        .update(recipients)
        .set({
          waMessageId: messageId,
          waStatus: 'sent',
          waSentAt: new Date(),
        })
        .where(eq(recipients.id, newRecipient.id));
    }

    return NextResponse.json({
      success: sent,
      recipient: { ...newRecipient, waStatus: sent ? 'sent' : 'pending' },
      waResult,
    });
  } catch (error: any) {
    console.error('Create recipient/send error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not process the request.' },
      { status: 500 }
    );
  }
}
