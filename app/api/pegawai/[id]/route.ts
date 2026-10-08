import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';

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

  const { id } = await params;
  const recordId = parseInt(id, 10);
  if (isNaN(recordId)) {
    return NextResponse.json({ success: false, error: 'ID tidak valid.' }, { status: 400 });
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
        { success: false, error: 'Semua kolom wajib diisi.' },
        { status: 400 }
      );
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

  const { id } = await params;
  const recordId = parseInt(id, 10);
  if (isNaN(recordId)) {
    return NextResponse.json({ success: false, error: 'ID tidak valid.' }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(pegawai)
      .where(eq(pegawai.id, recordId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Record not found.' }, { status: 404 });
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
