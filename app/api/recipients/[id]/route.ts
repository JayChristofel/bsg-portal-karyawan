import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recipients, recipientStatusHistory } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest, describeChanges } from '@/lib/audit';
import { normalizeWaPhone } from '@/lib/whatsapp';
import { readJsonObject, str, parseId } from '@/lib/validate';

// A status an admin may hand-reset to 'pending' (stuck or failed). Anything already
// sent/delivered/read must not go back, or the recipient would be messaged again.
const RESETTABLE = new Set(['pending', 'sending', 'failed']);

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
    const recipientId = parseId(id);
    if (recipientId === null) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const [before] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.id, recipientId));
    if (!before) {
      return NextResponse.json({ success: false, error: 'Target not found.' }, { status: 404 });
    }

    // Whitelist: only what the admin UI edits. waMessageId and arbitrary waStatus
    // values are owned by the send path and the webhook, not by this endpoint.
    const updateData: Partial<typeof recipients.$inferInsert> = {};

    if (body.phone !== undefined) {
      const phone = str(body.phone, 30);
      if (phone && !normalizeWaPhone(phone)) {
        return NextResponse.json({ success: false, error: 'Nomor WhatsApp tidak valid.' }, { status: 400 });
      }
      updateData.phone = phone || null;
    }
    if (body.cabang !== undefined) updateData.cabang = str(body.cabang, 200) || null;
    if (body.message !== undefined) updateData.message = str(body.message, 4000) || null;

    const current = before.waStatus ?? 'pending';
    const wantsStatus =
      body.waSent === true ? 'sent' : typeof body.waStatus === 'string' ? body.waStatus : undefined;
    if (wantsStatus !== undefined && wantsStatus !== current) {
      const allowed =
        (wantsStatus === 'pending' && RESETTABLE.has(current)) ||
        (wantsStatus === 'sent' && RESETTABLE.has(current));
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: `Status tidak dapat diubah dari "${current}" ke "${wantsStatus}".` },
          { status: 409 },
        );
      }
      updateData.waStatus = wantsStatus;
      updateData.waSentAt = wantsStatus === 'sent' ? new Date() : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'Tidak ada perubahan yang valid.' }, { status: 400 });
    }

    const [updated] = await db
      .update(recipients)
      .set(updateData)
      .where(eq(recipients.id, recipientId))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Target not found.' }, { status: 404 });
    }

    if (updateData.waStatus && updateData.waStatus !== current) {
      await db.insert(recipientStatusHistory).values({
        recipientId,
        status: updateData.waStatus,
        messageId: updated.waMessageId,
      });
    }

    const actor = await getAdminUsername(req);
    if (actor) {
      const fields = ['phone', 'cabang', 'message', 'waStatus'];
      const changes = describeChanges(
        before as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
        fields,
        ['phone'],
      );
      await logAuditForRequest(
        req,
        actor,
        'update_recipient',
        `Penerima "${before.label}" (ID: ${recipientId}) diperbarui — ${changes}`,
      );
    }

    return NextResponse.json({ success: true, recipient: updated });
  } catch (error: unknown) {
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
    const recipientId = parseId(id);
    if (recipientId === null) {
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
      await logAuditForRequest(
        req,
        actor,
        'delete_recipient',
        `Penerima "${deleted.label}" (ID: ${recipientId}) dihapus`,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete recipient error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not delete the record from the database.' },
      { status: 500 }
    );
  }
}
