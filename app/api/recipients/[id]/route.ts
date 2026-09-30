import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recipients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';

async function checkAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return Boolean(session);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ success: false, error: 'Belum login.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const recipientId = parseInt(id, 10);
    if (isNaN(recipientId)) {
      return NextResponse.json({ success: false, error: 'ID tidak valid' }, { status: 400 });
    }

    const body = await req.json();
    const updateData: Partial<typeof recipients.$inferInsert> = {};

    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.message !== undefined) updateData.message = body.message;
    if (body.waMessageId !== undefined) updateData.waMessageId = body.waMessageId;
    if (body.waStatus !== undefined) updateData.waStatus = body.waStatus;
    if (body.waSent) {
      updateData.waSentAt = new Date();
      updateData.waStatus = 'sent';
    }

    const [updated] = await db
      .update(recipients)
      .set(updateData)
      .where(eq(recipients.id, recipientId))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Target tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, recipient: updated });
  } catch (error: any) {
    console.error('Update recipient error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengupdate data di database.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ success: false, error: 'Belum login.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const recipientId = parseInt(id, 10);
    if (isNaN(recipientId)) {
      return NextResponse.json({ success: false, error: 'ID tidak valid' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(recipients)
      .where(eq(recipients.id, recipientId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Target tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete recipient error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal menghapus data dari database.' },
      { status: 500 }
    );
  }
}
