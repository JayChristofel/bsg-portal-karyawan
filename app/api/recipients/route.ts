import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recipients } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { sendMessage } from '@/lib/whatsapp';

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
    const rows = await db.select().from(recipients).orderBy(desc(recipients.createdAt));
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('Fetch recipients error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data dari database.' },
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

    // Batch create without sending
    if (Array.isArray(body.items)) {
      const items = body.items
        .map((it: { label?: string; phone?: string }) => ({
          label: (it.label || '').trim().slice(0, 200),
          phone: (it.phone || '').trim().slice(0, 30) || null,
          waStatus: 'pending',
        }))
        .filter((it: { label: string }) => Boolean(it.label));

      if (items.length === 0 || items.length > 500) {
        return NextResponse.json(
          { success: false, error: 'Jumlah data tidak valid (1 - 500 baris).' },
          { status: 400 }
        );
      }

      const created = await db.insert(recipients).values(items).returning();
      return NextResponse.json({ success: true, recipients: created });
    }

    // Single send: create + immediately send WA
    const label = (body.label || '').trim();
    const phone = (body.phone || '').trim();
    const message = (body.message || '').trim();

    if (!label || !phone || !message) {
      return NextResponse.json(
        { success: false, error: 'label, phone, dan message wajib diisi.' },
        { status: 400 }
      );
    }

    // Insert as pending first
    const [newRecipient] = await db
      .insert(recipients)
      .values({ label, phone, message, waStatus: 'pending' })
      .returning();

    // Send via GOWA
    const waResult = await sendMessage(phone, message);
    const messageId =
      waResult?.results?.message_id ||
      waResult?.results?.id ||
      waResult?.message_id ||
      null;

    const sent = waResult?.code === 'SUCCESS' || waResult?.code === 'OK' || Boolean(messageId);

    // Update status to 'sent' if successful
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
      { success: false, error: 'Gagal memproses permintaan.' },
      { status: 500 }
    );
  }
}
