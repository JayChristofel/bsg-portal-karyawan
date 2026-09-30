import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { sendMessage, reconnectDevice, logoutDevice } from '@/lib/whatsapp';
import { db } from '@/db';
import { recipients } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = (body.action || '').trim();

    if (action === 'reconnect') {
      const result = await reconnectDevice();
      return NextResponse.json(result);
    }

    if (action === 'logout') {
      const result = await logoutDevice();
      return NextResponse.json(result);
    }

    // Default: send message
    const phone = (body.phone || '').trim();
    const message = (body.message || '').trim();
    const recipientId = body.recipientId || body.id;

    if (!phone || !message) {
      return NextResponse.json({ success: false, error: 'phone dan message wajib diisi.' }, { status: 400 });
    }

    const result = await sendMessage(phone, message);

    const messageId =
      result?.results?.message_id ||
      result?.results?.id ||
      result?.message_id ||
      null;

    const isSuccess =
      result?.code === 'SUCCESS' ||
      result?.code === 'OK' ||
      Boolean(messageId) ||
      result?.message?.toLowerCase().includes('success');

    // If recipient ID was provided and send succeeded, update the recipient record
    if (recipientId && isSuccess) {
      await db
        .update(recipients)
        .set({
          waMessageId: messageId,
          waStatus: 'sent',
          waSentAt: new Date(),
          message,
        })
        .where(eq(recipients.id, Number(recipientId)));
    }

    return NextResponse.json({
      ...result,
      message_id: messageId,
      isSuccess,
    });
  } catch (err: any) {
    console.error('WA action error:', err);
    return NextResponse.json({ code: 'ERROR', message: err?.message || 'Gagal mengirim ke WhatsApp Gateway.' }, { status: 500 });
  }
}
