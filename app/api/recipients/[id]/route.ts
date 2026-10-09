import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recipients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest, describeChanges } from '@/lib/audit';

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
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const recipientId = parseInt(id, 10);
    if (isNaN(recipientId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const body = await req.json();
    const updateData: Partial<typeof recipients.$inferInsert> = {};

    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.cabang !== undefined) updateData.cabang = body.cabang;
    if (body.message !== undefined) updateData.message = body.message;
    if (body.waMessageId !== undefined) updateData.waMessageId = body.waMessageId;
    if (body.waStatus !== undefined) updateData.waStatus = body.waStatus;
    if (body.waSent) {
      updateData.waSentAt = new Date();
      updateData.waStatus = 'sent';
    }

    const [before] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.id, recipientId));
    if (!before) {
      return NextResponse.json({ success: false, error: 'Target not found.' }, { status: 404 });
    }

    const [updated] = await db
      .update(recipients)
      .set(updateData)
      .where(eq(recipients.id, recipientId))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Target not found.' }, { status: 404 });
    }

    const actor = await getAdminUsername(req);
    if (actor) {
      const fields = ['phone', 'cabang', 'message', 'waStatus', 'waMessageId'];
      const changes = describeChanges(
        before as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
        fields,
      );
      void logAuditForRequest(
        req,
        actor,
        'update_recipient',
        `Penerima "${before.label}" (ID: ${recipientId}) diperbarui — ${changes}`,
      );
    }

    return NextResponse.json({ success: true, recipient: updated });
  } catch (error: any) {
    console.error('Update recipient error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not update the record in the database.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const recipientId = parseInt(id, 10);
    if (isNaN(recipientId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(recipients)
      .where(eq(recipients.id, recipientId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Target not found.' }, { status: 404 });
    }

    const actor = await getAdminUsername(req);
    if (actor) {
      void logAuditForRequest(
        req,
        actor,
        'delete_recipient',
        `Penerima "${deleted.label}" (ID: ${recipientId}, ${deleted.phone ?? 'tanpa nomor'}) dihapus`,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete recipient error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not delete the record from the database.' },
      { status: 500 }
    );
  }
}
