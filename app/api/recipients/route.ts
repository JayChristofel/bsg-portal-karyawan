import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recipients, pegawai } from '@/db/schema';
import { desc, lt, inArray, sql } from 'drizzle-orm';
import { sendMessageGuarded, getGatewayConfig, normalizeWaPhone } from '@/lib/whatsapp';
import { markRecipientSent, markRecipientFailed, releaseRecipient, parseSendResult } from '@/lib/recipient-queue';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest, logAuditThrottled } from '@/lib/audit';
import { readJsonObject, str, parsePageParams } from '@/lib/validate';

export async function GET(req: NextRequest) {
  if (!(await getAdminUsername(req))) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const { limit, before } = parsePageParams(req.nextUrl.searchParams);
    const fetched = await db
      .select()
      .from(recipients)
      .where(before === null ? undefined : lt(recipients.id, before))
      .orderBy(desc(recipients.id))
      .limit(limit + 1);
    const recList = fetched.slice(0, limit);
    const nextBefore = fetched.length > limit ? recList[recList.length - 1].id : null;

    // Only the employees matching this page's names (uses the lower(trim(name)) index).
    const keys = [...new Set(recList.map((r) => r.label.trim().toLowerCase()))];
    const pegList = keys.length
      ? await db
          .select({ name: pegawai.name, createdAt: pegawai.createdAt, cabang: pegawai.cabang })
          .from(pegawai)
          .where(inArray(sql`lower(trim(${pegawai.name}))`, keys))
          .orderBy(desc(pegawai.createdAt))
      : [];

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
    if (listActor && before === null) {
      await logAuditThrottled(req, listActor, 'view_recipients', 'Melihat daftar penerima');
    }

    return NextResponse.json({ rows: rowsWithSubmission, nextBefore });
  } catch (error: unknown) {
    console.error('Fetch recipients error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not read data from the database.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await getAdminUsername(req))) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Request body must be a JSON object.' }, { status: 400 });
    }

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
        await logAuditForRequest(
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
      let invalidPhones = 0;
      const items = (body.items as unknown[])
        .map((raw) => {
          const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
          const rawPhone = str(it.phone, 30);
          // A number that cannot be a WhatsApp number is dropped (the row stays, the
          // admin is prompted for a phone when sending) instead of failing later.
          const phone = rawPhone && normalizeWaPhone(rawPhone) ? rawPhone : null;
          if (rawPhone && !phone) invalidPhones++;
          return {
            label: str(it.label, 200),
            phone,
            cabang: str(it.cabang, 100) || null,
            waStatus: 'pending',
          };
        })
        .filter((it) => Boolean(it.label));

      if (items.length === 0 || items.length > 2000) {
        return NextResponse.json(
          { success: false, error: 'Invalid record count (1 - 2000 rows).' },
          { status: 400 }
        );
      }

      // Same normalisation as the sender, so "0812", "812" and "+62812" are one number.
      const normalizePhone = (p: string | null) => (p ? normalizeWaPhone(p) : null);

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
        await logAuditForRequest(
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
        invalidPhones,
        recipients: created,
      });
    }

    // Action 3: Single create + send
    const label = str(body.label, 200);
    const phone = str(body.phone, 30);
    const message = str(body.message, 4000);
    const cabang = str(body.cabang, 100) || null;

    if (!label || !phone || !message) {
      return NextResponse.json(
        { success: false, error: 'label, phone, and message are required.' },
        { status: 400 }
      );
    }
    if (!normalizeWaPhone(phone)) {
      return NextResponse.json({ success: false, error: 'Nomor WhatsApp tidak valid.' }, { status: 400 });
    }

    // Insert already claimed ('sending'): this request owns the send, so the
    // auto-resume drain can never pick the row up and send it a second time.
    const [newRecipient] = await db
      .insert(recipients)
      .values({ label, phone, message, cabang, waStatus: 'sending', waSentAt: new Date() })
      .returning();

    // Same guarded path as every other sender, so the warm-up quota applies.
    const config = await getGatewayConfig();
    let guarded: Awaited<ReturnType<typeof sendMessageGuarded>>;
    try {
      guarded = await sendMessageGuarded(phone, message, config.sessionId, config);
    } catch (err) {
      await markRecipientFailed(newRecipient.id);
      throw err;
    }

    if (!guarded.ok) {
      await releaseRecipient(newRecipient.id);
      const { state } = guarded;
      return NextResponse.json(
        {
          success: false,
          code: 'DAILY_QUOTA_EXCEEDED',
          error: `Daily warm-up limit reached (${state.sentToday}/${state.dailyLimit}). Try again tomorrow.`,
          recipient: { ...newRecipient, waStatus: 'pending' },
        },
        { status: 429 },
      );
    }

    const waResult = guarded.result;
    const { messageId, isSuccess: sent } = parseSendResult(waResult);

    if (sent) await markRecipientSent(newRecipient.id, messageId);
    else await markRecipientFailed(newRecipient.id);

    const actor = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      actor ?? 'unknown',
      'send_message',
      `Tambah + kirim WA ke recipient #${newRecipient.id}`,
    );

    return NextResponse.json({
      success: sent,
      recipient: { ...newRecipient, waStatus: sent ? 'sent' : 'failed' },
      waResult,
    });
  } catch (error: unknown) {
    console.error('Create recipient/send error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not process the request.' },
      { status: 500 }
    );
  }
}
