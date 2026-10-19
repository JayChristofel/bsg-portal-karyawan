import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';
import { db } from '@/db';
import { recipients, campaigns } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { csvLine } from '@/lib/csv';
import { parseId } from '@/lib/validate';
import { formatAppDateTime } from '@/lib/time';
import { normalizeWaPhone } from '@/lib/whatsapp';

// Phone numbers are exported as plain digits (62812...). A leading '+' would be read
// as a formula by spreadsheets, and the escaping that prevents that corrupts the number.
const exportPhone = (p: string | null) => (p ? (normalizeWaPhone(p) ?? p.replace(/^[=+\-@]+/, '')) : '');

export async function GET(req: NextRequest) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const format = req.nextUrl.searchParams.get('format') || 'xlsx';
    const rawCampaignId = req.nextUrl.searchParams.get('campaignId');
    const campaignId = rawCampaignId ? parseId(rawCampaignId) : null;
    if (rawCampaignId && campaignId === null) {
      return NextResponse.json({ error: 'Invalid campaignId.' }, { status: 400 });
    }

    const campaignFilter = campaignId !== null ? eq(recipients.campaignId, campaignId) : undefined;

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

    const headers = ['ID', 'Nama', 'No. WhatsApp', 'Cabang', 'Status WA', 'Waktu Kirim (WITA)', 'ID Pesan', 'Kampanye', 'Sudah Isi Form', 'Tanggal Daftar (WITA)'];

    if (format === 'csv') {
      const csvRows = rows.map((r) => [
        r.id,
        r.label,
        exportPhone(r.phone),
        r.cabang || '',
        r.waStatus || 'pending',
        r.waSentAt ? formatAppDateTime(r.waSentAt) : '',
        r.waMessageId || '',
        r.campaignName || '',
        r.isSubmitted ? 'Ya' : 'Tidak',
        formatAppDateTime(r.createdAt),
      ]);

      const csv = [headers, ...csvRows].map(csvLine).join('\r\n');

      // Prepend UTF-8 BOM so Excel opens it with proper UTF-8 decoding
      const csvWithBom = '\uFEFF' + csv;

      await logAuditForRequest(
        req,
        username,
        'export_recipients',
        `Ekspor daftar penerima (${rows.length} baris) format CSV`,
      );

      return new NextResponse(csvWithBom, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="export-recipients-${Date.now()}.csv"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // exceljs replaces xlsx, which had an unpatched prototype-pollution + ReDoS
    // advisory with no fixed version available on the npm registry.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Penerima');

    // exceljs stores JS strings as string cells (never formulas), so no escaping is needed here.
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      ws.addRow([
        r.id,
        String(r.label ?? ''),
        exportPhone(r.phone),
        String(r.cabang ?? ''),
        String(r.waStatus ?? 'pending'),
        r.waSentAt ? formatAppDateTime(r.waSentAt) : '',
        String(r.waMessageId ?? ''),
        String(r.campaignName ?? ''),
        r.isSubmitted ? 'Ya' : 'Tidak',
        formatAppDateTime(r.createdAt),
      ]);
    }

    ws.columns.forEach((col) => {
      col.width = 22;
    });
    ws.getColumn(2).width = 30;

    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    await logAuditForRequest(
      req,
      username,
      'export_recipients',
      `Ekspor daftar penerima (${rows.length} baris) format XLSX`,
    );

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="export-recipients-${Date.now()}.xlsx"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Could not export the data' }, { status: 500 });
  }
}
