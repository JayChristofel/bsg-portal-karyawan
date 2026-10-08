import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { recipients, campaigns } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Neutralise spreadsheet formula injection (Excel/LibreOffice evaluate a leading
 * '=' / '+' / '-' / '@' even inside quoted cells). Recipient labels come from
 * imported spreadsheets, so they are not trusted input.
 */
function escapeCsvCell(cell: unknown): string {
  if (cell == null) return '""';
  let str = String(cell);
  str = str.replace(/[\r\n]+/g, ' ');
  if (FORMULA_TRIGGER.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const format = req.nextUrl.searchParams.get('format') || 'xlsx';
    const campaignId = req.nextUrl.searchParams.get('campaignId');

    const campaignFilter = campaignId ? eq(recipients.campaignId, Number(campaignId)) : undefined;

    const rows = await db
      .select({
        id: recipients.id,
        label: recipients.label,
        phone: recipients.phone,
        cabang: recipients.cabang,
        waStatus: recipients.waStatus,
        waSentAt: recipients.waSentAt,
        waMessageId: recipients.waMessageId,
        campaignId: recipients.campaignId,
        campaignName: campaigns.name,
        isSubmitted: sql<boolean>`EXISTS(SELECT 1 FROM pegawai p WHERE lower(trim(p.name)) = lower(trim(${recipients.label})))`,
        createdAt: recipients.createdAt,
      })
      .from(recipients)
      .leftJoin(campaigns, eq(recipients.campaignId, campaigns.id))
      .where(campaignFilter);

    if (format === 'csv') {
      const headers = ['ID', 'Nama', 'No. WhatsApp', 'Cabang', 'Status WA', 'Waktu Kirim', 'ID Pesan', 'Kampanye', 'Sudah Isi Form', 'Tanggal Daftar'];
      const csvRows = rows.map((r) => [
        r.id,
        r.label,
        r.phone || '',
        r.cabang || '',
        r.waStatus || 'pending',
        r.waSentAt ? new Date(r.waSentAt).toLocaleString('id-ID') : '',
        r.waMessageId || '',
        r.campaignName || '',
        r.isSubmitted ? 'Ya' : 'Tidak',
        new Date(r.createdAt).toLocaleString('id-ID'),
      ]);

      const csv = [headers, ...csvRows]
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
        .join('\r\n');

      // Prepend UTF-8 BOM so Excel opens it with proper UTF-8 decoding
      const csvWithBom = '\uFEFF' + csv;

      return new NextResponse(csvWithBom, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="export-penerima-${Date.now()}.csv"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const headers = ['ID', 'Nama', 'No. WhatsApp', 'Cabang', 'Status WA', 'Waktu Kirim', 'ID Pesan', 'Kampanye', 'Sudah Isi Form', 'Tanggal Daftar'];

    // exceljs replaces xlsx, which had an unpatched prototype-pollution + ReDoS
    // advisory with no fixed version available on the npm registry.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Penerima');

    // Force text cells so Excel never coerces a value into a formula.
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      ws.addRow([
        r.id,
        String(r.label ?? ''),
        String(r.phone ?? ''),
        String(r.cabang ?? ''),
        String(r.waStatus ?? 'pending'),
        r.waSentAt ? new Date(r.waSentAt).toLocaleString('id-ID') : '',
        String(r.waMessageId ?? ''),
        String(r.campaignName ?? ''),
        r.isSubmitted ? 'Ya' : 'Tidak',
        new Date(r.createdAt).toLocaleString('id-ID'),
      ]);
    }

    ws.columns.forEach((col) => {
      col.width = 22;
    });
    ws.getColumn(2).width = 30;

    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="export-penerima-${Date.now()}.xlsx"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Could not export the data' }, { status: 500 });
  }
}
