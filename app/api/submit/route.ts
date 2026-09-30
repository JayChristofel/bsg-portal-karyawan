import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { getClientIp, getUserAgent, checkRateLimit } from '@/lib/proxy';

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const userAgent = getUserAgent(req);

  // Rate limit: max 5 requests per 60s per IP
  const rateLimit = checkRateLimit(`submit_${clientIp}`, 60, 5);
  if (rateLimit.limited) {
    return NextResponse.json(
      { success: false, error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();

    const name = (body.name || '').trim().slice(0, 200);
    const nip = (body.nip || body.nik || '').trim().slice(0, 50);
    const jabatanSk = (body.jabatan_sk || body.jabatanSk || '').trim().slice(0, 200);
    const jabatanSekarang = (body.jabatan_sekarang || body.jabatanSekarang || '').trim().slice(0, 200);
    const cabang = (body.cabang || '').trim().slice(0, 200);
    const token = (body.token || '').trim().slice(0, 64) || null;

    if (!name || !nip || !jabatanSk || !jabatanSekarang || !cabang) {
      return NextResponse.json(
        { success: false, error: 'Semua kolom wajib diisi.' },
        { status: 400 }
      );
    }

    // Insert record with AES-256-GCM encryption on sensitive columns handled by customType
    await db.insert(pegawai).values({
      name,
      nip,
      jabatanSk,
      jabatanSekarang,
      cabang,
      ipAddress: clientIp,
      userAgent: userAgent,
      token,
    });

    return NextResponse.json({ success: true, message: 'Data recorded' });
  } catch (error: any) {
    console.error('Submit error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal menyimpan data ke database.' },
      { status: 500 }
    );
  }
}
