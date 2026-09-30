import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';

async function checkAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const session = await checkAuth(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Belum login.' }, { status: 401 });
  }

  try {
    const rows = await db.select().from(pegawai).orderBy(desc(pegawai.createdAt));

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        created_at: r.createdAt ? new Date(r.createdAt).toLocaleString('id-ID') : '-',
        name: r.name,
        nip: r.nip,
        jabatan_sk: r.jabatanSk,
        jabatan_sekarang: r.jabatanSekarang,
        cabang: r.cabang,
        ip_address: r.ipAddress,
        user_agent: r.userAgent,
        token: r.token,
      }))
    );
  } catch (error: any) {
    console.error('Fetch data pegawai error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data dari database.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await checkAuth(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Belum login.' }, { status: 401 });
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

    await db.insert(pegawai).values({
      name,
      nip,
      jabatanSk,
      jabatanSekarang,
      cabang,
      ipAddress: '-',
      userAgent: `Admin manual (${session.username})`,
      token: null,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Manual insert error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal menambah data ke database.' },
      { status: 500 }
    );
  }
}
