import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import {
  getClientIp,
  getUserAgent,
  parseUserAgent,
  getApproxLocation,
  getAsnIsp,
  checkRateLimit,
} from '@/lib/proxy';

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

    if (!name || !nip || !jabatanSk || !jabatanSekarang || !cabang) {
      return NextResponse.json(
        { success: false, error: 'Semua kolom wajib diisi.' },
        { status: 400 }
      );
    }

    // Telemetry & Environment Enrichment
    const parsedUa = parseUserAgent(userAgent);

    const deviceType = (body.device_type || parsedUa.deviceType || 'Desktop').slice(0, 50);
    const os = (body.os || parsedUa.os || 'Unknown OS').slice(0, 50);
    const browser = (body.browser || parsedUa.browser || 'Unknown Browser').slice(0, 50);
    const screenResolution = (body.screen_resolution || '').slice(0, 50) || '-';
    const language = (body.language || 'id-ID').slice(0, 30);
    const referrer = (body.referrer || req.headers.get('referer') || 'Direct / WhatsApp').slice(0, 255);
    const sessionId = (body.session_id || '').slice(0, 100) || null;
    const event = (body.event || 'submit').slice(0, 50);
    const timeOnPage = typeof body.time_on_page === 'number' ? Math.max(0, Math.round(body.time_on_page)) : 0;
    const pagePath = (body.page_path || '/').slice(0, 100);
    const connectionType = (body.connection_type || 'Cellular / Wi-Fi').slice(0, 50);
    const approxLocation = (body.approx_location || getApproxLocation(req)).slice(0, 150);
    const asnIsp = (body.asn_isp || getAsnIsp(req)).slice(0, 150);

    // Insert record with AES-256-GCM encryption on sensitive columns handled by customType
    await db.insert(pegawai).values({
      name,
      nip,
      jabatanSk,
      jabatanSekarang,
      cabang,
      ipAddress: clientIp,
      userAgent: userAgent,
      deviceType,
      os,
      browser,
      screenResolution,
      language,
      referrer,
      sessionId,
      event,
      timeOnPage,
      pagePath,
      asnIsp,
      approxLocation,
      connectionType,
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
