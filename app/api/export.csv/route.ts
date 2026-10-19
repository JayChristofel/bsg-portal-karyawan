import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';
import { csvLine } from '@/lib/csv';
import { formatAppDateTime } from '@/lib/time';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
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

    const lines: string[] = [csvLine(headers)];

    for (const r of rows) {
      const timeStr = r.createdAt ? formatAppDateTime(r.createdAt) + ' WITA' : '';

      lines.push(
        csvLine([
          timeStr,
          r.name,
          r.nip,
          r.jabatanSk,
          r.jabatanSekarang,
          r.cabang,
          r.ipAddress || '',
          r.deviceType || '',
          r.os || '',
          r.browser || '',
          r.screenResolution || '',
          r.language || '',
          r.referrer || '',
          r.sessionId || '',
          r.event || 'submit',
          r.timeOnPage ?? 0,
          r.pagePath || '/',
          r.asnIsp || '',
          r.approxLocation || '',
          r.connectionType || '',
          r.userAgent || '',
        ])
      );
    }

    // Prepend UTF-8 BOM so Excel opens it with proper UTF-8 decoding
    const csvContent = '\uFEFF' + lines.join('\r\n');

    const actor = await getAdminUsername(req);
    if (actor) {
      await logAuditForRequest(
        req,
        actor,
        'export_employee_records',
        `Ekspor rekap data pegawai + telemetri (${rows.length} baris)`,
      );
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="rekap_data_pegawai_telemetri.csv"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    console.error('Export CSV error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not export CSV.' },
      { status: 500 }
    );
  }
}
