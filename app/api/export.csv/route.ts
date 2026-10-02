import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';

function escapeCsvCell(cell: string | number | null | undefined): string {
  if (cell == null) return '""';
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ success: false, error: 'Belum login.' }, { status: 401 });
  }

  try {
    const rows = await db.select().from(pegawai).orderBy(desc(pegawai.createdAt));

    const headers = [
      'Timestamp (WITA)',
      'Nama Pegawai',
      'Nomor Induk Karyawan',
      'Jabatan sesuai SK',
      'Jabatan saat ini',
      'Kantor Cabang',
      'IP Address',
      'Device Type',
      'Operating System',
      'Browser',
      'Screen Resolution',
      'Language/Locale',
      'Referrer',
      'Session ID',
      'Event',
      'Time on Page (detik)',
      'Page Path',
      'ASN / ISP',
      'Approx. Location',
      'Connection Type',
      'Raw User-Agent',
    ];

    const lines: string[] = [headers.map(escapeCsvCell).join(',')];

    for (const r of rows) {
      const timeStr = r.createdAt
        ? new Date(r.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA'
        : '-';

      lines.push(
        [
          timeStr,
          r.name,
          r.nip,
          r.jabatanSk,
          r.jabatanSekarang,
          r.cabang,
          r.ipAddress || '-',
          r.deviceType || 'Desktop',
          r.os || '-',
          r.browser || '-',
          r.screenResolution || '-',
          r.language || 'id-ID',
          r.referrer || 'Direct',
          r.sessionId || '-',
          r.event || 'submit',
          r.timeOnPage ?? 0,
          r.pagePath || '/',
          r.asnIsp || '-',
          r.approxLocation || '-',
          r.connectionType || '-',
          r.userAgent || '-',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    // Prepend UTF-8 BOM so Excel opens it with proper UTF-8 decoding
    const csvContent = '\uFEFF' + lines.join('\r\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=rekap_data_pegawai_telemetri.csv',
      },
    });
  } catch (error: any) {
    console.error('Export CSV error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengekspor CSV.' },
      { status: 500 }
    );
  }
}
