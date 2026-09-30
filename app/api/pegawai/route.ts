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
        created_at: r.createdAt
          ? new Date(r.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA'
          : '-',
        created_at_raw: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        name: r.name,
        nip: r.nip,
        jabatan_sk: r.jabatanSk,
        jabatan_sekarang: r.jabatanSekarang,
        cabang: r.cabang,
        ip_address: r.ipAddress,
        user_agent: r.userAgent,
        device_type: r.deviceType || 'Desktop',
        os: r.os || 'Windows/Android',
        browser: r.browser || 'Browser',
        screen_resolution: r.screenResolution || '-',
        language: r.language || 'id-ID',
        referrer: r.referrer || 'Direct / WhatsApp',
        session_id: r.sessionId || '-',
        event: r.event || 'submit',
        time_on_page: r.timeOnPage ?? 0,
        page_path: r.pagePath || '/',
        asn_isp: r.asnIsp || 'Jaringan Seluler / ISP Lokal',
        approx_location: r.approxLocation || 'Sulawesi Utara, ID',
        connection_type: r.connectionType || 'Wi-Fi / Mobile',
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
      deviceType: 'Desktop (Admin)',
      os: 'Admin Console',
      browser: 'Admin Console',
      screenResolution: '-',
      language: 'id-ID',
      referrer: 'Admin Portal',
      event: 'manual_entry',
      timeOnPage: 0,
      pagePath: '/admin/pegawai',
      asnIsp: 'Internal Network',
      approxLocation: 'Kantor Pusat Bank SulutGo',
      connectionType: 'LAN / Corporate',
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
