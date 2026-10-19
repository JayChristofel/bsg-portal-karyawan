import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logAuditForRequest, describeChanges } from '@/lib/audit';
import { DECRYPT_FAILED } from '@/lib/crypto';
import { readJsonObject, str, parseId } from '@/lib/validate';

const SENSITIVE_FIELDS = ['nip', 'jabatanSk', 'jabatanSekarang', 'cabang'];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getAdminUsername(req);
  if (!actor) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  const { id } = await params;
  const recordId = parseId(id);
  if (recordId === null) {
    return NextResponse.json({ success: false, error: 'Invalid ID.' }, { status: 400 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const name = str(body.name, 200);
    const nip = str(body.nip ?? body.nik, 50);
    const jabatanSk = str(body.jabatan_sk ?? body.jabatanSk, 200);
    const jabatanSekarang = str(body.jabatan_sekarang ?? body.jabatanSekarang, 200);
    const cabang = str(body.cabang, 200);

    if (!name || !nip || !jabatanSk || !jabatanSekarang || !cabang) {
      return NextResponse.json(
        { success: false, error: 'All fields are required.' },
        { status: 400 }
      );
    }

    if ([nip, jabatanSk, jabatanSekarang, cabang].includes(DECRYPT_FAILED)) {
      return NextResponse.json(
        { success: false, error: 'Nilai asli tidak dapat dibaca; isi ulang field yang bertanda [GAGAL DEKRIPSI].' },
        { status: 400 },
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
      SENSITIVE_FIELDS,
    );

    if (actor) {
      await logAuditForRequest(
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
  const actor = await getAdminUsername(req);
  if (!actor) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  const { id } = await params;
  const recordId = parseId(id);
  if (recordId === null) {
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
      await logAuditForRequest(
        req,
        actor,
        'delete_employee',
        `Data pegawai "${deleted.name}" (ID: ${recordId}) dihapus`,
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