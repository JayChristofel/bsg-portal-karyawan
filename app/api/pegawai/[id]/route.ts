import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logAuditForRequest, describeChanges } from '@/lib/audit';

async function checkAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const session = await verifySessionToken(token);
  return Boolean(session);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  const actor = await getAdminUsername(req);
  const { id } = await params;
  const recordId = parseInt(id, 10);
  if (isNaN(recordId)) {
    return NextResponse.json({ success: false, error: 'Invalid ID.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const name = (body.name || '').trim().slice(0, 200);
    const nip = (body.nip || body.nik || '').trim().slice(0, 50);
    const jabatanSk = (body.jabatan_sk || body.jabatanSk || '').trim().slice(0, 200);
    const jabatanSekarang = (body.jabatan_sekarang || body.jabatanSekarang || '').trim().slice(0, 200);
    const cabang = (body.cabang || '').trim().slice(0, 200);

    if (!name || !nip || !jabatanSk || !jabatanSekarang || !cabang) {
      return NextResponse.json(
        { success: false, error: 'All fields are required.' },
        { status: 400 }
      );
    }

    // Snapshot the current values before the write so the audit entry can show
    // a real before/after diff rather than just "record updated".
    const [before] = await db.select().from(pegawai).where(eq(pegawai.id, recordId));
    if (!before) {
      return NextResponse.json({ success: false, error: 'Record not found.' }, { status: 404 });
    }

    const [updated] = await db
      .update(pegawai)
      .set({
        name,
        nip,
        jabatanSk,
        jabatanSekarang,
        cabang,
      })
      .where(eq(pegawai.id, recordId))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Record not found.' }, { status: 404 });
    }

    const changes = describeChanges(
      before as unknown as Record<string, unknown>,
      { name, nip, jabatanSk, jabatanSekarang, cabang },
      ['name', 'nip', 'jabatanSk', 'jabatanSekarang', 'cabang'],
    );

    if (actor) {
      void logAuditForRequest(
        req,
        actor,
        'update_employee',
        `Data pegawai "${before.name}" (ID: ${recordId}) diperbarui — ${changes}`,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not update the record.' },
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

  const actor = await getAdminUsername(req);
  const { id } = await params;
  const recordId = parseInt(id, 10);
  if (isNaN(recordId)) {
    return NextResponse.json({ success: false, error: 'Invalid ID.' }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(pegawai)
      .where(eq(pegawai.id, recordId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Record not found.' }, { status: 404 });
    }

    if (actor) {
      void logAuditForRequest(
        req,
        actor,
        'delete_employee',
        `Data pegawai "${deleted.name}" (ID: ${recordId}, NIP: ${deleted.nip}) dihapus`,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not delete the record.' },
      { status: 500 }
    );
  }
}